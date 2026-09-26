import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedGoogleAudience, parseGoogleAllowedClientIds } from "../lib/google-audience.js";

test("Google audience allowlist trims, de-duplicates, and retains the legacy client", () => {
  assert.deepEqual(parseGoogleAllowedClientIds(" web , android,web ,, ios ", " legacy "), ["web", "android", "ios", "legacy"]);
});

test("Google audience policy accepts configured web, Android, and iOS audiences", () => {
  const allowed = ["web", "android", "ios"];
  assert.equal(isAllowedGoogleAudience(allowed, "web", undefined), true);
  assert.equal(isAllowedGoogleAudience(allowed, "android", "android"), true);
  assert.equal(isAllowedGoogleAudience(allowed, "ios", "web"), true);
});

test("Google audience policy rejects unlisted audiences, azp values, and empty configuration", () => {
  assert.equal(isAllowedGoogleAudience(["web"], "unknown", undefined), false);
  assert.equal(isAllowedGoogleAudience(["web"], "web", "unknown"), false);
  assert.equal(isAllowedGoogleAudience([], "web", undefined), false);
});
