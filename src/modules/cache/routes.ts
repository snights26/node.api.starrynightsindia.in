import { Router } from "express";
import { asyncRoute, ok } from "../../lib/api.js";
import { authenticate, requireAnyRole, requireRole } from "../../lib/auth.js";
import { publicCache } from "../../services/public-cache.js";

export const cacheRouter = Router();
const admin = [authenticate, requireAnyRole("ADMIN", "SUPER_ADMIN")];
const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";

const result = (operation: string, count: number) => ({ operation, success: true, message: "Completed", invalidatedEntries: count, cacheVersion: String(publicCache.version()) });

cacheRouter.get("/public-cache/manifest", asyncRoute(async (_request, response) => {
  const version = String(publicCache.version());
  const epoch = publicCache.browserCacheEpoch();
  response.json(ok({
    schemaCompatibilityVersion: 1,
    browserCacheEnabled: publicCache.status().enabled,
    browserCacheEpoch: epoch,
    catalogVersion: `${epoch}:catalog:${version}`,
    featuredRowsVersion: `${epoch}:catalog:${version}:featured:${version}`,
    heroVersion: `${epoch}:hero:${version}`,
    statisticsVersion: `${epoch}:statistics:${version}`,
    galleryVersion: `${epoch}:gallery:${version}`,
  }));
}));

cacheRouter.get("/cache-management/status", ...admin, asyncRoute(async (_request, response) => response.json(ok({ ...publicCache.status(), catalog: publicCache.status(), browserCache: { schemaCompatibilityVersion: 1, epoch: publicCache.browserCacheEpoch() } }))));
cacheRouter.post("/cache-management/rebuild/catalog", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("rebuild-catalog", publicCache.clear("catalog"))))));
cacheRouter.post("/cache-management/rebuild/featured-rows", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("rebuild-featured-rows", publicCache.clear("featured"))))));
cacheRouter.post("/cache-management/rebuild/public-content", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("rebuild-public-content", publicCache.clear("content"))))));
cacheRouter.post("/cache-management/rebuild/group/:group", ...superAdmin, asyncRoute(async (request, response) => { const group = param(request.params.group); response.json(ok(result(`rebuild-${group}`, publicCache.clear(group)))); }));
cacheRouter.post("/cache-management/rebuild/all", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("rebuild-all", publicCache.clear())))));
cacheRouter.post("/cache-management/clear/:group", ...superAdmin, asyncRoute(async (request, response) => { const group = param(request.params.group); response.json(ok(result(`clear-${group}`, publicCache.clear(group)))); }));
cacheRouter.post("/cache-management/clear/all", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("clear-all", publicCache.clear())))));
cacheRouter.post("/cache-management/browser-cache/invalidate", ...superAdmin, asyncRoute(async (_request, response) => response.json(ok(result("invalidate-browser-cache", publicCache.clear())))));
