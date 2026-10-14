import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/api.js";
import { requireRole } from "../lib/auth.js";
import { isAndroidApkFileName } from "../services/storage.js";
import { SN2_V5_SHA256, SN2_V5_SIZE, assertSn2V5MigrationSource } from "../modules/app-releases/android-v5-public-migration.js";
import { assertGreaterVersionCode, publishAfterUpload } from "../modules/app-releases/workflow.js";

test("Android release files and version codes are strictly validated", () => {
  assert.equal(isAndroidApkFileName("starry-nights.apk"), true);
  assert.equal(isAndroidApkFileName("release.APK"), true);
  for (const invalid of ["release.aab", "release.ipa", "release.exe", "release.zip", "release.apk.zip"]) {
    assert.equal(isAndroidApkFileName(invalid), false);
  }
  assert.throws(() => assertGreaterVersionCode(4, 4), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.throws(() => assertGreaterVersionCode(4, 3), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.doesNotThrow(() => assertGreaterVersionCode(4, 5));
});

test("a replacement activates while retaining the old APK and release row", async () => {
  const events: string[] = [];
  const result = await publishAfterUpload({
    activate: async () => {
      events.push("activate-new");
      return { active: { versionCode: 5 }, previous: { id: "old", cloudinaryPublicId: "releases/old" } };
    },
    discardNewAsset: async () => { events.push("discard-new"); },
  });
  assert.deepEqual(events, ["activate-new"]);
  assert.equal(result.previous?.id, "old");
});

test("a failed activation preserves the active release and discards only the new orphan", async () => {
  const events: string[] = [];
  await assert.rejects(publishAfterUpload({
    activate: async () => { events.push("activate-new"); throw new Error("database unavailable"); },
    discardNewAsset: async () => { events.push("discard-new"); },
  }), /database unavailable/);
  assert.deepEqual(events, ["activate-new", "discard-new"]);
});

test("a previous release remains available as inactive history after activation", async () => {
  const result = await publishAfterUpload({
    activate: async () => ({ active: { versionCode: 5 }, previous: { id: "old", cloudinaryPublicId: "releases/old" } }),
    discardNewAsset: async () => undefined,
  });
  assert.equal(result.active.versionCode, 5);
  assert.equal(result.previous?.id, "old");
});

test("unauthenticated callers cannot reach the super-admin Android release mutation", () => {
  let received: unknown;
  requireRole("SUPER_ADMIN")({} as never, {} as never, (error?: unknown) => { received = error; });
  assert.ok(received instanceof AppError);
  assert.equal(received.status, 401);
});

test("the one-time public-Blob migration is pinned to the approved signed SN2 v5 source", () => {
  const source = {
    id: "95395c20-847b-4e0d-a82d-f1b0006fc44d",
    version_name: "SN2",
    version_code: 5,
    file_url: "https://android.private.blob.vercel-storage.com/production/starry-nights/public/android-releases/release.apk",
    file_size: SN2_V5_SIZE,
    sha256: SN2_V5_SHA256,
    is_active: true,
  };
  assert.doesNotThrow(() => assertSn2V5MigrationSource(source));
  assert.throws(() => assertSn2V5MigrationSource({ ...source, version_code: 6 }), /approved SN2 versionCode 5/i);
  assert.throws(() => assertSn2V5MigrationSource({ ...source, sha256: "0".repeat(64) }), /checksum and size/i);
  assert.throws(() => assertSn2V5MigrationSource({ ...source, file_url: "https://android.public.blob.vercel-storage.com/release.apk" }), /private Blob source/i);
});
