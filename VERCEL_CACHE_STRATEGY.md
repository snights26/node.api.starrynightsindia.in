# Vercel public API cache strategy

## Goals and boundaries

Vercel CDN caching reduces repeated Function and Neon reads for anonymous,
read-only public API responses. It is a performance optimization only: the
database remains authoritative, and the existing in-memory LRU cache remains a
best-effort per-instance optimization. Correctness never depends on process
memory or an edge cache being available.

Every `/api` response starts with `Cache-Control: private, no-store`. Only the
route middleware in `src/services/public-cdn-cache.ts` can replace that default,
and only for an anonymous `GET` request. A request carrying an `Authorization`
header remains `private, no-store` even if it targets a public route.

The browser receives `Cache-Control: public, max-age=0, must-revalidate` for a
cacheable public response. The shared cache policy is instead sent through
`Vercel-CDN-Cache-Control`, so browsers do not retain stale API JSON.

## Public CDN policies

All durations are seconds. Vercel cache keys include the full request URL,
including query parameters; therefore `/featured-rows/public?visibleOn=home`
and another `visibleOn` value never share a response.

| Route(s) | Fresh | Stale while revalidate | Stale if error | Tags |
| --- | ---: | ---: | ---: | --- |
| `GET /api/packages` | 300 | 1800 | 3600 | `catalog`, `packages` (plus `featured-row:<id>` for `rowId`) |
| `GET /api/packages/:code` | 600 | 1800 | — | `catalog`, `packages`, `package:<code>` |
| `GET /api/categories`, `/tree`, `/:code`, `/:code/packages` | 1800 | 3600 | — | `catalog`, `categories`, plus applicable `category:<code>` and `packages` |
| `GET /api/hero-sliders/public` | 300 | 1800 | — | `homepage`, `hero` |
| `GET /api/featured-rows/public` | 300 | 1800 | — | `homepage`, `featured`, `packages`, `categories` |
| `GET /api/homepage-statistics/public` | 300 | 1800 | — | `homepage`, `statistics` |
| `GET /api/occasion-popups/current` | 300 | 1800 | — | `homepage`, `occasion` |
| `GET /api/gallery/public` | 600 | 1800 | — | `gallery` |
| `GET /api/notifications/public` | 60 | 300 | — | `public-notifications` |

`Vercel-Cache-Tag` is emitted only for those anonymous public responses. Tag
values are normalized before use and never derive directly into a header from
unsanitized input.

## Privacy and authorization rules

The following remain explicitly private/no-store and are never tagged:

- `/api/health`
- all auth and Google-auth routes, including refresh and logout
- `/api/users/*`, bucket lists, travel history, `/api/mytours`, and `/api/my-payments`
- `/api/payments/*`, invoices, customer photos, `/api/get-photos`, and `/api/notifications/me`
- every admin route and private document/download route
- chatbot and enquiry writes
- every `POST`, `PUT`, `PATCH`, and `DELETE`
- all 401, 403, 4xx, and 5xx error responses
- any otherwise-public route requested with an `Authorization` header

The global no-store middleware and error handler enforce these rules even for
new routes that have not been reviewed for CDN caching.

## CORS and cache separation

The cacheable public middleware adds `Vary: Origin`. This is necessary because
the CORS middleware returns an origin-specific `Access-Control-Allow-Origin`
value for each approved browser origin. It prevents the CDN from replaying one
origin's CORS response to another. `OPTIONS` preflights and all non-GET methods
remain no-store.

## Invalidation and fallback

After a successful database mutation, public catalogue, homepage, gallery,
notification, and occasion mutation routes:

1. clear only their relevant local LRU groups;
2. call Vercel's official `invalidateByTag()` API for matching CDN tags; and
3. continue successfully if Vercel's purge runtime is unavailable.

The purge is called only after the database transaction/write succeeds. The
official Vercel runtime API is a no-op outside Vercel. If it is unavailable or
temporarily fails, the documented TTL/SWR policy is the safe fallback; no
mutation is rolled back or reported as failed merely because a cache purge did
not run.

The mutation/tag mapping is:

- packages and category relationships: `catalog`, `packages`, `categories`,
  `featured`, `homepage`, and relevant package/category tags;
- featured rows: `featured`, `homepage`, `packages`, `categories`;
- hero sliders: `homepage`, `hero`;
- statistics: `homepage`, `statistics`;
- occasion popups: `homepage`, `occasion`;
- public gallery mutations: `gallery`;
- public notification mutations: `public-notifications`.

No active cache purge is attempted for unrelated private/customer-only routes.

## Verification

After deployment, make an anonymous request twice to each listed endpoint and
inspect `x-vercel-cache` for the expected miss/hit progression. The
Vercel-specific cache-control header is consumed by Vercel, so clients should
expect the conservative browser `Cache-Control` header instead. Repeat a
request with each approved `Origin` and confirm the origin-specific CORS header
is preserved. Send an `Authorization` header to a public endpoint and confirm
the result is `private, no-store` with no cache tag.
