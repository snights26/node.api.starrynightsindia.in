import { Router } from "express";
import { queryOne } from "../../db/pool.js";
import { asyncRoute, notFound } from "../../lib/api.js";
import { storageService } from "../../services/blob-storage.js";

export const legacyUploadRouter = Router();

type LegacyNotification = { target_type: string; target_user_id: string | null };

const pathValue = (value: string | string[] | undefined): string => Array.isArray(value) ? value.join("/") : value ?? "";

const isAdministrator = (role: string | undefined): boolean => role === "ADMIN" || role === "SUPER_ADMIN";

/**
 * Historical database values stay as `/api/uploads/...`. The archive itself
 * is migrated into private Blob storage; this route authorizes first and then
 * issues a short-lived signed download URL. Unknown paths intentionally 404.
 */
legacyUploadRouter.get("/{*legacyPath}", asyncRoute(async (request, response) => {
  const relativePath = pathValue(request.params.legacyPath as string | string[] | undefined);
  if (!relativePath) throw notFound("Stored file was not found");
  const legacyUrl = `/api/uploads/${relativePath}`;

  const career = await queryOne<{ id: string }>(
    "SELECT id FROM career_applications WHERE deleted=FALSE AND resume_url=$1",
    [legacyUrl],
  );
  if (career) {
    if (!isAdministrator(request.auth?.role)) throw notFound("Stored file was not found");
  } else {
    const notification = await queryOne<LegacyNotification>(
      "SELECT target_type,target_user_id FROM notifications WHERE deleted=FALSE AND pdf_url=$1",
      [legacyUrl],
    );
    if (!notification) throw notFound("Stored file was not found");
    const target = notification.target_type.trim().toLowerCase();
    const isPublic = target === "all" || target === "public";
    const belongsToUser = Boolean(request.auth && notification.target_user_id === request.auth.id);
    if (!isPublic && !belongsToUser && !isAdministrator(request.auth?.role)) throw notFound("Stored file was not found");
  }

  const downloadUrl = await storageService.getDownloadAuthorization(
    storageService.privateReference(storageService.resolveLegacyPath(legacyUrl)),
    "private",
  );
  response.setHeader("Cache-Control", "private, no-store");
  response.redirect(302, downloadUrl);
}));
