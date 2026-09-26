import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { transaction, query, queryOne } from "../../db/pool.js";
import { asyncRoute, conflict, created, message, notFound, ok, validateBody } from "../../lib/api.js";
import { authenticate, requireRole } from "../../lib/auth.js";
import { booleanValue, firstString, integerValue, objectList, optionalString, parseJsonList, stringList, type JsonObject } from "../../lib/values.js";
import { publicCache } from "../../services/public-cache.js";
import { mapCategory, mapPackageDetail, mapPackageSummary } from "./mapper.js";
import { categoryByCode, categoryTreeRows, itineraryForPackage, listCategories, listPackages, packageByIdentifier, replacePackageRelations } from "./repository.js";
import type { CategoryRow, PackageRow } from "./types.js";

export const catalogRouter = Router();

const categoryInput = z.object({
  code: z.string().trim().max(60).optional(), categoryCode: z.string().trim().max(60).optional(),
  name: z.string().trim().max(255).optional(), categoryName: z.string().trim().max(255).optional(), title: z.string().trim().max(255).optional(),
  isSub: z.union([z.boolean(), z.string(), z.number()]).optional(), isSubcategory: z.union([z.boolean(), z.string(), z.number()]).optional(), subCategory: z.union([z.boolean(), z.string(), z.number()]).optional(),
  parent: z.string().trim().max(60).optional(), parentCategory: z.string().trim().max(60).optional(), parentCode: z.string().trim().max(60).optional(),
  thumbnailUrl: z.string().trim().max(2000).optional(), image: z.string().trim().max(2000).optional(),
}).passthrough();

const packageInput = z.object({
  packageCode: z.string().trim().max(60).optional(), code: z.string().trim().max(60).optional(), id: z.string().trim().max(60).optional(),
  heroTitle: z.string().trim().max(255).optional(), shortTitle: z.string().trim().max(255).optional(), title: z.string().trim().max(255).optional(), name: z.string().trim().max(255).optional(),
  brandName: z.string().trim().max(255).optional(), days: z.union([z.number().int().nonnegative(), z.string()]).optional(),
  avgCost: z.string().trim().max(255).optional(), cost: z.string().trim().max(255).optional(), pickup: z.string().trim().max(255).optional(),
  bestTime: z.string().trim().max(255).optional(), bestTimeToVisit: z.string().trim().max(255).optional(), climate: z.string().trim().max(255).optional(), suitable: z.string().trim().max(255).optional(),
  highlights: z.string().max(100_000).optional(), overview: z.string().max(100_000).optional(), includes: z.string().max(100_000).optional(), includesText: z.string().max(100_000).optional(), inclusions: z.string().max(100_000).optional(),
  excludes: z.string().max(100_000).optional(), excludesText: z.string().max(100_000).optional(), exclusions: z.string().max(100_000).optional(), note: z.string().max(100_000).optional(),
  thumbnailUrl: z.string().trim().max(2000).optional(), thumbnail: z.string().trim().max(2000).optional(), image: z.string().trim().max(2000).optional(),
  heroImages: z.array(z.string().trim().max(2000)).optional(), images: z.array(z.string().trim().max(2000)).optional(),
  relatedPackageCodes: z.array(z.string().trim().max(60)).optional(), relatedPackages: z.array(z.string().trim().max(60)).optional(),
  categoryCodes: z.array(z.string().trim().max(60)).optional(), finalCategories: z.array(z.string().trim().max(60)).optional(), categories: z.array(z.union([z.string().trim().max(60), z.object({ code: z.string().trim().max(60) })])).optional(),
  itinerary: z.array(z.object({ day: z.union([z.number().int().positive(), z.string()]).optional(), dayNumber: z.union([z.number().int().positive(), z.string()]).optional(), title: z.string().max(255).optional(), description: z.string().max(100_000).optional(), desc: z.string().max(100_000).optional() }).passthrough()).optional(),
}).passthrough();

const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";

const categoryTree = (items: CategoryRow[]): Record<string, unknown>[] => {
  const byParent = new Map<string, CategoryRow[]>();
  for (const item of items) {
    if (item.parent_code) byParent.set(item.parent_code, [...(byParent.get(item.parent_code) ?? []), item]);
  }
  const visit = (item: CategoryRow): Record<string, unknown> => ({ ...mapCategory(item), children: (byParent.get(item.code) ?? []).map(visit) });
  return items.filter((item) => !item.parent_id).map(visit);
};

const cacheResponse = async <T>(key: string, response: import("express").Response, loader: () => Promise<T>): Promise<void> => {
  const data = await publicCache.getOrLoad(key, loader);
  response.setHeader("ETag", `\"starry-${publicCache.version()}-${Buffer.from(key).toString("base64url")}\"`);
  response.json(ok(data));
};

catalogRouter.get("/categories", asyncRoute(async (_request, response) => {
  await cacheResponse("catalog:categories", response, async () => (await listCategories()).map(mapCategory));
}));

catalogRouter.get("/categories/tree", asyncRoute(async (_request, response) => {
  await cacheResponse("catalog:category-tree", response, async () => categoryTree(await categoryTreeRows()));
}));

catalogRouter.get("/categories/:code", asyncRoute(async (request, response) => {
  const code = param(request.params.code);
  await cacheResponse(`catalog:category:${code.toLowerCase()}`, response, async () => mapCategory(await categoryByCode(code)));
}));

catalogRouter.get("/categories/:code/packages", asyncRoute(async (request, response) => {
  const code = param(request.params.code);
  await cacheResponse(`catalog:packages:category:${code.toLowerCase()}`, response, async () => {
    await categoryByCode(code);
    return (await listPackages({ category: code })).map(mapPackageSummary);
  });
}));

catalogRouter.get("/packages", asyncRoute(async (request, response) => {
  const category = typeof request.query.category === "string" ? request.query.category : typeof request.query.regionCode === "string" ? request.query.regionCode : undefined;
  const brand = typeof request.query.brand === "string" ? request.query.brand : undefined;
  const rowId = typeof request.query.rowId === "string" ? request.query.rowId : undefined;
  if (rowId) {
    await cacheResponse(`featured-row:packages:${rowId.toLowerCase()}`, response, async () => {
      const row = await queryOne<{ id: string; type: string }>("SELECT id, type FROM featured_rows WHERE deleted = FALSE AND (LOWER(row_id) = LOWER($1) OR CAST(id AS TEXT) = $1)", [rowId]);
      if (!row) return [];
      const items = await query<{ item_code: string; item_type: string; sequence: number }>("SELECT item_code, item_type, sequence FROM featured_row_items WHERE deleted = FALSE AND row_id = $1 ORDER BY sequence", [row.id]);
      const codes = items.filter((item) => item.item_type.toLowerCase() === "package" || row.type.toLowerCase() === "package" || row.type.toLowerCase() === "top10").map((item) => item.item_code);
      const rows = await listPackages({ packageCodes: codes });
      const byCode = new Map(rows.map((pkg) => [pkg.package_code.toLowerCase(), pkg]));
      return codes.map((code) => byCode.get(code.toLowerCase())).filter((pkg): pkg is PackageRow => Boolean(pkg)).map(mapPackageSummary);
    });
    return;
  }
  const cacheKey = `catalog:packages:${category?.toLowerCase() ?? "all"}:${brand?.toLowerCase() ?? ""}`;
  await cacheResponse(cacheKey, response, async () => (await listPackages({ category, brand })).map(mapPackageSummary));
}));

catalogRouter.get("/packages/:code", asyncRoute(async (request, response) => {
  const pkg = await packageByIdentifier(param(request.params.code));
  const itinerary = await itineraryForPackage(pkg.id);
  const configuredRelated = parseJsonList(pkg.related_package_codes_json);
  let related = configuredRelated.length ? await listPackages({ packageCodes: configuredRelated }) : [];
  if (related.length) {
    const byCode = new Map(related.map((item) => [item.package_code.toLowerCase(), item]));
    related = configuredRelated.map((code) => byCode.get(code.toLowerCase())).filter((item): item is PackageRow => Boolean(item));
  } else {
    related = (await listPackages()).filter((item) => item.id !== pkg.id).slice(0, 4);
  }
  response.json(ok(mapPackageDetail(pkg, itinerary, related)));
}));

catalogRouter.post("/categories", ...superAdmin, validateBody(categoryInput), asyncRoute(async (request, response) => {
  const body = request.body as JsonObject;
  const code = firstString(body, "code", "categoryCode") || `CAT${Date.now()}`;
  const name = firstString(body, "name", "categoryName", "title") || code;
  const parentCode = firstString(body, "parent", "parentCategory", "parentCode");
  const parent = parentCode && parentCode !== "-" ? await categoryByCode(parentCode) : undefined;
  const row = await queryOne<CategoryRow>(`
    INSERT INTO categories (id, created_at, updated_at, deleted, code, name, sub_category, parent_id, thumbnail_url)
    VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5, $6)
    RETURNING id, code, name, sub_category, parent_id, thumbnail_url`,
    [randomUUID(), code, name, booleanValue(body.isSub ?? body.isSubcategory ?? body.subCategory), parent?.id ?? null, optionalString(body, "thumbnailUrl", "image")],
  );
  if (!row) throw new Error("Category could not be created");
  row.parent_code = parent?.code ?? null;
  row.parent_name = parent?.name ?? null;
  publicCache.clear("catalog");
  response.status(201).json(created(mapCategory(row)));
}));

catalogRouter.put("/categories/:code", ...superAdmin, validateBody(categoryInput), asyncRoute(async (request, response) => {
  const original = await categoryByCode(param(request.params.code));
  const body = request.body as JsonObject;
  const code = firstString(body, "code", "categoryCode") || original.code;
  const name = firstString(body, "name", "categoryName", "title") || original.name;
  const parentCode = firstString(body, "parent", "parentCategory", "parentCode");
  const parent = parentCode && parentCode !== "-" ? await categoryByCode(parentCode) : undefined;
  if (parent?.id === original.id) throw conflict("A category cannot be its own parent");
  const row = await queryOne<CategoryRow>(`
    UPDATE categories SET code = $1, name = $2, sub_category = $3, parent_id = $4, thumbnail_url = $5, updated_at = NOW()
    WHERE id = $6 RETURNING id, code, name, sub_category, parent_id, thumbnail_url`,
    [code, name, booleanValue(body.isSub ?? body.isSubcategory ?? body.subCategory), parent?.id ?? null, optionalString(body, "thumbnailUrl", "image"), original.id],
  );
  if (!row) throw notFound("Category not found");
  row.parent_code = parent?.code ?? null;
  row.parent_name = parent?.name ?? null;
  publicCache.clear("catalog");
  response.json(ok(mapCategory(row)));
}));

catalogRouter.delete("/categories/:code", ...superAdmin, asyncRoute(async (request, response) => {
  const category = await categoryByCode(param(request.params.code));
  const child = await queryOne<{ id: string }>("SELECT id FROM categories WHERE parent_id = $1 AND deleted = FALSE LIMIT 1", [category.id]);
  if (child) throw conflict("Delete or reassign child categories before permanently deleting this category");
  await queryOne("DELETE FROM categories WHERE id = $1", [category.id]);
  publicCache.clear("catalog");
  response.json(message("Category deleted"));
}));

catalogRouter.post("/categories/:code/packages/:packageCode", ...superAdmin, asyncRoute(async (request, response) => {
  const category = await categoryByCode(param(request.params.code));
  const pkg = await packageByIdentifier(param(request.params.packageCode));
  await queryOne("INSERT INTO package_categories (package_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [pkg.id, category.id]);
  publicCache.clear("catalog");
  response.json(ok((await listPackages({ category: category.code })).map(mapPackageSummary)));
}));

catalogRouter.delete("/categories/:code/packages/:packageCode", ...superAdmin, asyncRoute(async (request, response) => {
  const category = await categoryByCode(param(request.params.code));
  const pkg = await packageByIdentifier(param(request.params.packageCode));
  await queryOne("DELETE FROM package_categories WHERE package_id = $1 AND category_id = $2", [pkg.id, category.id]);
  publicCache.clear("catalog");
  response.json(ok((await listPackages({ category: category.code })).map(mapPackageSummary)));
}));

const packagePayload = (body: JsonObject, existing?: PackageRow) => {
  const code = firstString(body, "packageCode", "code", "id") || existing?.package_code || `PKG${Date.now()}`;
  const heroTitle = firstString(body, "heroTitle", "title", "name") || existing?.hero_title || code;
  const categories = stringList(body.categoryCodes ?? body.finalCategories ?? body.categories);
  const itinerary = objectList(body.itinerary).map((item, index) => ({
    day: integerValue(item.day ?? item.dayNumber) ?? index + 1,
    title: firstString(item, "title"),
    description: firstString(item, "description", "desc"),
  }));
  return {
    code, heroTitle, shortTitle: optionalString(body, "shortTitle", "name"), brandName: optionalString(body, "brandName"), days: integerValue(body.days),
    avgCost: optionalString(body, "avgCost", "cost"), pickup: optionalString(body, "pickup"), bestTime: optionalString(body, "bestTime", "bestTimeToVisit"),
    climate: optionalString(body, "climate"), suitable: optionalString(body, "suitable"), highlights: optionalString(body, "highlights"), overview: optionalString(body, "overview"),
    includes: optionalString(body, "includes", "includesText", "inclusions"), excludes: optionalString(body, "excludes", "excludesText", "exclusions"), note: optionalString(body, "note"),
    thumbnail: optionalString(body, "thumbnailUrl", "thumbnail", "image"), heroImages: stringList(body.heroImages ?? body.images), related: stringList(body.relatedPackageCodes ?? body.relatedPackages), categories, itinerary,
  };
};

catalogRouter.post("/packages", ...superAdmin, validateBody(packageInput), asyncRoute(async (request, response) => {
  const payload = packagePayload(request.body as JsonObject);
  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO travel_packages (id, created_at, updated_at, deleted, package_code, hero_title, short_title, brand_name, days, avg_cost, pickup, best_time, climate, suitable, thumbnail_url, highlights, overview, includes_text, excludes_text, note, hero_images_json, related_package_codes_json)
       VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [id, payload.code, payload.heroTitle, payload.shortTitle, payload.brandName, payload.days, payload.avgCost, payload.pickup, payload.bestTime, payload.climate, payload.suitable, payload.thumbnail, payload.highlights, payload.overview, payload.includes, payload.excludes, payload.note, JSON.stringify(payload.heroImages), JSON.stringify(payload.related)],
    );
    await replacePackageRelations(client, id, payload.categories, payload.itinerary);
  });
  publicCache.clear("catalog");
  const saved = await packageByIdentifier(id);
  response.status(201).json(created(mapPackageDetail(saved, await itineraryForPackage(id), [])));
}));

catalogRouter.put("/packages/:code", ...superAdmin, validateBody(packageInput), asyncRoute(async (request, response) => {
  const existing = await packageByIdentifier(param(request.params.code));
  const payload = packagePayload(request.body as JsonObject, existing);
  const heroImages = payload.heroImages.length ? JSON.stringify(payload.heroImages) : existing.hero_images_json ?? "[]";
  const related = payload.related.length ? JSON.stringify(payload.related) : existing.related_package_codes_json ?? "[]";
  await transaction(async (client) => {
    await client.query(
      `UPDATE travel_packages SET package_code = $1, hero_title = $2, short_title = $3, brand_name = $4, days = $5, avg_cost = $6, pickup = $7, best_time = $8, climate = $9, suitable = $10, thumbnail_url = $11, highlights = $12, overview = $13, includes_text = $14, excludes_text = $15, note = $16, hero_images_json = $17, related_package_codes_json = $18, updated_at = NOW() WHERE id = $19`,
      [payload.code, payload.heroTitle, payload.shortTitle, payload.brandName, payload.days, payload.avgCost, payload.pickup, payload.bestTime, payload.climate, payload.suitable, payload.thumbnail, payload.highlights, payload.overview, payload.includes, payload.excludes, payload.note, heroImages, related, existing.id],
    );
    await replacePackageRelations(client, existing.id, payload.categories, payload.itinerary);
  });
  publicCache.clear("catalog");
  const saved = await packageByIdentifier(existing.id);
  response.json(ok(mapPackageDetail(saved, await itineraryForPackage(existing.id), [])));
}));

catalogRouter.delete("/packages/:code", ...superAdmin, asyncRoute(async (request, response) => {
  const pkg = await packageByIdentifier(param(request.params.code));
  const booking = await queryOne<{ id: string }>("SELECT id FROM tour_bookings WHERE package_id = $1 LIMIT 1", [pkg.id]);
  if (booking) throw conflict("This package has booking history. Permanently delete its bookings first.");
  await transaction(async (client) => {
    await client.query("DELETE FROM package_view_histories WHERE package_id = $1", [pkg.id]);
    await client.query("DELETE FROM featured_row_items WHERE LOWER(item_code) = LOWER($1)", [pkg.package_code]);
    await client.query("DELETE FROM travel_packages WHERE id = $1", [pkg.id]);
  });
  publicCache.clear("catalog");
  response.json(message("Package deleted"));
}));
