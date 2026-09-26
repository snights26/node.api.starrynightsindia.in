import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../../db/pool.js";
import { asyncRoute, badRequest, created, message, notFound, ok, validateBody } from "../../lib/api.js";
import { authenticate, requireRole, requireAnyRole } from "../../lib/auth.js";
import { booleanValue, firstString, integerValue, isoDate, objectList, optionalString, stringValue, type JsonObject } from "../../lib/values.js";
import { publicCache } from "../../services/public-cache.js";
import { invalidatePublicCache, publicCdnCache, publicCdnPolicies } from "../../services/public-cdn-cache.js";
import { mapCategory, mapPackageSummary } from "../catalog/mapper.js";
import { categoryByCode, listCategories, listPackages } from "../catalog/repository.js";
import type { CategoryRow, PackageRow } from "../catalog/types.js";

export const contentRouter = Router();
const superAdmin = [authenticate, requireRole("SUPER_ADMIN")];
const adminRead = [authenticate, requireAnyRole("ADMIN", "SUPER_ADMIN")];
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const invalidateFeatured = async (): Promise<void> => {
  await invalidatePublicCache({ memoryGroups: ["featured"], tags: ["featured", "homepage", "packages", "categories"] });
};
const invalidateHomepage = async (tag: "hero" | "statistics"): Promise<void> => {
  await invalidatePublicCache({ memoryGroups: ["content"], tags: ["homepage", tag] });
};
const objectInput = z.object({
  id: z.string().trim().max(100).optional(), title: z.string().trim().max(255).optional(), rowId: z.string().trim().max(60).optional(), rowTitle: z.string().trim().max(255).optional(),
  type: z.string().trim().max(30).optional(), rowType: z.string().trim().max(30).optional(), visibleOn: z.string().trim().max(30).optional(), packageMode: z.string().trim().max(30).optional(), categoryMatchOperator: z.enum(["OR", "AND", "or", "and"]).optional(),
  sequence: z.union([z.number().int(), z.string()]).optional(), displayOrder: z.union([z.number().int(), z.string()]).optional(), active: z.union([z.boolean(), z.string(), z.number()]).optional(), status: z.string().trim().max(30).optional(),
  imageId: z.string().trim().max(60).optional(), imageUrl: z.string().trim().max(2000).optional(), image: z.string().trim().max(2000).optional(), url: z.string().trim().max(2000).optional(), link: z.string().trim().max(2000).optional(), linkUrl: z.string().trim().max(2000).optional(), subtitle: z.string().trim().max(500).optional(), subTitle: z.string().trim().max(500).optional(), description: z.string().trim().max(500).optional(),
  statisticTitle: z.string().trim().max(255).optional(), value: z.string().trim().max(80).optional(), statisticValue: z.string().trim().max(80).optional(), count: z.string().trim().max(80).optional(),
  items: z.array(z.object({ id: z.string().trim().max(255).optional(), code: z.string().trim().max(255).optional(), itemCode: z.string().trim().max(255).optional(), title: z.string().trim().max(255).optional(), name: z.string().trim().max(255).optional(), itemTitle: z.string().trim().max(255).optional(), type: z.string().trim().max(30).optional(), itemType: z.string().trim().max(30).optional(), sequence: z.union([z.number().int(), z.string()]).optional() }).passthrough()).optional(),
}).passthrough();
const orderInput = z.array(z.object({ rowId: z.string().trim().min(1).max(100).optional(), id: z.string().trim().min(1).max(100).optional(), sequence: z.union([z.number().int(), z.string()]).optional() }));

type FeaturedRow = { id: string; row_id: string; title: string; type: string; visible_on: string; package_mode: string; category_match_operator: "OR" | "AND"; sequence: number; items: unknown };
type HeroRow = { id: string; image_id: string; title: string; subtitle: string | null; image_url: string; link_url: string | null; active: boolean; sequence: number; created_at: Date | string; updated_at: Date | string };
type StatRow = { id: string; title: string; value: string; display_order: number; active: boolean; created_at: Date | string; updated_at: Date | string };

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (typeof value !== "string") return [];
  try { return parseItems(JSON.parse(value) as unknown); } catch { return []; }
};

const featureRows = async (visibleOn?: string): Promise<FeaturedRow[]> => {
  const values: unknown[] = [];
  const predicate = visibleOn ? "WHERE r.deleted = FALSE AND LOWER(r.visible_on) = LOWER($1)" : "WHERE r.deleted = FALSE";
  if (visibleOn) values.push(visibleOn);
  return query<FeaturedRow>(`SELECT r.*, COALESCE(json_agg(json_build_object('id', i.item_code, 'code', i.item_code, 'title', i.item_title, 'type', i.item_type, 'sequence', i.sequence) ORDER BY i.sequence) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
    FROM featured_rows r LEFT JOIN featured_row_items i ON i.row_id = r.id AND i.deleted = FALSE ${predicate} GROUP BY r.id ORDER BY r.sequence`, values);
};

const findRow = async (value: string): Promise<FeaturedRow> => {
  const row = await queryOne<FeaturedRow>(`SELECT r.*, COALESCE(json_agg(json_build_object('id', i.item_code, 'code', i.item_code, 'title', i.item_title, 'type', i.item_type, 'sequence', i.sequence) ORDER BY i.sequence) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
    FROM featured_rows r LEFT JOIN featured_row_items i ON i.row_id = r.id AND i.deleted = FALSE
    WHERE r.deleted = FALSE AND (LOWER(r.row_id) = LOWER($1) OR r.id::text = $1) GROUP BY r.id`, [value]);
  if (!row) throw notFound("Featured row not found");
  return row;
};

const mapFeaturedRow = (row: FeaturedRow): Record<string, unknown> => {
  const items = parseItems(row.items).map((item) => ({ id: stringValue(item.id), code: stringValue(item.code), title: stringValue(item.title), type: stringValue(item.type), sequence: integerValue(item.sequence) ?? 1 }));
  return { id: row.id, rowId: row.row_id, rowTitle: row.title, title: row.title, rowType: row.type, type: row.type, visibleOn: row.visible_on, packageMode: row.package_mode, categoryMatchOperator: row.category_match_operator ?? "OR", sequence: row.sequence, items, codes: items.map((item) => item.code) };
};

const mapHero = (hero: HeroRow): Record<string, unknown> => ({ id: hero.id, imageId: hero.image_id, title: hero.title, subtitle: hero.subtitle ?? "", image: hero.image_url, imageUrl: hero.image_url, link: hero.link_url ?? "", linkUrl: hero.link_url ?? "", active: hero.active, sequence: hero.sequence ?? 1, displayOrder: hero.sequence ?? 1, createdAt: isoDate(hero.created_at), updatedAt: isoDate(hero.updated_at) });
const mapStat = (stat: StatRow): Record<string, unknown> => ({ id: stat.id, title: stat.title, statisticTitle: stat.title, value: stat.value, statisticValue: stat.value, displayOrder: stat.display_order, sequence: stat.display_order, active: stat.active, status: stat.active ? "Active" : "Inactive", createdAt: isoDate(stat.created_at), updatedAt: isoDate(stat.updated_at) });

const publicFeatured = async (visibleOn: string): Promise<Record<string, unknown>[]> => {
  const rows = await featureRows(visibleOn);
  const categories = await listCategories();
  const categoriesByCode = new Map(categories.map((category) => [category.code.toLowerCase(), category]));
  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const category of categories) if (category.parent_code) childrenByParent.set(category.parent_code.toLowerCase(), [...(childrenByParent.get(category.parent_code.toLowerCase()) ?? []), category]);
  const packages = await listPackages();
  const summaries = packages.map(mapPackageSummary);
  const packagesByCode = new Map(summaries.map((pkg) => [String(pkg.code).toLowerCase(), pkg]));
  return rows.map((row) => {
    const result = mapFeaturedRow(row) as Record<string, unknown>;
    const rowItems = parseItems(row.items);
    if (row.type.toLowerCase() === "category") {
      const items: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const source of rowItems) {
        const sourceCode = firstString(source, "id", "code");
        const selected = categoriesByCode.get(sourceCode.toLowerCase());
        const expanded = row.package_mode.toLowerCase() === "parent" || selected?.sub_category ? [selected] : (childrenByParent.get(sourceCode.toLowerCase()) ?? [selected]);
        for (const category of expanded) {
          if (!category || seen.has(category.code.toLowerCase())) continue;
          seen.add(category.code.toLowerCase());
          items.push({ id: category.code, code: category.code, title: category.name || category.code, type: "category", image: category.thumbnail_url ?? "", thumbnailUrl: category.thumbnail_url ?? "", expandedFrom: sourceCode, sequence: items.length + 1 });
        }
      }
      result.items = items;
      result.codes = items.map((item) => item.code);
    } else if (row.type.toLowerCase() === "package" || row.type.toLowerCase() === "top10") {
      let resolved: Record<string, unknown>[] = [];
      if (row.package_mode.toLowerCase() === "subcategory") {
        const codes = rowItems.map((item) => firstString(item, "id", "code").toLowerCase()).filter(Boolean);
        resolved = summaries.filter((pkg) => {
          const found = new Set([...(pkg.categoryCodes as string[]), ...(pkg.parentCategoryCodes as string[])].map((code) => code.toLowerCase()));
          return row.category_match_operator === "AND" ? codes.every((code) => found.has(code)) : codes.some((code) => found.has(code));
        });
      } else {
        resolved = rowItems.map((item) => packagesByCode.get(firstString(item, "id", "code").toLowerCase())).filter((pkg): pkg is Record<string, unknown> => Boolean(pkg));
      }
      result.items = resolved;
      result.codes = resolved.map((pkg) => pkg.code);
    }
    return result;
  });
};

contentRouter.get("/featured-rows", ...adminRead, asyncRoute(async (_request, response) => response.json(ok((await featureRows()).map(mapFeaturedRow)))));
contentRouter.get("/featured-rows/public", publicCdnCache(publicCdnPolicies.homepage, ["featured", "homepage", "packages", "categories"]), asyncRoute(async (request, response) => {
  const visibleOn = typeof request.query.visibleOn === "string" ? request.query.visibleOn : "home";
  const data = await publicCache.getOrLoad(`featured:public:${visibleOn.toLowerCase()}`, () => publicFeatured(visibleOn));
  response.json(ok(data));
}));

const normalizeItems = async (rowType: string, packageMode: string, items: Array<Record<string, unknown>>): Promise<Array<{ code: string; title: string; type: string }>> => {
  const normalized: Array<{ code: string; title: string; type: string }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const code = firstString(item, "id", "code", "itemCode");
    if (!code) continue;
    if (rowType.toLowerCase() === "category" && packageMode.toLowerCase() === "children") {
      const selected = await categoryByCode(code).catch(() => undefined);
      const children = selected && !selected.sub_category ? await query<CategoryRow>("SELECT c.*, p.code AS parent_code, p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.deleted = FALSE AND c.parent_id = $1 ORDER BY c.name", [selected.id]) : [];
      for (const child of children.length ? children : selected ? [selected] : []) {
        if (seen.has(child.code.toLowerCase())) continue;
        seen.add(child.code.toLowerCase()); normalized.push({ code: child.code, title: child.name, type: "category" });
      }
      continue;
    }
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase()); normalized.push({ code, title: firstString(item, "title", "name", "itemTitle") || code, type: firstString(item, "type", "itemType") || rowType });
  }
  return normalized;
};

const writeRow = async (id: string, body: JsonObject, existing?: FeaturedRow): Promise<FeaturedRow> => {
  const rowId = firstString(body, "rowId", "id") || existing?.row_id || `ROW${Date.now()}`;
  const title = firstString(body, "title", "rowTitle") || existing?.title || rowId;
  const type = firstString(body, "type", "rowType") || existing?.type || "package";
  const visibleOn = firstString(body, "visibleOn") || existing?.visible_on || "home";
  const packageMode = firstString(body, "packageMode") || existing?.package_mode || "name";
  const operator = firstString(body, "categoryMatchOperator").toUpperCase() === "AND" ? "AND" : existing?.category_match_operator ?? "OR";
  const sequence = integerValue(body.sequence) ?? existing?.sequence ?? 1;
  const items = await normalizeItems(type, packageMode, objectList(body.items));
  await transaction(async (client) => {
    if (existing) await client.query("UPDATE featured_rows SET row_id=$1,title=$2,type=$3,visible_on=$4,package_mode=$5,category_match_operator=$6,sequence=$7,updated_at=NOW() WHERE id=$8", [rowId, title, type, visibleOn, packageMode, operator, sequence, id]);
    else await client.query("INSERT INTO featured_rows (id,created_at,updated_at,deleted,row_id,title,type,visible_on,package_mode,category_match_operator,sequence) VALUES ($1,NOW(),NOW(),FALSE,$2,$3,$4,$5,$6,$7,$8)", [id, rowId, title, type, visibleOn, packageMode, operator, sequence]);
    await client.query("DELETE FROM featured_row_items WHERE row_id = $1", [id]);
    for (const [index, item] of items.entries()) await client.query("INSERT INTO featured_row_items (id,created_at,updated_at,deleted,row_id,item_code,item_title,item_type,sequence) VALUES ($1,NOW(),NOW(),FALSE,$2,$3,$4,$5,$6)", [randomUUID(), id, item.code, item.title, item.type, index + 1]);
  });
  return findRow(id);
};

contentRouter.post("/featured-rows", ...superAdmin, validateBody(objectInput), asyncRoute(async (request, response) => {
  const saved = await writeRow(randomUUID(), request.body as JsonObject);
  await invalidateFeatured(); response.status(201).json(created(mapFeaturedRow(saved)));
}));
contentRouter.put("/featured-rows/:rowId", ...superAdmin, validateBody(objectInput), asyncRoute(async (request, response) => {
  const existing = await findRow(param(request.params.rowId)); const saved = await writeRow(existing.id, request.body as JsonObject, existing);
  await invalidateFeatured(); response.json(ok(mapFeaturedRow(saved)));
}));
contentRouter.post("/featured-rows/order", ...superAdmin, validateBody(orderInput), asyncRoute(async (request, response) => {
  for (const item of request.body as z.infer<typeof orderInput>) { const row = await findRow(item.rowId || item.id || ""); const sequence = integerValue(item.sequence); if (sequence !== null) await queryOne("UPDATE featured_rows SET sequence=$1,updated_at=NOW() WHERE id=$2", [sequence, row.id]); }
  await invalidateFeatured(); response.json(message("Featured row order saved"));
}));
contentRouter.delete("/featured-rows/:rowId", ...superAdmin, asyncRoute(async (request, response) => { const row = await findRow(param(request.params.rowId)); await queryOne("DELETE FROM featured_rows WHERE id=$1", [row.id]); await invalidateFeatured(); response.json(message("Featured row deleted")); }));

const heroes = async (publicOnly = false): Promise<HeroRow[]> => query<HeroRow>(`SELECT * FROM hero_slider_images WHERE deleted=FALSE ${publicOnly ? "AND active=TRUE" : ""} ORDER BY sequence`);
contentRouter.get("/hero-sliders", ...adminRead, asyncRoute(async (_request, response) => response.json(ok((await heroes()).map(mapHero)))));
contentRouter.get("/hero-sliders/public", publicCdnCache(publicCdnPolicies.homepage, ["homepage", "hero"]), asyncRoute(async (_request, response) => response.json(ok(await publicCache.getOrLoad("content:hero", async () => (await heroes(true)).map(mapHero))))));
const findHero = async (value: string): Promise<HeroRow> => { const hero = await queryOne<HeroRow>("SELECT * FROM hero_slider_images WHERE deleted=FALSE AND (image_id ILIKE $1 OR id::text=$1)", [value]); if (!hero) throw notFound("Hero image not found"); return hero; };
const writeHero = async (id: string, body: JsonObject, existing?: HeroRow): Promise<HeroRow> => {
  const imageId = firstString(body, "imageId", "id") || existing?.image_id || `HERO${Date.now()}`; const title = firstString(body, "title") || existing?.title || imageId;
  const imageUrl = firstString(body, "imageUrl", "image", "url") || existing?.image_url || ""; if (!imageUrl) throw badRequest("Hero image URL is required");
  const subtitle = optionalString(body, "subtitle", "subTitle", "description"); const linkUrl = optionalString(body, "link", "linkUrl"); const sequence = integerValue(body.sequence ?? body.displayOrder) ?? existing?.sequence ?? 1;
  const active = body.active === undefined ? existing?.active ?? true : booleanValue(body.active);
  if (existing) await queryOne("UPDATE hero_slider_images SET image_id=$1,title=$2,subtitle=$3,image_url=$4,link_url=$5,active=$6,sequence=$7,updated_at=NOW() WHERE id=$8", [imageId,title,subtitle,imageUrl,linkUrl,active,sequence,id]);
  else await queryOne("INSERT INTO hero_slider_images (id,created_at,updated_at,deleted,image_id,title,subtitle,image_url,link_url,active,sequence) VALUES ($1,NOW(),NOW(),FALSE,$2,$3,$4,$5,$6,$7,$8)", [id,imageId,title,subtitle,imageUrl,linkUrl,active,sequence]);
  return findHero(id);
};
contentRouter.post("/hero-sliders", ...superAdmin, validateBody(objectInput), asyncRoute(async (request,response) => { const hero=await writeHero(randomUUID(),request.body as JsonObject);await invalidateHomepage("hero");response.status(201).json(created(mapHero(hero))); }));
contentRouter.put("/hero-sliders/:imageId", ...superAdmin, validateBody(objectInput), asyncRoute(async (request,response) => { const old=await findHero(param(request.params.imageId));const hero=await writeHero(old.id,request.body as JsonObject,old);await invalidateHomepage("hero");response.json(ok(mapHero(hero))); }));
contentRouter.delete("/hero-sliders/:imageId", ...superAdmin, asyncRoute(async (request,response) => {const hero=await findHero(param(request.params.imageId));await queryOne("DELETE FROM hero_slider_images WHERE id=$1",[hero.id]);await invalidateHomepage("hero");response.json(message("Hero slider image deleted"));}));

const statistics = async (publicOnly = false): Promise<StatRow[]> => query<StatRow>(`SELECT * FROM homepage_statistics WHERE deleted=FALSE ${publicOnly ? "AND active=TRUE" : ""} ORDER BY display_order`);
contentRouter.get("/homepage-statistics", ...adminRead, asyncRoute(async (_request,response)=>response.json(ok((await statistics()).map(mapStat)))));
contentRouter.get("/homepage-statistics/public", publicCdnCache(publicCdnPolicies.homepage, ["homepage", "statistics"]), asyncRoute(async (_request,response)=>response.json(ok(await publicCache.getOrLoad("content:statistics",async()=> (await statistics(true)).map(mapStat))))));
const findStat = async (id:string):Promise<StatRow>=>{const stat=await queryOne<StatRow>("SELECT * FROM homepage_statistics WHERE id=$1 AND deleted=FALSE",[id]);if(!stat)throw notFound("Homepage statistic not found");return stat;};
const writeStat = async(id:string,body:JsonObject,existing?:StatRow):Promise<StatRow>=>{const title=firstString(body,"title","statisticTitle")||existing?.title||"";const value=firstString(body,"value","statisticValue","count")||existing?.value||"";const displayOrder=integerValue(body.displayOrder??body.sequence)??existing?.display_order??0;if(!title)throw badRequest("Statistic title is required");if(!value)throw badRequest("Statistic value is required");if(displayOrder<1)throw badRequest("Display order must be at least 1");const active=body.active===undefined?(body.status===undefined?existing?.active??true:firstString(body,"status").toLowerCase()==="active"):booleanValue(body.active);if(existing)await queryOne("UPDATE homepage_statistics SET title=$1,value=$2,display_order=$3,active=$4,updated_at=NOW() WHERE id=$5",[title,value,displayOrder,active,id]);else await queryOne("INSERT INTO homepage_statistics (id,created_at,updated_at,deleted,title,value,display_order,active) VALUES ($1,NOW(),NOW(),FALSE,$2,$3,$4,$5)",[id,title,value,displayOrder,active]);return findStat(id);};
contentRouter.post("/homepage-statistics",...superAdmin,validateBody(objectInput),asyncRoute(async(request,response)=>{const stat=await writeStat(randomUUID(),request.body as JsonObject);await invalidateHomepage("statistics");response.status(201).json(created(mapStat(stat)));}));
contentRouter.put("/homepage-statistics/:id",...superAdmin,validateBody(objectInput),asyncRoute(async(request,response)=>{const old=await findStat(param(request.params.id));const stat=await writeStat(old.id,request.body as JsonObject,old);await invalidateHomepage("statistics");response.json(ok(mapStat(stat)));}));
contentRouter.delete("/homepage-statistics/:id",...superAdmin,asyncRoute(async(request,response)=>{const stat=await findStat(param(request.params.id));await queryOne("DELETE FROM homepage_statistics WHERE id=$1",[stat.id]);await invalidateHomepage("statistics");response.json(message("Homepage statistic deleted"));}));
