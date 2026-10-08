import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../../db/pool.js";
import { AppError, asyncRoute, badRequest, created, message, notFound, ok, validateBody } from "../../lib/api.js";
import { authenticate, requireRole } from "../../lib/auth.js";
import {
  createAndroidReleaseUploadAuthorization,
  deleteAndroidReleaseAsset,
  inspectAndroidReleaseAsset,
  isAndroidApkFileName,
} from "../../services/storage.js";
import { assertGreaterVersionCode, publishAfterUpload, type ReleaseCleanupTarget } from "./workflow.js";

export const appReleasesRouter = Router();
const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];

type AppRelease = {
  id: string;
  platform: "android";
  version_name: string;
  version_code: number;
  release_notes: string | null;
  file_name: string;
  file_url: string;
  cloudinary_public_id: string;
  file_size: string | number | null;
  sha256: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

const schemaError = (error: unknown): never => {
  if ((error as { code?: string }).code === "42P01") {
    throw new AppError(503, "Android release storage is not initialized. Apply the app releases migration first.");
  }
  throw error;
};

/** Production schema changes are applied explicitly; API requests never run DDL. */
const requireReleaseSchema = async (): Promise<void> => {
  try {
    await query("SELECT 1 FROM app_releases WHERE platform = 'android' LIMIT 1");
  } catch (error) {
    schemaError(error);
  }
};

const asDate = (value: Date | string): string => new Date(value).toISOString();
const asFileSize = (value: string | number | null): number | null => value === null ? null : Number(value);

const mapRelease = (release: AppRelease): Record<string, unknown> => ({
  id: release.id,
  platform: release.platform,
  versionName: release.version_name,
  versionCode: release.version_code,
  releaseNotes: release.release_notes,
  fileName: release.file_name,
  downloadUrl: release.file_url,
  cloudinaryPublicId: release.cloudinary_public_id,
  fileSize: asFileSize(release.file_size),
  sha256: release.sha256,
  isActive: release.is_active,
  createdAt: asDate(release.created_at),
  updatedAt: asDate(release.updated_at),
});

const mapPublicRelease = (release: AppRelease): Record<string, unknown> => {
  const { cloudinaryPublicId: _cloudinaryPublicId, isActive: _isActive, ...publicRelease } = mapRelease(release);
  return publicRelease;
};

const uploadAuthorizationSchema = z.object({
  fileName: z.string().trim().min(5).max(255).refine(isAndroidApkFileName, "Only Android APK files are supported"),
  contentType: z.string().trim().min(1).max(160),
  fileSize: z.number().int().positive(),
}).strict();

const publishSchema = z.object({
  versionName: z.string().trim().min(1).max(80),
  versionCode: z.number().int().positive(),
  releaseNotes: z.string().trim().max(8_000).optional().nullable(),
  fileName: z.string().trim().min(5).max(255).refine(isAndroidApkFileName, "Only Android APK files are supported"),
  cloudinaryPublicId: z.string().trim().min(1).max(600),
  sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/, "SHA-256 must be a 64-character hexadecimal digest"),
}).strict();

const idFromParams = (value: string | string[] | undefined): string => {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id || !z.string().uuid().safeParse(id).success) throw badRequest("Invalid release identifier");
  return id;
};

const activeRelease = async (): Promise<AppRelease | undefined> => queryOne<AppRelease>(
  "SELECT * FROM app_releases WHERE platform='android' AND is_active=TRUE LIMIT 1",
);

appReleasesRouter.get("/app-releases/android/current", asyncRoute(async (_request, response) => {
  await requireReleaseSchema();
  const release = await activeRelease();
  if (!release) throw notFound("No active Android release is currently available");
  response.json(ok(mapPublicRelease(release)));
}));

appReleasesRouter.get("/admin/app-releases/android", ...superAdmin, asyncRoute(async (_request, response) => {
  await requireReleaseSchema();
  const releases = await query<AppRelease>("SELECT * FROM app_releases WHERE platform='android' ORDER BY is_active DESC, created_at DESC");
  response.json(ok(releases.map(mapRelease)));
}));

appReleasesRouter.post("/admin/app-releases/android/authorize-upload", ...superAdmin, validateBody(uploadAuthorizationSchema), asyncRoute(async (request, response) => {
  await requireReleaseSchema();
  response.json(ok(createAndroidReleaseUploadAuthorization(request.body as z.infer<typeof uploadAuthorizationSchema>)));
}));

appReleasesRouter.post("/admin/app-releases/android/publish", ...superAdmin, validateBody(publishSchema), asyncRoute(async (request, response) => {
  await requireReleaseSchema();
  const body = request.body as z.infer<typeof publishSchema>;
  // Cloudinary is the source of truth for object existence, type, URL and size.
  // Do this before the transaction so a bad upload cannot change the active row.
  const asset = await inspectAndroidReleaseAsset(body.cloudinaryPublicId);

  const result = await publishAfterUpload({
    activate: async () => transaction(async (client) => {
      const currentResult = await client.query<AppRelease>(
        "SELECT * FROM app_releases WHERE platform='android' AND is_active=TRUE FOR UPDATE",
      );
      const current = currentResult.rows[0];
      assertGreaterVersionCode(current?.version_code, body.versionCode);
      if (current) await client.query("UPDATE app_releases SET is_active=FALSE,updated_at=NOW() WHERE id=$1", [current.id]);
      const id = randomUUID();
      const inserted = await client.query<AppRelease>(
        `INSERT INTO app_releases
          (id,platform,version_name,version_code,release_notes,file_name,file_url,cloudinary_public_id,file_size,sha256,is_active,created_at,updated_at)
         VALUES ($1,'android',$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW(),NOW()) RETURNING *`,
        [id, body.versionName, body.versionCode, body.releaseNotes?.trim() || null, body.fileName, asset.url, asset.publicId, asset.fileSize, body.sha256.toLowerCase()],
      );
      const active = inserted.rows[0];
      if (!active) throw new AppError(500, "Unable to activate the Android release");
      const previous: ReleaseCleanupTarget | undefined = current
        ? { id: current.id, cloudinaryPublicId: current.cloudinary_public_id }
        : undefined;
      return { active, previous };
    }),
    discardNewAsset: () => deleteAndroidReleaseAsset(asset.publicId),
    deleteOldAsset: (previous) => deleteAndroidReleaseAsset(previous.cloudinaryPublicId),
    deleteOldRow: async (previous) => {
      await transaction(async (client) => {
        const deleted = await client.query("DELETE FROM app_releases WHERE id=$1 AND platform='android' AND is_active=FALSE", [previous.id]);
        if (deleted.rowCount !== 1) throw new AppError(409, "The previous Android release can no longer be removed safely");
      });
    },
  });
  response.status(201).json(created({ ...mapRelease(result.active), cleanupPending: result.cleanupPending }));
}));

/** Retries cleanup of an inactive release left behind by a previous storage failure. */
appReleasesRouter.delete("/admin/app-releases/android/:id", ...superAdmin, asyncRoute(async (request, response) => {
  await requireReleaseSchema();
  const id = idFromParams(request.params.id);
  const release = await queryOne<AppRelease>("SELECT * FROM app_releases WHERE id=$1 AND platform='android'", [id]);
  if (!release) throw notFound("Android release not found");
  if (release.is_active) throw new AppError(409, "An active Android release cannot be deleted without a replacement");
  await deleteAndroidReleaseAsset(release.cloudinary_public_id);
  const removed = await queryOne<AppRelease>("DELETE FROM app_releases WHERE id=$1 AND platform='android' AND is_active=FALSE RETURNING *", [id]);
  if (!removed) throw new AppError(409, "The Android release can no longer be removed safely");
  response.json(message("Inactive Android release permanently deleted"));
}));
