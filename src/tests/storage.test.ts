import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Set before dynamic imports because config is intentionally read once at
// process start, just as it is in a Vercel Function.
process.env.JWT_SECRET = "s".repeat(48);
process.env.BLOB_PRIVATE_STORE_ID = "private-test-store";
process.env.BLOB_PUBLIC_STORE_ID = "public-test-store";
process.env.STORAGE_NAMESPACE = "staging/starry-nights";
process.env.DEPLOYMENT_ENVIRONMENT = "local";
process.env.RAZORPAY_WEBHOOK_SECRET = "w".repeat(32);

const storage = await import("../services/blob-storage.js");

test("legacy object paths are deterministic and reject traversal", () => {
  assert.equal(
    storage.resolveLegacyUploadPath("/api/uploads/resumes/Candidate%20CV.pdf", "staging/starry-nights"),
    "staging/starry-nights/legacy/resumes/Candidate%20CV.pdf",
  );
  assert.throws(() => storage.resolveLegacyUploadPath("/api/uploads/../secrets.txt", "staging/starry-nights"));
  assert.throws(() => storage.resolveLegacyUploadPath("/api/uploads/resumes/%2E%2E", "staging/starry-nights"));
});

test("upload finalization enforces signed ownership, pathname, type, and size", async () => {
  const metadata = {
    pathname: "",
    url: "https://private.blob.vercel-storage.com/photo.jpg",
    contentType: "image/jpeg",
    size: 1024,
    uploadedAt: new Date(),
    contentDisposition: "inline",
    downloadUrl: "https://private.blob.vercel-storage.com/photo.jpg?download=1",
    cacheControl: "private, no-store",
    etag: "etag-1",
  };
  const driver = {
    head: async () => metadata,
    put: async () => ({ ...metadata }),
    del: async () => undefined,
    issueSignedToken: async () => ({ delegationToken: `${Buffer.from(JSON.stringify({ storeId: "store_private-test-store" })).toString("base64url")}.signature`, clientSigningToken: "signing", validUntil: Date.now() + 60_000 }),
    presignUrl: async () => ({ presignedUrl: "https://private.blob.vercel-storage.com/signed" }),
  };
  const service = new storage.StorageService(driver as never, process.env.JWT_SECRET);
  const authorization = service.createUploadAuthorization({
    purpose: "travel-photo", access: "private", actorId: "user-1", filename: "photo.jpg", contentType: "image/jpeg", size: 1024,
    allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: 25 * 1024 * 1024,
  });
  metadata.pathname = authorization.pathname;
  const object = await service.finalizeUpload(authorization.intent, metadata.url, "user-1", "travel-photo");
  assert.equal(object.reference, storage.PRIVATE_STORAGE_REFERENCE_PREFIX + encodeURIComponent(metadata.pathname));
  const presigned = await service.createPresignedUpload(authorization.intent, "user-1");
  assert.equal(presigned.pathname, authorization.pathname);
  assert.equal(presigned.headers["x-vercel-blob-access"], "private");
  assert.equal(presigned.headers["x-content-type"], "image/jpeg");
  assert.match(presigned.uploadUrl, /^https:\/\//);
  await assert.rejects(service.finalizeUpload(authorization.intent, metadata.url, "user-2", "travel-photo"), /different user/);
  await assert.rejects(service.finalizeUpload(authorization.intent, metadata.url, "user-1", "quotation"), /invalid purpose/);

  const downloadUrl = await service.getDownloadAuthorization(object.reference, "private");
  assert.equal(downloadUrl, "https://private.blob.vercel-storage.com/signed");
  let deleted = false;
  const deletingDriver = { ...driver, del: async () => { deleted = true; } };
  const deletingService = new storage.StorageService(deletingDriver as never, process.env.JWT_SECRET);
  await deletingService.deleteObject(object.reference, "private");
  assert.equal(deleted, true);

  const missingDriver = {
    ...driver,
    head: async () => {
      const error = Object.assign(new Error("object does not exist"), { statusCode: 404, name: "BlobNotFoundError" });
      throw error;
    },
  };
  const missingService = new storage.StorageService(missingDriver as never, process.env.JWT_SECRET);
  assert.equal(await missingService.objectExists(object.reference, "private"), false);
});

test("Razorpay webhook verifies the unmodified raw request body and protected upload routes reject guests", async () => {
  const { app } = await import("../app.js");
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const payload = JSON.stringify({ event: "payment_link.created", payload: { payment_link: { entity: { id: "plink_test" } } } });
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(payload).digest("hex");
    const webhook = await fetch(`${base}/api/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": signature }, body: payload });
    assert.equal(webhook.status, 200);
    assert.equal((await webhook.json() as { success: boolean }).success, true);
    const guestUpload = await fetch(`${base}/api/upload-photo/authorize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(guestUpload.status, 401);

    const accessToken = jwt.sign({ uid: "user-1", userId: "USR1", role: "USER" }, process.env.JWT_SECRET!, { subject: "user@example.test", algorithm: "HS256" });
    const oversized = new FormData();
    oversized.append("file", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" }), "oversized.jpg");
    const tooLarge = await fetch(`${base}/api/upload-photo`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: oversized });
    assert.equal(tooLarge.status, 413);
    assert.match((await tooLarge.json() as { message: string }).message, /direct upload/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});
