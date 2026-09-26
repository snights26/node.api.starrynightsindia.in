import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { env } from "../../config/env.js";
import { queryOne, transaction } from "../../db/pool.js";
import { asyncRoute, badRequest, created, forbidden, message, ok, unauthorized, validateBody } from "../../lib/api.js";
import { type Role, signAccessToken } from "../../lib/auth.js";
import { isAllowedGoogleAudience } from "../../lib/google-audience.js";
import { sendWelcomeEmail } from "../../services/mail.js";

export const authRouter = Router();

type UserRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  contact: string | null;
  password_hash: string;
  role: Role;
  profile_image_url: string | null;
  profile_completed: boolean;
  google_subject: string | null;
  auth_provider: string | null;
  email_verified: boolean;
  enabled: boolean;
  deleted: boolean;
};

type RefreshRow = {
  token: string;
  expires_at: Date;
  revoked: boolean;
} & UserRow;

const loginSchema = z.object({
  username: z.string().trim().optional(),
  email: z.string().trim().optional(),
  password: z.string().min(1),
}).refine((body) => Boolean(body.username || body.email), { message: "username or email is required" });

const googleSchema = z.object({ idToken: z.string().trim().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().trim().min(1) });
const registerSchema = z.object({
  userId: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(255),
  contact: z.string().trim().max(255).optional(),
  city: z.string().trim().max(255).optional(),
  state: z.string().trim().max(255).optional(),
  country: z.string().trim().max(255).optional(),
  pincode: z.string().trim().max(255).optional(),
});

const selectUser = `
  SELECT id, user_id, name, email, contact, password_hash, role, profile_image_url,
         profile_completed, google_subject, auth_provider, email_verified, enabled, deleted
  FROM app_users`;

const userResult = (user: UserRow) => ({
  id: user.id,
  userId: user.user_id,
  name: user.name,
  email: user.email,
  contact: user.contact ?? "",
  role: user.role,
  profileImageUrl: user.profile_image_url ?? "",
  profileCompleted: user.profile_completed,
});

const tokenValue = (): string => `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;

const issueTokens = async (user: UserRow, persistedSessionExpiry?: Date) => {
  const refreshExpiresAt = persistedSessionExpiry ?? new Date(Date.now() + env.jwtRefreshDays * 24 * 60 * 60 * 1000);
  const access = signAccessToken({ id: user.id, email: user.email, userId: user.user_id, role: user.role }, refreshExpiresAt);
  const refreshToken = tokenValue();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO refresh_tokens (id, created_at, updated_at, deleted, user_id, token, expires_at, revoked)
       VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, FALSE)`,
      [randomUUID(), user.id, refreshToken, refreshExpiresAt],
    );
  });
  return {
    accessToken: access.token,
    refreshToken,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    user: userResult(user),
  };
};

const findByIdentifier = async (identifier: string): Promise<UserRow | undefined> =>
  queryOne<UserRow>(`${selectUser} WHERE deleted = FALSE AND (LOWER(email) = LOWER($1) OR LOWER(user_id) = LOWER($1))`, [identifier]);

const authenticatePassword = async (identifier: string, password: string, roles: Role[]): Promise<UserRow> => {
  const user = await findByIdentifier(identifier);
  if (!user || !user.enabled || !roles.includes(user.role) || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized("Invalid credentials");
  }
  return user;
};

authRouter.post("/auth/login", validateBody(loginSchema), asyncRoute(async (request, response) => {
  if (!env.publicPasswordLoginEnabled) throw forbidden("PUBLIC_PASSWORD_LOGIN_DISABLED");
  const body = request.body as z.infer<typeof loginSchema>;
  const user = await authenticatePassword(body.email || body.username || "", body.password, ["USER"]);
  response.json(ok(await issueTokens(user)));
}));

authRouter.post("/auth/admin/login", validateBody(loginSchema), asyncRoute(async (request, response) => {
  const body = request.body as z.infer<typeof loginSchema>;
  const identifiers = [body.email, body.username].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  let user: UserRow | undefined;
  for (const identifier of identifiers) {
    try {
      user = await authenticatePassword(identifier, body.password, ["ADMIN", "SUPER_ADMIN"]);
      break;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Invalid credentials") throw error;
    }
  }
  if (!user) throw unauthorized("Invalid credentials");
  response.json(ok(await issueTokens(user)));
}));

authRouter.post("/auth/register", validateBody(registerSchema), asyncRoute(async (request, response) => {
  if (!env.publicRegistrationEnabled) throw forbidden("PUBLIC_REGISTRATION_DISABLED");
  const body = request.body as z.infer<typeof registerSchema>;
  const duplicate = await queryOne<{ id: string }>("SELECT id FROM app_users WHERE LOWER(email) = LOWER($1)", [body.email]);
  if (duplicate) throw badRequest("Email already registered");
  const id = randomUUID();
  const userId = body.userId || `USR${randomUUID().slice(0, 8).toUpperCase()}`;
  const passwordHash = await bcrypt.hash(body.password, 12);
  const profileCompleted = Boolean(body.contact && body.city && body.state && body.country);
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO app_users (id, created_at, updated_at, deleted, user_id, name, email, password_hash, role, contact, city, state, country, pincode, profile_completed, enabled)
       VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5, 'USER', $6, $7, $8, $9, $10, $11, TRUE)`,
      [id, userId, body.name, body.email, passwordHash, body.contact ?? null, body.city ?? null, body.state ?? null, body.country ?? null, body.pincode ?? null, profileCompleted],
    );
  });
  const user = await queryOne<UserRow>(`${selectUser} WHERE id = $1`, [id]);
  if (!user) throw new Error("Created user could not be loaded");
  await sendWelcomeEmail({ to: user.email, name: user.name });
  response.status(201).json(created(await issueTokens(user)));
}));

let googleClient: OAuth2Client | undefined;
const getGoogleClient = (): OAuth2Client => {
  if (!env.googleAuthEnabled || env.googleAllowedClientIds.length === 0) throw forbidden("Google sign-in is not configured");
  googleClient ??= new OAuth2Client();
  return googleClient;
};

authRouter.post("/auth/google", validateBody(googleSchema), asyncRoute(async (request, response) => {
  const body = request.body as z.infer<typeof googleSchema>;
  const ticket = await getGoogleClient().verifyIdToken({ idToken: body.idToken, audience: env.googleAllowedClientIds });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified || !isAllowedGoogleAudience(env.googleAllowedClientIds, payload.aud, payload.azp) || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss ?? "")) {
    throw unauthorized("Invalid Google identity token");
  }
  let createdWithGoogle = false;
  let user = await queryOne<UserRow>(`${selectUser} WHERE google_subject = $1 OR LOWER(email) = LOWER($2) ORDER BY google_subject = $1 DESC LIMIT 1`, [payload.sub, payload.email]);
  if (user && !user.deleted && user.role !== "USER") throw forbidden("ADMIN_LOGIN_REQUIRED");
  if (user && !user.enabled && !user.deleted) throw unauthorized("User is not active");
  if (!user) {
    const id = randomUUID();
    const userId = `USR${randomUUID().slice(0, 8).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    await queryOne(
      `INSERT INTO app_users (id, created_at, updated_at, deleted, user_id, name, email, password_hash, role, profile_completed, google_subject, auth_provider, email_verified, enabled)
       VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5, 'USER', FALSE, $6, 'GOOGLE', TRUE, TRUE)`,
      [id, userId, payload.name?.trim() || payload.email, payload.email, passwordHash, payload.sub],
    );
    user = await queryOne<UserRow>(`${selectUser} WHERE id = $1`, [id]);
    createdWithGoogle = true;
  } else {
    await queryOne(
      `UPDATE app_users SET deleted = FALSE, enabled = TRUE, google_subject = $1, email_verified = TRUE, auth_provider = 'GOOGLE',
       name = CASE WHEN name IS NULL OR BTRIM(name) = '' THEN $2 ELSE name END, updated_at = NOW() WHERE id = $3`,
      [payload.sub, payload.name?.trim() || payload.email, user.id],
    );
    user = await queryOne<UserRow>(`${selectUser} WHERE id = $1`, [user.id]);
  }
  if (!user) throw new Error("Google user could not be loaded");
  if (createdWithGoogle) await sendWelcomeEmail({ to: user.email, name: user.name });
  response.json(ok(await issueTokens(user)));
}));

authRouter.post("/auth/refresh", validateBody(refreshSchema), asyncRoute(async (request, response) => {
  const body = request.body as z.infer<typeof refreshSchema>;
  const token = await queryOne<RefreshRow>(
    `SELECT token, expires_at, revoked, u.id, u.user_id, u.name, u.email, u.contact, u.password_hash, u.role,
            u.profile_image_url, u.profile_completed, u.google_subject, u.auth_provider, u.email_verified, u.enabled, u.deleted
       FROM refresh_tokens rt JOIN app_users u ON u.id = rt.user_id WHERE rt.token = $1`,
    [body.refreshToken],
  );
  if (!token || token.revoked || token.expires_at <= new Date() || token.deleted || !token.enabled) throw unauthorized("Refresh token expired");
  if (token.role === "USER" && (token.auth_provider?.toUpperCase() !== "GOOGLE" || !token.google_subject)) {
    throw unauthorized("Google sign-in is required");
  }
  response.json(ok(await issueTokens(token, token.expires_at)));
}));

authRouter.post("/auth/logout", validateBody(refreshSchema), asyncRoute(async (request, response) => {
  const body = request.body as z.infer<typeof refreshSchema>;
  await queryOne("UPDATE refresh_tokens SET revoked = TRUE, updated_at = NOW() WHERE token = $1", [body.refreshToken]);
  response.json(message("Logged out"));
}));
