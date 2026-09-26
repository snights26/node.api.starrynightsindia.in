# Staging integration audit

Updated: 2026-09-26. This inventory covers only the new Node API, Node/Vite
public and admin frontends, and Expo mobile application. It never treats the
Vercel `Production` target as the production application: that target is
explicitly application staging and is guarded by `DEPLOYMENT_ENVIRONMENT` and
`DATABASE_ENVIRONMENT`.

## Status meanings

| Status | Meaning |
| --- | --- |
| `ENABLED` | Configured and verified for the current staging deployment or build. |
| `DISABLED` | Deliberately off in the deployed runtime. |
| `PARTIALLY CONFIGURED` | Safe implementation/configuration exists, but an end-to-end check remains. |
| `BLOCKED BY ACCOUNT ACTION` | Requires a provider-console/account-owner action or credential. |
| `BLOCKED BY MISSING SAFE TEST INPUT` | Requires an approved staging user, recipient, or fixture. |
| `NOT REQUIRED` | Not needed for the current staging architecture. |
| `FAILED` | Attempted and failed; no failure is hidden as a pass. |

## API and deployment

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| Explicit deployment and database labels | `ENABLED` | Startup rejects a missing/mismatched label outside local; health exposes labels without exposing connection details. | None. |
| Neon pooled staging database | `ENABLED` | Health reports database `UP`; deployment guard requires the configured database label to equal `staging`. | Branch identity is not exposed in HTTP; retain the verified `node-staging` connection only. |
| Direct database URL | `NOT REQUIRED` | Documented for controlled operations only; the API does not use it as normal request traffic. | None. |
| JWT access/refresh/logout | `ENABLED` | Server issues, refreshes, revokes, and tests authenticated route enforcement. | Real Google identity is needed for browser/mobile E2E. |
| CORS | `ENABLED` | Staging public/admin origins pass preflight; unrelated origin receives 403. | Add a mobile browser origin only if a web client is introduced. |
| Health and OpenAPI | `ENABLED` | `/api/health`, `/api/swagger`, and `/api/swagger-ui.html` are present; health is no-store. | None. |
| Public CDN cache | `ENABLED` | Catalogue, homepage, gallery, and public notifications have CDN policy/tags; private and write paths are no-store. | Tag purge remains best-effort; TTL is the safe fallback. |
| In-memory cache | `PARTIALLY CONFIGURED` | Per-instance optimization only; correctness is database-backed. | No distributed cache is required for this staging pass. |
| Semantic search flag | `NOT REQUIRED` | Compatibility flag exists but no Node semantic-search implementation consumes it. | Approved feature scope, if needed later. |

## Authentication and browser clients

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| API Google token validation | `DISABLED` | Health reports Google disabled; issuer and audience allowlist code is implemented. | Web OAuth client configured in Google Cloud and matching Vercel variables. |
| Public web Google button | `DISABLED` | Public client hides/disables it unless both public enable flag and client ID are configured. | Same Web OAuth action. |
| Public password registration/login | `DISABLED` | Explicit API policy flags gate both routes. | Product decision; Google is the intended customer path. |
| Admin password login, refresh, logout | `PARTIALLY CONFIGURED` | Admin client uses one API base and has refresh/logout handling. | Approved non-production admin credential for live browser acceptance. |
| Public API base and anonymous browsing | `ENABLED` | Vite client requires `VITE_API_BASE_URL`; deployed public client targets staging API only. | None. |
| Admin API base | `ENABLED` | Vite client requires `VITE_API_BASE_URL`; deployed admin shell targets staging API only. | None. |
| Customer dashboards, payments, invoices, notifications | `PARTIALLY CONFIGURED` | API/client routes are implemented and authorization guarded. | Google Web/native login or a safe staging fixture session. |

## Email and payments

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| SMTP transport | `DISABLED` | Health reports SMTP disabled. | Staging SMTP credentials and an approved safe recipient. |
| Staging recipient safety gate | `ENABLED` | `MAIL_DELIVERY_MODE=safe` permits only exact `SMTP_SAFE_RECIPIENTS`; disabled mode sends nothing. | Populate allowlist before enabling transport. |
| Contact/enquiry/welcome mail | `DISABLED` | Business writes may proceed, but transport returns disabled without delivery. | Safe SMTP setup and one approved recipient. |
| Quotation mail/PDF attachment | `PARTIALLY CONFIGURED` | Direct private Blob quotation path and mail attachment path are implemented. | Both durable-storage runtime proof and safe SMTP recipient. |
| Razorpay gateway | `DISABLED` | Health reports Razorpay disabled; staging startup rejects any enabled mode other than `test`. | Confirm Test-only keys and enable Test mode deliberately. |
| Razorpay link/status/cancel | `PARTIALLY CONFIGURED` | Server-created link workflow, reconciliation, and cancellation are implemented; no client creates amounts or links. | Safe staging admin fixture and Test gateway enablement. |
| Razorpay webhook/HMAC/idempotency | `PARTIALLY CONFIGURED` | Raw-body HMAC and duplicate-safe reconciliation have passing tests. | Test Dashboard webhook secret and webhook registration. |
| Razorpay Live | `NOT REQUIRED` | Explicitly prohibited for staging. | Never enable in this environment. |

## Storage and file flows

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| Existing Cloudinary URLs/assets | `ENABLED` | Existing URLs remain untouched; no migration is performed. | None. |
| New Cloudinary uploads | `DISABLED` | Health reports Cloudinary disabled. | A staging-scoped account/credentials and approved staging folder prefix. |
| Private Vercel Blob store | `ENABLED` | Isolated private staging store is connected only to the API project's application-staging target. A disposable direct upload/presign/PUT/finalize/cleanup lifecycle returned `200/200/200/502/404`: the disabled-mail failure created no database record and the retry proved deletion. An unsigned private URL was rejected with `403`. | Customer-owner acceptance still needs an authenticated fixture. |
| Blob OIDC | `ENABLED` | Deployed Function successfully issued scoped upload/read/delete authorization. Local Development OIDC is correctly denied for the Production-scoped application-staging store. | None for server runtime. |
| Client direct upload authorization | `ENABLED` | Opaque signed intent constrains pathname, owner, type, and size; a scoped PUT URL bypasses Functions and needs no Blob callback/webhook key. | Native authenticated acceptance. |
| Private signed download/delete | `PARTIALLY CONFIGURED` | Server generated a short-lived private download authorization during the disposable finalization and cleaned the object after disabled-mail failure; Blob 404 responses now normalize to the API 404 contract. An unsigned private URL is rejected with `403`. | Consume a signed URL through an authenticated staging customer/admin fixture. |
| Disposable Blob test cleanup residual | `FAILED` | One 5-byte, non-personal staging test object may remain after a local test-helper error interrupted finalization. It has no database row and no email delivery. | Account owner must delete the single current object under the staging private career-resume prefix from the Blob dashboard; no broad deletion or legacy migration is authorized. |
| Mobile travel photos (25 MB) | `PARTIALLY CONFIGURED` | Direct private Blob flow supports JPEG/PNG/WebP and avoids Vercel Function binary limits. | Native Google sign-in or safe user fixture. |
| Career resumes | `PARTIALLY CONFIGURED` | Private direct upload/finalize, admin-only read, and cleanup are implemented. | Safe staging applicant fixture and safe HR recipient if email delivery is enabled. |
| Quotations/notification PDFs | `PARTIALLY CONFIGURED` | Private direct Blob transport is implemented; quotations clean up temporary objects. | Admin fixture plus safe SMTP. |
| Legacy `/api/uploads/*` compatibility | `PARTIALLY CONFIGURED` | Deterministic private Blob resolution and authorization are implemented. | Explicit one-time migration only; legacy archive and database are intentionally untouched. |
| Public direct Blob media store | `NOT REQUIRED` | Public media continues through existing Cloudinary behavior. | Create a separate public store only when a direct-public-media change is approved. |

## Public and admin product features

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| Public home, hero, featured rows, statistics, packages, categories, gallery | `ENABLED` | Staging API success envelopes and CDN policy verified; public Vite deployment loads. | Browser/device acceptance remains a user-facing test. |
| Package detail/search/chatbot | `PARTIALLY CONFIGURED` | API/client implementations exist and invalid-input envelopes were verified. | Avoid creating unnecessary chatbot question records; use a safe test prompt if desired. |
| Enquiry/contact | `PARTIALLY CONFIGURED` | Native/public forms and API validation exist; empty input returns 400. | Valid submission creates staging data; use an approved safe test fixture. |
| Admin catalogue/content mutations | `PARTIALLY CONFIGURED` | Authenticated API and admin screens exist; public cache invalidation is wired after successful mutations. | Approved staging admin login. |
| Admin tours/payments/invoices/quotations | `PARTIALLY CONFIGURED` | Screens and protected endpoints are implemented. | Staging admin fixture; SMTP/Razorpay constraints above. |

## Mobile / EAS

| Feature | Status | Evidence / current behavior | Remaining blocker |
| --- | --- | --- | --- |
| Central staging API base | `ENABLED` | Preview EAS environment contains only the staging API base; Axios/services use central config. | None. |
| Expo/EAS project and preview APK | `ENABLED` | Project is linked; latest Android internal preview build `13b367f1-e78b-4740-bda3-39fb0351dd38` finished successfully from the scoped-Blob mobile source commit. Its Preview API configuration was verified to match the staging API and not mention production. | Physical-device install/acceptance. |
| SecureStore, bootstrap, refresh, logout | `ENABLED` | Central auth provider and automatic single-refresh path are implemented. | Real Google identity for session E2E. |
| Native Android/iOS Google login | `DISABLED` | App fails gracefully when native IDs are absent; anonymous flows remain available. | Platform OAuth clients. |
| Anonymous discovery, search, gallery, enquiry, chatbot | `PARTIALLY CONFIGURED` | Typecheck/lint/config/export and staging API smoke passed. | Physical Android test and any valid-write test fixture. |
| Bucket, recently viewed, profile, tours, payments, invoices, notifications, photos | `PARTIALLY CONFIGURED` | Client and guarded server paths are implemented. | Native Google sign-in or approved staging fixture. |
| Android signing | `ENABLED` | EAS-managed preview signing created an internal APK; no signing material is stored in the project. | Install on a physical Android device. |
| iOS signing/TestFlight | `BLOCKED BY ACCOUNT ACTION` | Bundle identifier/config is prepared. | Apple Developer credentials and TestFlight setup. |

## Environment and secret posture

- API Vercel `Production` and `Preview` variables are deliberately distinct
  targets from application labels. The stable application-staging deployment
  uses `DEPLOYMENT_ENVIRONMENT=staging` and `DATABASE_ENVIRONMENT=staging`.
- The public project has only `VITE_API_BASE_URL`, Google public configuration,
  and browser-cache configuration. The admin project has only
  `VITE_API_BASE_URL`.
- The mobile preview environment contains public Expo configuration only. It
  never receives database, JWT, SMTP, Cloudinary, Blob, or Razorpay secrets.
- Local `.env.local`, `.vercel/`, build output, logs, upload archives, and
  dependency folders are ignored. No legacy archive is in Git.

## Latest safe verification

| Check | Result |
| --- | --- |
| API health | `200`; database `UP`; explicit runtime labels remain `staging` / `staging`; Google, SMTP, Cloudinary, and Razorpay remain disabled; durable storage is enabled. |
| CORS | Public and admin Vercel origins each receive their own allowed origin with `Vary: Origin`; an unrelated origin receives `403`. |
| Public API/cache | Packages, categories, hero, featured rows, statistics, gallery, and public notifications return successful envelopes. The packages request was served as a Vercel CDN `HIT` (with `Age`); browser JSON remains conservative (`must-revalidate`, `max-age=0`). |
| Private API/cache | Anonymous `/users/me` returns `401`; private and write paths remain `private, no-store`. |
| API static checks | `npm run typecheck`, `npm run build`, and `npm test` pass (eight tests). |
| Public client static checks | Production build passes. Existing lint debt remains: 10 errors and 5 warnings, unrelated to this pass. |
| Admin client static checks | Production build passes. Existing lint debt remains: 15 errors and 6 warnings, unrelated to this pass. |
| Mobile static checks | Typecheck, lint, Expo public config, and Android JS export pass. Expo Doctor returned no usable host output in this environment, so it remains inconclusive rather than a project failure. |

## Deliberately deferred actions

1. Do not migrate historical uploads or change production database values.
2. Do not enable SMTP until a safe allowlist recipient is supplied.
3. Do not enable Razorpay until Test credentials and the staging webhook are
   confirmed; never configure Live mode here.
4. Do not enable Web or native Google login without the corresponding OAuth
   client configured in Google Cloud and Vercel/EAS.
