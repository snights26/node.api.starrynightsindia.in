import { isoDate, parseJsonList } from "../../lib/values.js";
import type { CategoryRow, ItineraryRow, PackageCategory, PackageRow } from "./types.js";

const safe = (value: string | null | undefined): string => value ?? "";

const asCategories = (value: PackageRow["categories"]): PackageCategory[] => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as PackageCategory[] : [];
  } catch {
    return [];
  }
};

export const mapCategory = (category: CategoryRow): Record<string, unknown> => ({
  id: category.id,
  code: category.code,
  categoryCode: category.code,
  name: category.name,
  categoryName: category.name,
  title: category.name,
  isSub: category.sub_category,
  isSubcategory: category.sub_category,
  parent: category.parent_code ?? "-",
  thumbnailUrl: safe(category.thumbnail_url),
  image: safe(category.thumbnail_url),
});

export const mapPackageSummary = (pkg: PackageRow): Record<string, unknown> => {
  const categories = asCategories(pkg.categories);
  const title = pkg.short_title?.trim() || pkg.hero_title;
  const heroImages = parseJsonList(pkg.hero_images_json);
  const image = pkg.thumbnail_url?.trim() || heroImages[0] || "";
  return {
    id: pkg.id,
    packageCode: pkg.package_code,
    code: pkg.package_code,
    name: title,
    title,
    image,
    thumbnailUrl: safe(pkg.thumbnail_url),
    days: pkg.days ?? 0,
    duration: pkg.days && pkg.days > 0 ? `${pkg.days} Days` : "",
    avgCost: safe(pkg.avg_cost),
    pickup: safe(pkg.pickup),
    location: safe(pkg.pickup),
    categories,
    categoryCodes: categories.map((category) => category.code),
    parentCategoryCodes: [...new Set(categories.map((category) => category.parentCode).filter(Boolean))],
    subcategoryCodes: categories.filter((category) => category.isSubcategory).map((category) => category.code),
  };
};

const lines = (value: string | null): string[] => value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];

export const mapPackageDetail = (pkg: PackageRow, itinerary: ItineraryRow[], related: PackageRow[]): Record<string, unknown> => {
  const categories = asCategories(pkg.categories);
  const title = pkg.short_title?.trim() || pkg.hero_title;
  return {
    id: pkg.id,
    packageCode: pkg.package_code,
    code: pkg.package_code,
    name: title,
    heroTitle: safe(pkg.hero_title),
    shortTitle: safe(pkg.short_title),
    brandName: safe(pkg.brand_name),
    days: pkg.days ?? 0,
    region: "India",
    category: categories[0]?.name ?? "Travel",
    categoryCodes: categories.map((category) => category.code),
    overview: safe(pkg.overview),
    highlights: safe(pkg.highlights),
    avgCost: safe(pkg.avg_cost),
    pickup: safe(pkg.pickup),
    bestTime: safe(pkg.best_time),
    climate: safe(pkg.climate),
    suitable: safe(pkg.suitable),
    note: safe(pkg.note),
    images: parseJsonList(pkg.hero_images_json),
    thumbnailUrl: safe(pkg.thumbnail_url),
    itinerary: itinerary.map((item) => ({
      day: item.day_number,
      dayNumber: item.day_number,
      title: safe(item.title),
      desc: safe(item.description),
      description: safe(item.description),
    })),
    info: {
      bestTime: safe(pkg.best_time), cost: safe(pkg.avg_cost), pickup: safe(pkg.pickup), climate: safe(pkg.climate),
      note: safe(pkg.note), suitable: safe(pkg.suitable),
    },
    inclusions: lines(pkg.includes_text),
    exclusions: lines(pkg.excludes_text),
    relatedPackages: related.map(mapPackageSummary),
  };
};

export const packageUpdatedAt = (pkg: PackageRow): string => isoDate(pkg.updated_at);
