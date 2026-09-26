import jwt, { type JwtPayload } from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { forbidden, unauthorized } from "./api.js";

export const roles = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof roles)[number];

type TokenClaims = JwtPayload & {
  uid?: string;
  userId?: string;
  role?: Role;
  sub?: string;
};

const requireSecret = (): string => {
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured and at least 32 characters long");
  }
  return env.jwtSecret;
};

export const accessExpiryForRole = (role: Role, sessionExpiresAt?: Date): Date => {
  const minutes = role === "USER" ? env.jwtAccessMinutes : env.jwtAdminAccessMinutes;
  const regularExpiry = new Date(Date.now() + minutes * 60_000);
  return sessionExpiresAt && sessionExpiresAt < regularExpiry ? sessionExpiresAt : regularExpiry;
};

export const signAccessToken = (user: { id: string; email: string; userId: string; role: Role }, sessionExpiresAt?: Date): { token: string; expiresAt: Date } => {
  const expiresAt = accessExpiryForRole(user.role, sessionExpiresAt);
  const token = jwt.sign(
    { uid: user.id, userId: user.userId, role: user.role },
    requireSecret(),
    { subject: user.email, algorithm: "HS256", expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) },
  );
  return { token, expiresAt };
};

const parseToken = (raw: string): Required<Pick<TokenClaims, "uid" | "userId" | "role" | "sub">> => {
  const decoded = jwt.verify(raw, requireSecret(), { algorithms: ["HS256"] }) as TokenClaims;
  if (!decoded.uid || !decoded.userId || !decoded.sub || !decoded.role || !roles.includes(decoded.role)) {
    throw unauthorized("Invalid token");
  }
  return { uid: decoded.uid, userId: decoded.userId, role: decoded.role, sub: decoded.sub };
};

export const authenticate = (request: Request, _response: Response, next: NextFunction): void => {
  try {
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized("Authentication required");
    const token = parseToken(header.slice("Bearer ".length));
    request.auth = { id: token.uid, email: token.sub, userId: token.userId, role: token.role };
    next();
  } catch (error) {
    const jwtErrorNames = new Set(["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"]);
    next(error instanceof Error && jwtErrorNames.has(error.name) ? unauthorized("Invalid or expired token") : error);
  }
};

/** Public endpoints may enrich a request with a valid browser token, but retain guest behavior for missing or invalid tokens. */
export const optionalAuthenticate = (request: Request, _response: Response, next: NextFunction): void => {
  try {
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      next();
      return;
    }
    const token = parseToken(header.slice("Bearer ".length));
    request.auth = { id: token.uid, email: token.sub, userId: token.userId, role: token.role };
  } catch {
    // Preserve Spring's public guest-view behavior when a stale optional token is present.
  }
  next();
};

export const requireAnyRole = (...allowed: Role[]) => (request: Request, _response: Response, next: NextFunction): void => {
  if (!request.auth) {
    next(unauthorized("Authentication required"));
    return;
  }
  if (!allowed.includes(request.auth.role)) {
    next(forbidden("Forbidden"));
    return;
  }
  next();
};

export const requireRole = (role: Role) => requireAnyRole(role);

export const restrictedAdminWrite = (request: Request, _response: Response, next: NextFunction): void => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (mutating && request.auth?.role === "ADMIN" && !request.path.startsWith("/tours") && !request.path.startsWith("/auth/")) {
    next(forbidden("READ_ONLY_ADMIN_ACCESS"));
    return;
  }
  next();
};
