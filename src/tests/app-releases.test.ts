import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/api.js";
import { requireRole } from "../lib/auth.js";
import { isAndroidApkFileName } from "../services/storage.js";
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

test("a replacement activates before permanently removing the old APK and row", async () => {
  const events: string[] = [];
  const result = await publishAfterUpload({
    activate: async () => {
      events.push("activate-new");
      return { active: { versionCode: 5 }, previous: { id: "old", cloudinaryPublicId: "releases/old" } };
    },
    discardNewAsset: async () => { events.push("discard-new"); },
    deleteOldAsset: async () => { events.push("delete-old-asset"); },
    deleteOldRow: async () => { events.push("delete-old-row"); },
  });
  assert.deepEqual(events, ["activate-new", "delete-old-asset", "delete-old-row"]);
  assert.equal(result.cleanupPending, false);
});

test("a failed activation preserves the active release and discards only the new orphan", async () => {
  const events: string[] = [];
  await assert.rejects(publishAfterUpload({
    activate: async () => { events.push("activate-new"); throw new Error("database unavailable"); },
    discardNewAsset: async () => { events.push("discard-new"); },
    deleteOldAsset: async () => { events.push("delete-old-asset"); },
    deleteOldRow: async () => { events.push("delete-old-row"); },
  }), /database unavailable/);
  assert.deepEqual(events, ["activate-new", "discard-new"]);
});

test("old cleanup failure never rolls back a newly active release", async () => {
  const events: string[] = [];
  const result = await publishAfterUpload({
    activate: async () => ({ active: { versionCode: 5 }, previous: { id: "old", cloudinaryPublicId: "releases/old" } }),
    discardNewAsset: async () => { events.push("discard-new"); },
    deleteOldAsset: async () => { events.push("delete-old-asset"); throw new Error("storage unavailable"); },
    deleteOldRow: async () => { events.push("delete-old-row"); },
  });
  assert.equal(result.active.versionCode, 5);
  assert.equal(result.cleanupPending, true);
  assert.deepEqual(events, ["delete-old-asset"]);
});

test("unauthenticated callers cannot reach the super-admin Android release mutation", () => {
  let received: unknown;
  requireRole("SUPER_ADMIN")({} as never, {} as never, (error?: unknown) => { received = error; });
  assert.ok(received instanceof AppError);
  assert.equal(received.status, 401);
});
