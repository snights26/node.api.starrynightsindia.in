/**
 * One-time, staging-only migration for the historical upload archive.
 *
 * Dry run:  npm run migrate:legacy-uploads
 * Execute:  LEGACY_UPLOAD_MIGRATION_CONFIRM=staging-node-staging npm run migrate:legacy-uploads -- --execute
 *
 * The source archive is read-only. This script never updates or deletes a
 * database row and never deletes the archive. It deliberately requires an
 * explicit staging marker so it cannot be aimed at production by accident.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { env } from "../src/config/env.js";
import { storageService } from "../src/services/blob-storage.js";

type LegacyReference = { legacy_path: string; kind: "career_resume" | "notification_pdf" };
type ReportItem = {
  kind: LegacyReference["kind"];
  pathFingerprint: string;
  sourceBytes?: number;
  sha256?: string;
  destinationFingerprint: string;
  status: "planned" | "migrated" | "already-present" | "missing" | "failed";
  detail?: string;
};

const execute = process.argv.includes("--execute");
const fingerprint = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 16);
const contentType = (kind: LegacyReference["kind"], pathname: string): string => {
  const lower = pathname.toLowerCase();
  if (kind === "notification_pdf" || lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
};

const archiveFile = (root: string, legacyPath: string): string => {
  const relative = legacyPath.replace(/^\/api\/uploads\//, "").split("/").map((segment) => decodeURIComponent(segment));
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...relative);
  if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("legacy path escapes archive root");
  return candidate;
};

const main = async (): Promise<void> => {
  if (env.deploymentEnvironment !== "staging" || env.databaseEnvironment !== "staging") {
    throw new Error("This migration may run only with DEPLOYMENT_ENVIRONMENT=staging and DATABASE_ENVIRONMENT=staging");
  }
  if (!env.databaseUrl) throw new Error("DATABASE_URL is required for the read-only reference inventory");
  const archiveRoot = process.env.LEGACY_UPLOAD_ARCHIVE?.trim();
  if (!archiveRoot) throw new Error("LEGACY_UPLOAD_ARCHIVE must point to the read-only historical archive");
  if (execute && process.env.LEGACY_UPLOAD_MIGRATION_CONFIRM !== "staging-node-staging") {
    throw new Error("Set LEGACY_UPLOAD_MIGRATION_CONFIRM=staging-node-staging before executing uploads");
  }
  if (execute && !storageService.isConfigured("private")) throw new Error("Private Vercel Blob storage is not configured");

  const pool = new Pool({ connectionString: env.databaseUrl, ssl: env.databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
  const report: ReportItem[] = [];
  try {
    const result = await pool.query<LegacyReference>(`
      SELECT DISTINCT resume_url AS legacy_path, 'career_resume'::text AS kind
      FROM career_applications
      WHERE deleted=FALSE AND resume_url LIKE '/api/uploads/%'
      UNION
      SELECT DISTINCT pdf_url AS legacy_path, 'notification_pdf'::text AS kind
      FROM notifications
      WHERE deleted=FALSE AND pdf_url LIKE '/api/uploads/%'
      ORDER BY legacy_path
    `);
    for (const row of result.rows) {
      const legacyPath = row.legacy_path;
      const destination = storageService.resolveLegacyPath(legacyPath);
      const item: ReportItem = {
        kind: row.kind,
        pathFingerprint: fingerprint(legacyPath),
        destinationFingerprint: fingerprint(destination),
        status: "planned",
      };
      try {
        const content = await readFile(archiveFile(archiveRoot, legacyPath));
        item.sourceBytes = content.length;
        item.sha256 = createHash("sha256").update(content).digest("hex");
        if (!execute) {
          report.push(item);
          continue;
        }
        const reference = storageService.privateReference(destination);
        const existing = await storageService.objectExists(reference, "private");
        const stored = existing
          ? await storageService.getObjectMetadata(reference, "private")
          : await storageService.importLegacyObject(destination, content, contentType(row.kind, legacyPath));
        if (stored.size !== content.length) throw new Error("destination size did not match source");
        if (!await storageService.objectExists(reference, "private")) throw new Error("destination object was not found after upload");
        item.status = existing ? "already-present" : "migrated";
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        item.status = code === "ENOENT" ? "missing" : "failed";
        item.detail = code === "ENOENT" ? "source archive object missing" : "migration step failed";
      }
      report.push(item);
    }
  } finally {
    await pool.end();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: execute ? "execute" : "dry-run",
    sourceArchiveReadOnly: true,
    databaseWrites: 0,
    sourceDeletes: 0,
    items: report,
    totals: Object.fromEntries(["planned", "migrated", "already-present", "missing", "failed"].map((status) => [status, report.filter((item) => item.status === status).length])),
  };
  const reportDirectory = path.resolve("reports");
  const reportPath = path.join(reportDirectory, `legacy-upload-blob-migration-${Date.now()}.json`);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(reportDirectory, { recursive: true }));
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ mode: summary.mode, references: report.length, totals: summary.totals, report: path.basename(reportPath) }));
  if (summary.totals.failed || summary.totals.missing) process.exitCode = 1;
};

void main();
