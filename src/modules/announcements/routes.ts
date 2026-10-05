import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query, queryOne } from "../../db/pool.js";
import { asyncRoute, badRequest, created, message, notFound, ok, validateBody } from "../../lib/api.js";
import { authenticate, requireRole } from "../../lib/auth.js";
import { isoDate } from "../../lib/values.js";

export const announcementsRouter = Router();
const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";

type Announcement = {
  id: string;
  title: string;
  message: string;
  link: string | null;
  link_label: string | null;
  audience: "all" | "authenticated" | "unauthenticated";
  starts_at: Date | string;
  expires_at: Date | string | null;
  status: "draft" | "published";
  active: boolean;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted: boolean;
};

let schemaPromise: Promise<void> | undefined;

/**
 * The feature is deliberately introduced only to the current staging database.
 * A future production release must use an explicit migration, rather than a
 * request-time schema mutation against a live database.
 */
const ensureAnnouncementSchema = async (): Promise<void> => {
  if (env.deploymentEnvironment === "production") throw new Error("App announcements require an explicit production migration");
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS app_announcements (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      link_label TEXT,
      audience TEXT NOT NULL CHECK (audience IN ('all', 'authenticated', 'unauthenticated')),
      starts_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      CHECK (expires_at IS NULL OR expires_at > starts_at)
    )`);
    await query("CREATE INDEX IF NOT EXISTS app_announcements_active_window_idx ON app_announcements (status, active, starts_at, expires_at) WHERE deleted=FALSE");
  })().catch((error) => {
    schemaPromise = undefined;
    throw error;
  });
  return schemaPromise;
};

const dateInput = z.string().trim().datetime({ offset: true });
const writeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  link: z.string().trim().max(2000).optional().nullable(),
  linkLabel: z.string().trim().max(120).optional().nullable(),
  audience: z.enum(["all", "authenticated", "unauthenticated"]),
  startsAt: dateInput,
  expiresAt: dateInput.optional().nullable(),
  status: z.enum(["draft", "published"]),
  active: z.boolean(),
});
const activeSchema = z.object({ active: z.boolean() });

const safeLink = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//") && !/\s/.test(normalized)) return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "https:") return parsed.toString();
  } catch {
    // Return one safe, consistent validation failure below.
  }
  throw badRequest("Announcement links must be an approved internal route or HTTPS URL");
};

const mapAdmin = (announcement: Announcement): Record<string, unknown> => ({
  id: announcement.id,
  title: announcement.title,
  message: announcement.message,
  link: announcement.link ?? "",
  linkLabel: announcement.link_label ?? "",
  audience: announcement.audience,
  startsAt: isoDate(announcement.starts_at),
  expiresAt: isoDate(announcement.expires_at),
  status: announcement.status,
  active: announcement.active,
  version: announcement.version,
  createdAt: isoDate(announcement.created_at),
  updatedAt: isoDate(announcement.updated_at),
});

const mapPublic = (announcement: Announcement): Record<string, unknown> => ({
  id: announcement.id,
  title: announcement.title,
  message: announcement.message,
  link: announcement.link ?? "",
  linkLabel: announcement.link_label ?? "",
  version: announcement.version,
  startsAt: isoDate(announcement.starts_at),
  expiresAt: isoDate(announcement.expires_at),
});

const find = async (id: string): Promise<Announcement> => {
  await ensureAnnouncementSchema();
  const item = await queryOne<Announcement>("SELECT * FROM app_announcements WHERE id=$1 AND deleted=FALSE", [id]);
  if (!item) throw notFound("App announcement not found");
  return item;
};

const isSame = (left: Date | string | null, right: Date | string | null): boolean => String(left ?? "") === String(right ?? "");

const save = async (body: z.infer<typeof writeSchema>, existing?: Announcement): Promise<Announcement> => {
  const link = safeLink(body.link);
  const linkLabel = link ? (body.linkLabel?.trim() || null) : null;
  const startsAt = new Date(body.startsAt);
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (Number.isNaN(startsAt.valueOf()) || (expiresAt && Number.isNaN(expiresAt.valueOf()))) throw badRequest("Announcement dates are invalid");
  if (expiresAt && expiresAt <= startsAt) throw badRequest("Announcement expiry must be after its start time");
  const semanticChange = Boolean(existing && (
    existing.title !== body.title || existing.message !== body.message || existing.link !== link || existing.link_label !== linkLabel ||
    existing.audience !== body.audience || !isSame(existing.starts_at, startsAt) || !isSame(existing.expires_at, expiresAt)
  ));
  const publishing = Boolean(existing && existing.status !== "published" && body.status === "published");
  const version = existing ? existing.version + (semanticChange || publishing ? 1 : 0) : 1;
  if (existing) {
    await queryOne("UPDATE app_announcements SET title=$1,message=$2,link=$3,link_label=$4,audience=$5,starts_at=$6,expires_at=$7,status=$8,active=$9,version=$10,updated_at=NOW() WHERE id=$11", [body.title, body.message, link, linkLabel, body.audience, startsAt, expiresAt, body.status, body.active, version, existing.id]);
    return find(existing.id);
  }
  const id = randomUUID();
  await queryOne("INSERT INTO app_announcements (id,title,message,link,link_label,audience,starts_at,expires_at,status,active,version,created_at,updated_at,deleted) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,NOW(),NOW(),FALSE)", [id, body.title, body.message, link, linkLabel, body.audience, startsAt, expiresAt, body.status, body.active]);
  return find(id);
};

announcementsRouter.get("/app-announcements/active", asyncRoute(async (request, response) => {
  await ensureAnnouncementSchema();
  const audience = request.auth ? ["all", "authenticated"] : ["all", "unauthenticated"];
  const records = await query<Announcement>("SELECT * FROM app_announcements WHERE deleted=FALSE AND status='published' AND active=TRUE AND starts_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW()) AND audience = ANY($1::text[]) ORDER BY starts_at ASC, created_at ASC", [audience]);
  response.json(ok(records.map(mapPublic)));
}));

announcementsRouter.get("/app-announcements", ...superAdmin, asyncRoute(async (_request, response) => {
  await ensureAnnouncementSchema();
  response.json(ok((await query<Announcement>("SELECT * FROM app_announcements WHERE deleted=FALSE ORDER BY updated_at DESC")).map(mapAdmin)));
}));
announcementsRouter.get("/app-announcements/:id", ...superAdmin, asyncRoute(async (request, response) => response.json(ok(mapAdmin(await find(param(request.params.id)))))));
announcementsRouter.post("/app-announcements", ...superAdmin, validateBody(writeSchema), asyncRoute(async (request, response) => response.status(201).json(created(mapAdmin(await save(request.body as z.infer<typeof writeSchema>))))));
announcementsRouter.put("/app-announcements/:id", ...superAdmin, validateBody(writeSchema), asyncRoute(async (request, response) => {
  const saved = await save(request.body as z.infer<typeof writeSchema>, await find(param(request.params.id)));
  response.json(ok(mapAdmin(saved)));
}));
announcementsRouter.post("/app-announcements/:id/publish", ...superAdmin, asyncRoute(async (request, response) => {
  const item = await find(param(request.params.id));
  const version = item.status === "published" ? item.version : item.version + 1;
  await queryOne("UPDATE app_announcements SET status='published',active=TRUE,version=$1,updated_at=NOW() WHERE id=$2", [version, item.id]);
  response.json(ok(mapAdmin(await find(item.id))));
}));
announcementsRouter.post("/app-announcements/:id/unpublish", ...superAdmin, asyncRoute(async (request, response) => {
  const item = await find(param(request.params.id));
  await queryOne("UPDATE app_announcements SET status='draft',active=FALSE,updated_at=NOW() WHERE id=$1", [item.id]);
  response.json(ok(mapAdmin(await find(item.id))));
}));
announcementsRouter.post("/app-announcements/:id/active", ...superAdmin, validateBody(activeSchema), asyncRoute(async (request, response) => {
  const item = await find(param(request.params.id));
  await queryOne("UPDATE app_announcements SET active=$1,updated_at=NOW() WHERE id=$2", [(request.body as z.infer<typeof activeSchema>).active, item.id]);
  response.json(ok(mapAdmin(await find(item.id))));
}));
announcementsRouter.delete("/app-announcements/:id", ...superAdmin, asyncRoute(async (request, response) => {
  const item = await find(param(request.params.id));
  await queryOne("UPDATE app_announcements SET deleted=TRUE,active=FALSE,updated_at=NOW() WHERE id=$1", [item.id]);
  response.json(message("App announcement deleted"));
}));
