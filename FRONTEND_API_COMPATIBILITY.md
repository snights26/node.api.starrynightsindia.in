# Frontend API compatibility audit

Both legacy React trees were scanned for Axios clients, `fetch`, helpers, and interpolated paths. The copied Node frontend trees use the same source paths; their centralized clients read `VITE_API_BASE_URL` (and, for public chatbot calls, optional `VITE_CHATBOT_API_BASE_URL`). Axios unwraps the shared `{ success, message, data }` envelope exactly as before.

## Public application calls

| Method | Legacy call pattern | Node endpoint | Status | Request/response check |
|---|---|---|---|---|
| POST | `/auth/google` | `/auth/google` | Match | `{idToken}`; auth/session envelope |
| POST | `/auth/refresh`, `/auth/logout` | Same | Match | `{refreshToken}`; shared auth envelope |
| GET | `/users/me` | Same | Match | current-user mapper |
| GET/POST/PUT | `/users/me/bucket-list`, `/users/me/bucket-list/{code}` | Same | Match | package codes and list response |
| PUT | `/users/me/complete-profile` | Same | Match | copied profile form aliases accepted |
| GET | `/public-cache/manifest` | Same | Match | schemaCompatibilityVersion and version keys retained |
| GET | `/packages`, `/packages/{code}`, `/categories`, `/categories/tree`, `/featured-rows/public?visibleOn={key}` | Same | Match | public cache helper receives identical envelope/data lists |
| GET | `/hero-sliders/public`, `/homepage-statistics/public`, `/gallery/public`, `/notifications/public`, `/occasion-popups/current` | Same | Match | public presentation mappers |
| POST | `/enquiries`, `/contact`, `/career-apply` | Same | Match | JSON/contact and `resume` multipart contracts retained |
| POST | `/chatbot/query` | Same | Match | chatbot client uses its configured API base |
| GET | `/notifications/me`, `/mytours?email={email}`, `/my-payments`, `/payments/invoice/{tourId}` | Same | Match | Node ignores untrusted `email` query and uses JWT owner |
| POST/GET/DELETE | `/package-views`, `/package-views/me`, `/package-views/me/{code}` | Same | Match | guest session and authenticated history behavior retained |
| GET/POST/DELETE | `/get-photos?userId={id}`, `/upload-photo`, `/delete-photo/{id}` | Same | Match | Node uses JWT owner rather than trusting query `userId`; `file` multipart preserved |

No public URL is missing. The deliberate `mytours`/photo ownership tightening does not require a frontend change because the copied client already attaches its bearer token.

## Admin application calls

| Area | Legacy call patterns audited | Node endpoint(s) | Status |
|---|---|---|---|
| Session | `POST /auth/admin/login`, `/auth/refresh`, `/auth/logout` | Same | Match |
| Catalog | `GET/POST/PUT/DELETE /packages`, `/packages/{id}`, `/categories`, `/categories/{code}`, `/categories/tree`, `/categories/{code}/packages`, `/categories/{code}/packages/{packageCode}` | Same | Match |
| Bookings | `GET/POST/PUT/DELETE /tours`, `/tours/{id}` | Same | Match |
| Payments | `GET/POST/DELETE /payments`, `/payments/tour-lookup/{id}`, `/payments/invoice/{id}`, `POST /payments/{id}/razorpay/{resend|refresh|cancel}` | Same | Match |
| Users | `GET/DELETE /users`, `/users/{id}`, `/users/liked-packages/report` | Same | Match |
| Administrators | `GET/POST /admin-accounts`, `PUT /admin-accounts/{id}/{role|password}`, `DELETE /admin-accounts/{id}` | Same | Match |
| Content | `GET/POST/PUT/DELETE /featured-rows`, `/featured-rows/{id}`, `/featured-rows/order`, `/hero-sliders`, `/hero-sliders/{id}`, `/homepage-statistics`, `/homepage-statistics/{id}` | Same | Match |
| Gallery and upload | `POST /files`, `GET/POST/PUT/DELETE /gallery`, `/gallery/{id}` | Same | Match; `POST /files` has the Spring-equivalent global limited-ADMIN gate (SUPER_ADMIN effective) and `{url}` response |
| Notifications | `GET/POST/PUT/DELETE /notifications`, `/notifications/{id}` | Same | Match |
| Keywords / chatbot | `GET/POST/PUT/DELETE /keywords`, `/keywords/{id}`, `GET /chatbot/analytics`, `GET/POST/DELETE /unanswered`, `/unanswered/{id}/answer` | Same | Match |
| Views | `GET /package-views/viewers`, `/guest-packages`, `/guest-packages/{code}/viewers`, `/viewers/{id}/packages` | Same | Match |
| Cache | `GET /cache-management/status`; all `POST /cache-management/{rebuild|clear}/...` paths | Same | Match |
| Occasion popups | `GET/POST/PUT/DELETE /occasion-popups`, `/occasion-popups/{id}`, `/occasion-popups/{id}/{activate|deactivate}` | Same | Match |
| Support | `POST /quotations/email`, `GET/DELETE /admin/customer-submissions/{contacts|careers}/{id?}` | Same | Match |
| Shared public pages in admin bundle | `POST /contact`, `POST /career-apply` | Same | Match |

## Field and status-code findings

- No Node endpoint used by either frontend is missing.
- Public and admin response interceptors receive the same top-level `data` payload. Node mappers intentionally retain legacy alias fields such as `image`/`imageUrl`, `id`/`rowId`, and payment/tour identifier variants.
- The only compatibility-relevant authorization tightening is deliberate: ownership comes from the JWT instead of a client-provided `email` or `userId` query/body hint.
- The Node `POST /files` response was corrected during this audit to exactly retain `201` plus `{ success, message, data: { url } }`. Missing multipart files return 400; live probes confirmed USER/ADMIN 403 and SUPER_ADMIN 400 before any upload.
- Browser checks: public home rendered live DB content with no CORS or console errors. The admin login screen rendered with no console errors; authenticated admin UI traversal was not performed because no safe existing credential was supplied.

## Runtime configuration result

`rg` scans of both Node frontend targets found no hardcoded API host, Spring URL, JDBC URL, secret, or production port in source. The only localhost references are the `.env.example` development values. Static contact, maps, phone, and public asset URLs were intentionally retained.
