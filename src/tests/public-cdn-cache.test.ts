import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";

// Cache configuration is read when the helper's in-memory companion loads.
process.env.CACHE_ENABLED = "true";
process.env.CACHE_MAX_ENTRIES = "10";

const { noStoreByDefault, publicCdnCache, publicCdnPolicies } = await import("../services/public-cdn-cache.js");

const createTestServer = async () => {
  const app = express();
  app.use(noStoreByDefault);
  app.get("/public", publicCdnCache(publicCdnPolicies.packages, ["catalog", "packages"]), (_request, response) => response.json({ success: true }));
  app.get("/private", (_request, response) => response.status(401).json({ success: false }));
  app.get("/forbidden", (_request, response) => response.status(403).json({ success: false }));
  app.all("/write", (_request, response) => response.json({ success: true }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, base: `http://127.0.0.1:${address.port}` };
};

test("anonymous public GET responses opt into Vercel CDN caching with tags and Origin variation", async () => {
  const { server, base } = await createTestServer();
  try {
    const response = await fetch(`${base}/public`, { headers: { origin: "https://public.example.test" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.match(response.headers.get("vercel-cdn-cache-control") ?? "", /max-age=300/);
    assert.match(response.headers.get("vercel-cdn-cache-control") ?? "", /stale-while-revalidate=1800/);
    assert.match(response.headers.get("vercel-cdn-cache-control") ?? "", /stale-if-error=3600/);
    assert.equal(response.headers.get("vercel-cache-tag"), "catalog,packages");
    assert.match(response.headers.get("vary") ?? "", /Origin/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("authorization, private errors, and all writes remain private no-store", async () => {
  const { server, base } = await createTestServer();
  try {
    const authorizedPublic = await fetch(`${base}/public`, { headers: { authorization: "Bearer stale-token" } });
    assert.equal(authorizedPublic.headers.get("cache-control"), "private, no-store");
    assert.equal(authorizedPublic.headers.get("vercel-cdn-cache-control"), "private, no-store");
    assert.equal(authorizedPublic.headers.get("vercel-cache-tag"), null);

    for (const path of ["/private", "/forbidden"]) {
      const response = await fetch(`${base}${path}`);
      assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
      assert.equal(response.headers.get("vercel-cache-tag"), null);
    }

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${base}/write`, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vercel-cache-tag"), null);
    }
  } finally {
    server.close();
    await once(server, "close");
  }
});
