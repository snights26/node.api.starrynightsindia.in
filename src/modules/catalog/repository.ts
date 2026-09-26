import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, queryOne } from "../../db/pool.js";
import { notFound } from "../../lib/api.js";
import type { CategoryRow, ItineraryRow, PackageRow } from "./types.js";

const packageSelect = `
  SELECT p.*,
    COALESCE(json_agg(json_build_object(
      'code', c.code, 'name', c.name, 'isSubcategory', c.sub_category,
      'parentCode', parent.code, 'parentName', parent.name
    ) ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS categories
  FROM travel_packages p
  LEFT JOIN package_categories pc ON pc.package_id = p.id
  LEFT JOIN categories c ON c.id = pc.category_id AND c.deleted = FALSE
  LEFT JOIN categories parent ON parent.id = c.parent_id
`;

const packageGroup = " GROUP BY p.id";

export const listCategories = async (): Promise<CategoryRow[]> => query<CategoryRow>(`
  SELECT c.*, parent.code AS parent_code, parent.name AS parent_name
  FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id
  WHERE c.deleted = FALSE ORDER BY c.name ASC`);

export const categoryByCode = async (code: string): Promise<CategoryRow> => {
  const row = await queryOne<CategoryRow>(`
    SELECT c.*, parent.code AS parent_code, parent.name AS parent_name
    FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE c.deleted = FALSE AND LOWER(c.code) = LOWER($1)`, [code]);
  if (!row) throw notFound("Category not found");
  return row;
};

export const listPackages = async (filter?: { category?: string; brand?: string; packageCodes?: string[] }): Promise<PackageRow[]> => {
  const conditions = ["p.deleted = FALSE"];
  const values: unknown[] = [];
  if (filter?.brand) {
    values.push(filter.brand);
    conditions.push(`LOWER(COALESCE(p.brand_name, '')) = LOWER($${values.length})`);
  }
  if (filter?.packageCodes?.length) {
    values.push(filter.packageCodes);
    conditions.push(`LOWER(p.package_code) = ANY(ARRAY(SELECT LOWER(value) FROM unnest($${values.length}::text[]) AS value))`);
  }
  if (filter?.category) {
    values.push(filter.category);
    conditions.push(`EXISTS (
      WITH RECURSIVE branch AS (
        SELECT id FROM categories WHERE deleted = FALSE AND LOWER(code) = LOWER($${values.length})
        UNION ALL
        SELECT child.id FROM categories child JOIN branch ON child.parent_id = branch.id WHERE child.deleted = FALSE
      )
      SELECT 1 FROM package_categories filtered_pc JOIN branch ON branch.id = filtered_pc.category_id WHERE filtered_pc.package_id = p.id
    )`);
  }
  return query<PackageRow>(`${packageSelect} WHERE ${conditions.join(" AND ")}${packageGroup} ORDER BY LOWER(p.hero_title) ASC`, values);
};

export const packageByIdentifier = async (identifier: string): Promise<PackageRow> => {
  const row = await queryOne<PackageRow>(`${packageSelect}
    WHERE p.deleted = FALSE AND (LOWER(p.package_code) = LOWER($1) OR CAST(p.id AS TEXT) = $1)${packageGroup}`, [identifier]);
  if (!row) throw notFound("Package not found");
  return row;
};

export const itineraryForPackage = async (packageId: string): Promise<ItineraryRow[]> => query<ItineraryRow>(
  "SELECT day_number, title, description FROM package_itineraries WHERE package_id = $1 AND deleted = FALSE ORDER BY day_number ASC", [packageId]);

export const categoryTreeRows = async (): Promise<CategoryRow[]> => listCategories();

export const replacePackageRelations = async (client: PoolClient, packageId: string, categoryCodes: string[], itinerary: Array<{ day: number; title: string; description: string }>): Promise<void> => {
  await client.query("DELETE FROM package_categories WHERE package_id = $1", [packageId]);
  if (categoryCodes.length) {
    const categories = await client.query<{ id: string }>("SELECT id FROM categories WHERE deleted = FALSE AND LOWER(code) = ANY(ARRAY(SELECT LOWER(value) FROM unnest($1::text[]) AS value))", [categoryCodes]);
    for (const category of categories.rows) {
      await client.query("INSERT INTO package_categories (package_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [packageId, category.id]);
    }
  }
  await client.query("DELETE FROM package_itineraries WHERE package_id = $1", [packageId]);
  for (const item of itinerary) {
    await client.query(
      `INSERT INTO package_itineraries (id, created_at, updated_at, deleted, package_id, day_number, title, description)
       VALUES ($1, NOW(), NOW(), FALSE, $2, $3, $4, $5)`,
      [randomUUID(), packageId, item.day, item.title || null, item.description || null],
    );
  }
};
