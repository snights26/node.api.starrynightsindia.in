# Migration status

## IMPLEMENTED

- Express `/api` service, response envelope, validation, CORS, Helmet, rate limiting, structured request/error logging, Swagger, Docker, and health endpoint.
- Existing-schema PostgreSQL mapping with no Node migration, schema reset, seed, or direct-admin database feature.
- JWT claims/session structure, Google customer sign-in, BCrypt administrator login, refresh rotation, logout, and limited ADMIN write policy.
- Catalog/categories/packages/itineraries, users/bucket lists/administrator accounts, content, gallery, notifications, keywords, support, tours, payments, Razorpay, cache, occasion popups, package views, and chatbot endpoints.
- Transactional templates for welcome/profile, enquiries/contact, booking/payment, payment link, career resume, and quotation PDFs. SMTP remains opt-in.
- Copied public/admin React applications with centralized environment API configuration.
- All target roots contain `.env.example` only; generated `dist` folders were removed after verification. Local `node_modules` is listed in each target's `.gitignore` and was installed for this verification, not copied from legacy projects.

## BUILD VERIFIED

- Node API: `npm run typecheck` and `npm run build` pass after the compatibility/security fixes.
- Public frontend: `npm run build` passes.
- Admin frontend: `npm run build` passes.
- Public home and admin login rendered in a local browser preview; no CORS or console errors were observed.

## DB VERIFIED

- A read-only Node `pg` connection to the existing Neon database succeeded.
- `GET /api/health` reported database `UP` in the read-only live smoke run.
- Read-only live requests returned: 859 packages, 439 categories, 9 featured rows, 5 hero slides, 5 homepage statistics, and a real package detail.
- `information_schema` verification confirmed 27 in-scope schema tables, required live columns, primary keys, and foreign-key targets. No schema modification was made.

## AUTHORIZATION VERIFIED

- Live synthetic-claim middleware probes verified anonymous/USER/ADMIN/SUPER_ADMIN boundaries, including ADMIN read access, ADMIN tour-route access, and SUPER_ADMIN-only mutation/account gates.
- See [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

## INTEGRATION VERIFIED

- Razorpay webhook source path uses raw-body HMAC SHA-256 and timing-safe comparison; disabled configuration returns no usable gateway client before payment-row persistence, and external provider/link failures clean up the just-created request.
- SMTP-disabled template/control-flow checks completed without delivery for welcome/profile, enquiry/contact, booking, payment, payment link, quotation, and career paths.
- Cache service cache-hit/invalidation/version behavior passed an in-memory test. The public manifest now includes a shared deployment epoch (`PUBLIC_BROWSER_CACHE_EPOCH`) so a restarted API cannot indefinitely accept a previous process's IndexedDB snapshot.
- Browser cache manifest and public content cache routes are implemented and live public data rendered through the copied frontend.

## DEFERRED / REQUIRES APPROVED INFRASTRUCTURE

- Real Google ID-token acceptance, existing administrator password login, and refresh-token persistence have been source-reviewed but not live-tested with a user-provided safe credential.
- SMTP, Cloudinary, and Razorpay test-mode delivery/callback flows require approved test credentials and safe recipients/webhooks. No email, upload, payment link, or charge was initiated.
- Controlled tour/package/payment write acceptance tests were not run: no dedicated test record or rollback-safe staging target was available, and production rows were not changed.
- The archive is migration input only. Runtime local upload serving, Docker mounts,
  and local writers are removed; Vercel Blob compatibility/direct-upload flows
  require external Blob store setup before deployment.
- The frontend source retains pre-existing lint findings; they do not block production builds.
- Docker image/container verification, deployed reverse-proxy verification, and real staging-browser API flows require a host with Docker and an approved staging environment. The available in-app browser blocks loopback API requests (`ERR_BLOCKED_BY_CLIENT`), so it was not treated as an application failure.

## STAGING VALIDATION ADDENDUM

- A local integration-disabled staging-like API process passed health/database/public-read/CORS probes. The controlled public enquiry probe returned 400 for invalid input, 201 for one `STG-CUTOVER-*` record, and its exact cleanup removed one row.
- Five live legacy-upload references were found (three historical career URLs and two notification PDFs); all five archive files exist and the Node static route returned 200 to a non-content `HEAD` check.
- No safe Google/customer/admin account, safe SMTP recipient, Cloudinary staging account, or safe Razorpay booking was available. Those live acceptance flows remain NOT EXECUTED.
- See `STAGING_CHECKLIST.md`, `LEGACY_UPLOAD_MIGRATION.md`, `PRODUCTION_CUTOVER_PLAN.md`, and `CUTOVER_ACCEPTANCE.md`.

## MISSING

No unexplained Spring production endpoint is missing. The API parity audit contains 131 fully migrated routes and 3 explicit partial compatibility differences (enhanced health envelope and local-upload compatibility behavior). See [API_PARITY_REPORT.md](API_PARITY_REPORT.md).
