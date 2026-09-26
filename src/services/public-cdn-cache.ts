import { invalidateByTag } from "@vercel/functions";
import type { Request, RequestHandler, Response } from "express";
import { publicCache } from "./public-cache.js";

export type PublicCdnPolicy = {
  maxAge: number;
  staleWhileRevalidate: number;
  staleIfError?: number;
};

/** CDN-only TTLs for shared, anonymous GET responses. Values are seconds. */
export const publicCdnPolicies = {
  packages: { maxAge: 300, staleWhileRevalidate: 1800, staleIfError: 3600 },
  packageDetail: { maxAge: 600, staleWhileRevalidate: 1800 },
  categories: { maxAge: 1800, staleWhileRevalidate: 3600 },
  homepage: { maxAge: 300, staleWhileRevalidate: 1800 },
  gallery: { maxAge: 600, staleWhileRevalidate: 1800 },
  publicNotifications: { maxAge: 60, staleWhileRevalidate: 300 },
} as const satisfies Record<string, PublicCdnPolicy>;
type CacheTags = readonly string[] | ((request: Request) => readonly string[]);

const browserCacheControl = "public, max-age=0, must-revalidate";
const privateNoStore = "private, no-store";

const normalizeTag = (tag: string): string => tag
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._:-]/g, "_")
  .slice(0, 256);

const normalizedTags = (tags: readonly string[]): string[] => [...new Set(tags.map(normalizeTag).filter(Boolean))];

const cacheControlFor = (policy: PublicCdnPolicy): string => [
  "public",
  `max-age=${policy.maxAge}`,
  `stale-while-revalidate=${policy.staleWhileRevalidate}`,
  ...(policy.staleIfError ? [`stale-if-error=${policy.staleIfError}`] : []),
].join(", ");

export const cacheTag = (prefix: string, value: string): string => `${prefix}:${value}`;

/**
 * The API starts private/no-store and only named, anonymous public GET routes
 * opt into CDN caching. This keeps authorization, writes, health, and errors
 * out of every shared cache even when a route is added later.
 */
export const applyNoStore = (response: Response): void => {
  response.setHeader("Cache-Control", privateNoStore);
  response.setHeader("CDN-Cache-Control", privateNoStore);
  response.setHeader("Vercel-CDN-Cache-Control", privateNoStore);
  response.removeHeader("Vercel-Cache-Tag");
};

export const noStoreByDefault: RequestHandler = (_request, response, next) => {
  applyNoStore(response);
  next();
};

/**
 * Makes only an anonymous GET response cacheable at the Vercel CDN. Browser
 * caching remains at max-age=0. Authorization-bearing requests retain no-store
 * even when they target an otherwise public endpoint.
 */
export const publicCdnCache = (policy: PublicCdnPolicy, tags: CacheTags): RequestHandler =>
  (request, response, next) => {
    if (request.method !== "GET" || Boolean(request.header("authorization"))) {
      applyNoStore(response);
      next();
      return;
    }

    const resolvedTags = normalizedTags(typeof tags === "function" ? tags(request) : tags);
    response.setHeader("Cache-Control", browserCacheControl);
    response.removeHeader("CDN-Cache-Control");
    response.setHeader("Vercel-CDN-Cache-Control", cacheControlFor(policy));
    response.setHeader("Vercel-Cache-Tag", resolvedTags.join(","));
    // CORS uses a different allow-origin value per approved browser origin.
    // Vary keeps cached representations from being replayed across origins.
    response.vary("Origin");
    next();
  };

type Invalidation = {
  memoryGroups: readonly string[];
  tags: readonly string[];
};

/**
 * Invalidates local best-effort entries and then marks matching Vercel CDN
 * entries stale. The official runtime API is a local no-op and failures are
 * deliberately non-fatal: TTL/SWR remains the safe fallback after a committed
 * database mutation.
 */
export const invalidatePublicCache = async ({ memoryGroups, tags }: Invalidation): Promise<void> => {
  for (const group of memoryGroups) publicCache.clear(group);
  const resolvedTags = normalizedTags(tags);
  if (!resolvedTags.length) return;
  try {
    await invalidateByTag(resolvedTags);
  } catch {
    // A successful mutation must not fail merely because an edge purge is
    // temporarily unavailable. Cached responses expire under their policy.
  }
};
