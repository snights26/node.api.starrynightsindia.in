import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, queryOne, transaction } from "../../db/pool.js";
import { asyncRoute, badRequest, conflict, created, forbidden, message, notFound, ok, validateBody } from "../../lib/api.js";
import { authenticate, requireRole, requireAnyRole, type Role } from "../../lib/auth.js";
import { booleanValue, firstString, isoDate, optionalString, stringList, type JsonObject } from "../../lib/values.js";
import { mapPackageSummary } from "../catalog/mapper.js";
import { listPackages } from "../catalog/repository.js";
import type { PackageRow } from "../catalog/types.js";
import { sendProfileCompletedEmail } from "../../services/mail.js";

export const usersRouter = Router();

type UserRow = {
  id: string; user_id: string; name: string; email: string; password_hash: string; role: Role; contact: string | null;
  dob: string | null; id_type: string | null; id_number: string | null; emergency_name: string | null; emergency_contact: string | null;
  city: string | null; state: string | null; country: string | null; pincode: string | null; profile_image_url: string | null;
  gender: string | null; preferred_destinations: string | null; preferred_travel_style: string | null; travel_preferences: string | null;
  profile_completed: boolean; auth_provider: string | null; email_verified: boolean; created_at: Date | string; updated_at: Date | string; enabled: boolean; deleted: boolean;
};

const selectUser = `SELECT id, user_id, name, email, password_hash, role, contact, dob, id_type, id_number, emergency_name, emergency_contact,
  city, state, country, pincode, profile_image_url, gender, preferred_destinations, preferred_travel_style, travel_preferences,
  profile_completed, auth_provider, email_verified, created_at, updated_at, enabled, deleted FROM app_users`;

const userBody = z.object({
  userId: z.string().trim().max(40).optional(), id: z.string().trim().max(40).optional(), email: z.string().trim().email().max(255).optional(), password: z.string().min(1).max(255).optional(),
  name: z.string().trim().max(255).optional(), fullName: z.string().trim().max(255).optional(), contact: z.string().trim().max(255).optional(), mobile: z.string().trim().max(255).optional(), phone: z.string().trim().max(255).optional(),
  dob: z.string().trim().max(10).optional(), idType: z.string().trim().max(255).optional(), idNumber: z.string().trim().max(255).optional(), emergencyName: z.string().trim().max(255).optional(), emergencyContact: z.string().trim().max(255).optional(),
  city: z.string().trim().max(255).optional(), state: z.string().trim().max(255).optional(), country: z.string().trim().max(255).optional(), pincode: z.string().trim().max(255).optional(),
  profileImageUrl: z.string().trim().max(2000).optional(), profileImage: z.string().trim().max(2000).optional(), photo: z.string().trim().max(2000).optional(), gender: z.string().trim().max(255).optional(),
  preferredDestinations: z.string().max(10000).optional(), preferredTravelStyle: z.string().trim().max(255).optional(), travelPreferences: z.string().max(10000).optional(),
  profileCompleted: z.union([z.boolean(), z.string(), z.number()]).optional(), role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(), packageCodes: z.array(z.string().trim().max(60)).optional(),
}).passthrough();

const mapUser = (user: UserRow): Record<string, unknown> => ({
  id: user.id, userId: user.user_id, name: user.name ?? "", email: user.email ?? "", contact: user.contact ?? "", mobile: user.contact ?? "", role: user.role,
  dob: user.dob ?? "", idType: user.id_type ?? "", idNumber: user.id_number ?? "", emergencyName: user.emergency_name ?? "", emergencyContact: user.emergency_contact ?? "",
  city: user.city ?? "", state: user.state ?? "", country: user.country ?? "", pincode: user.pincode ?? "", profileImage: user.profile_image_url ?? "", photo: user.profile_image_url ?? "",
  gender: user.gender ?? "", preferredDestinations: user.preferred_destinations ?? "", preferredTravelStyle: user.preferred_travel_style ?? "", travelPreferences: user.travel_preferences ?? "",
  profileCompleted: user.profile_completed, authProvider: user.auth_provider ?? "", emailVerified: user.email_verified,
  createdAt: isoDate(user.created_at), updatedAt: isoDate(user.updated_at),
});

const findUser = async (identifier: string): Promise<UserRow> => {
  const user = await queryOne<UserRow>(`${selectUser} WHERE (id::text = $1 OR LOWER(user_id) = LOWER($1) OR LOWER(email) = LOWER($1))`, [identifier]);
  if (!user) throw notFound("User not found");
  return user;
};

const currentUser = async (id: string): Promise<UserRow> => {
  const user = await queryOne<UserRow>(`${selectUser} WHERE id = $1 AND deleted = FALSE AND enabled = TRUE`, [id]);
  if (!user) throw notFound("User not found");
  return user;
};

const meetsProfileRequirements = (body: JsonObject, existing?: UserRow): boolean => Boolean(
  firstString(body, "name", "fullName") || existing?.name,
) && Boolean(firstString(body, "email") || existing?.email) && Boolean(firstString(body, "contact", "mobile", "phone") || existing?.contact)
  && Boolean(firstString(body, "country") || existing?.country) && Boolean(firstString(body, "state") || existing?.state) && Boolean(firstString(body, "city") || existing?.city);

const updateUser = async (user: UserRow, body: JsonObject, forceComplete = false): Promise<UserRow> => {
  const profileCompleted = forceComplete ? meetsProfileRequirements(body, user) : (meetsProfileRequirements(body, user) || user.profile_completed);
  if (forceComplete && !profileCompleted) throw badRequest("Name, email, mobile, country, state, and city are required");
  await queryOne(`UPDATE app_users SET name = $1, contact = $2, dob = $3, id_type = $4, id_number = $5, emergency_name = $6, emergency_contact = $7,
    city = $8, state = $9, country = $10, pincode = $11, profile_image_url = $12, gender = $13, preferred_destinations = $14, preferred_travel_style = $15,
    travel_preferences = $16, profile_completed = $17, updated_at = NOW() WHERE id = $18`, [
    firstString(body, "name", "fullName"), optionalString(body, "contact", "mobile", "phone"), optionalString(body, "dob"), optionalString(body, "idType"), optionalString(body, "idNumber"),
    optionalString(body, "emergencyName"), optionalString(body, "emergencyContact"), optionalString(body, "city"), optionalString(body, "state"), optionalString(body, "country"), optionalString(body, "pincode"),
    optionalString(body, "profileImageUrl", "profileImage", "photo"), optionalString(body, "gender"), optionalString(body, "preferredDestinations"), optionalString(body, "preferredTravelStyle"), optionalString(body, "travelPreferences"),
    body.profileCompleted === undefined ? profileCompleted : booleanValue(body.profileCompleted), user.id,
  ]);
  return currentUser(user.id);
};

const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";

usersRouter.get("/users", authenticate, requireAnyRole("ADMIN", "SUPER_ADMIN"), asyncRoute(async (_request, response) => {
  response.json(ok((await query<UserRow>(`${selectUser} WHERE role = 'USER' AND deleted = FALSE ORDER BY created_at DESC`)).map(mapUser)));
}));

usersRouter.get("/users/me", authenticate, asyncRoute(async (request, response) => {
  response.json(ok(mapUser(await currentUser(request.auth!.id))));
}));

usersRouter.get("/users/liked-packages/report", authenticate, requireAnyRole("ADMIN", "SUPER_ADMIN"), asyncRoute(async (_request, response) => {
  const users = await query<UserRow>(`${selectUser} WHERE role = 'USER' AND deleted = FALSE ORDER BY created_at DESC`);
  const result = await Promise.all(users.map(async (user) => ({
    id: user.id, userId: user.user_id, name: user.name, email: user.email, contact: user.contact ?? "",
    likedPackages: await likedPackages(user.id),
  })));
  response.json(ok(result));
}));

const likedPackages = async (userId: string): Promise<Record<string, unknown>[]> => {
  const packages = await query<PackageRow>(`SELECT p.*,
    COALESCE(json_agg(json_build_object('code', c.code, 'name', c.name, 'isSubcategory', c.sub_category, 'parentCode', parent.code, 'parentName', parent.name) ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS categories
    FROM user_bucket_list b JOIN travel_packages p ON p.id = b.package_id
    LEFT JOIN package_categories pc ON pc.package_id = p.id LEFT JOIN categories c ON c.id = pc.category_id AND c.deleted = FALSE LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE b.user_id = $1 AND p.deleted = FALSE GROUP BY p.id ORDER BY p.hero_title`, [userId]);
  return packages.map(mapPackageSummary);
};

usersRouter.put("/users/me/complete-profile", authenticate, validateBody(userBody), asyncRoute(async (request, response) => {
  const user = await currentUser(request.auth!.id);
  const updated = await updateUser(user, request.body as JsonObject, true);
  if (!user.profile_completed && updated.profile_completed) await sendProfileCompletedEmail({ to: updated.email, name: updated.name, contact: updated.contact, city: updated.city, state: updated.state, country: updated.country });
  response.json(ok(mapUser(updated)));
}));

usersRouter.get("/users/:id", authenticate, asyncRoute(async (request, response) => {
  const user = await findUser(param(request.params.id));
  if (request.auth!.role === "USER" && user.user_id.toLowerCase() !== request.auth!.userId.toLowerCase()) throw forbidden("Access denied");
  response.json(ok({ ...mapUser(user), likedPackages: await likedPackages(user.id) }));
}));

usersRouter.post("/users", ...superAdmin, validateBody(userBody), asyncRoute(async (request, response) => {
  const body = request.body as JsonObject;
  const role = (firstString(body, "role") || "USER") as Role;
  const id = randomUUID();
  const userId = firstString(body, "userId", "id") || `USR${randomUUID().slice(0, 8).toUpperCase()}`;
  const email = firstString(body, "email");
  if (!email || !firstString(body, "name", "fullName")) throw badRequest("Name and email are required");
  const duplicate = await queryOne<{ id: string }>("SELECT id FROM app_users WHERE LOWER(email) = LOWER($1) OR LOWER(user_id) = LOWER($2)", [email, userId]);
  if (duplicate) throw conflict("A user with this email or user ID already exists");
  const passwordHash = await bcrypt.hash(firstString(body, "password") || "User@123", 12);
  await queryOne(`INSERT INTO app_users (id, created_at, updated_at, deleted, user_id, name, email, password_hash, role, contact, city, state, country, pincode, profile_image_url, gender, preferred_destinations, preferred_travel_style, travel_preferences, profile_completed, enabled)
    VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, TRUE)`, [
    id, userId, firstString(body, "name", "fullName"), email, passwordHash, role, optionalString(body, "contact", "mobile", "phone"), optionalString(body, "city"), optionalString(body, "state"), optionalString(body, "country"), optionalString(body, "pincode"),
    optionalString(body, "profileImageUrl", "profileImage", "photo"), optionalString(body, "gender"), optionalString(body, "preferredDestinations"), optionalString(body, "preferredTravelStyle"), optionalString(body, "travelPreferences"), meetsProfileRequirements(body),
  ]);
  response.status(201).json(created(mapUser(await currentUser(id))));
}));

usersRouter.put("/users/:id", authenticate, validateBody(userBody), asyncRoute(async (request, response) => {
  const target = await findUser(param(request.params.id));
  const self = target.id === request.auth!.id;
  if (!self && request.auth!.role !== "SUPER_ADMIN") throw badRequest("Cannot update another user");
  response.json(ok(mapUser(await updateUser(target, request.body as JsonObject))));
}));

usersRouter.delete("/users/:id", ...superAdmin, asyncRoute(async (request, response) => {
  const user = await findUser(param(request.params.id));
  if (user.role !== "USER") throw forbidden("Only regular user accounts can be deleted from Unauthorized Users management");
  const bookings = await queryOne<{ count: string }>("SELECT COUNT(*)::text AS count FROM tour_bookings WHERE user_id = $1", [user.id]);
  if (Number(bookings?.count ?? 0) > 0) throw conflict(`This user has ${bookings!.count} booking record(s) and cannot be permanently deleted`);
  await transaction(async (client) => {
    await client.query("UPDATE gallery_images SET user_id = NULL, updated_at = NOW() WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM package_view_histories WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM notifications WHERE target_user_id = $1", [user.id]);
    await client.query("DELETE FROM app_users WHERE id = $1", [user.id]);
  });
  response.json(message("User deleted"));
}));

usersRouter.get("/users/me/bucket-list", authenticate, asyncRoute(async (request, response) => {
  response.json(ok(await likedPackages(request.auth!.id)));
}));

usersRouter.post("/users/me/bucket-list/:packageCode", authenticate, asyncRoute(async (request, response) => {
  const packages = await listPackages({ packageCodes: [param(request.params.packageCode)] });
  if (!packages[0]) throw notFound("Package not found");
  const found = await queryOne<{ user_id: string }>("SELECT user_id FROM user_bucket_list WHERE user_id = $1 AND package_id = $2", [request.auth!.id, packages[0].id]);
  if (found) await queryOne("DELETE FROM user_bucket_list WHERE user_id = $1 AND package_id = $2", [request.auth!.id, packages[0].id]);
  else await queryOne("INSERT INTO user_bucket_list (user_id, package_id) VALUES ($1, $2)", [request.auth!.id, packages[0].id]);
  response.json(ok(await likedPackages(request.auth!.id)));
}));

usersRouter.put("/users/me/bucket-list", authenticate, validateBody(userBody), asyncRoute(async (request, response) => {
  const codes = stringList((request.body as JsonObject).packageCodes);
  const packages = codes.length ? await listPackages({ packageCodes: codes }) : [];
  await transaction(async (client) => {
    await client.query("DELETE FROM user_bucket_list WHERE user_id = $1", [request.auth!.id]);
    for (const pkg of packages) await client.query("INSERT INTO user_bucket_list (user_id, package_id) VALUES ($1, $2)", [request.auth!.id, pkg.id]);
  });
  response.json(ok(await likedPackages(request.auth!.id)));
}));
