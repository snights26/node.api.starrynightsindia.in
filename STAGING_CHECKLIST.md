# Staging configuration checklist

This checklist names configuration only; it contains no secret values. Keep runtime values in the staging secret store or deployment environment, never in source control. Frontend `VITE_*` values are build-time values and therefore require a new image/bundle when changed.

## API environment

| Variable | Required | Application | Purpose | Current verification |
|---|---|---|---|---|
| `NODE_ENV` | Required | API | Enables production error/rate behavior; does not distinguish Preview from Production. | Local staging-like runtime verified. |
| `DEPLOYMENT_ENVIRONMENT` | Required for Vercel | API | Explicitly `staging` in Preview. | New startup gate. |
| `DATABASE_ENVIRONMENT` | Required for Vercel | API | Must equal `staging`; prevents database fallback. | New startup gate. |
| `PORT` | Optional (default 8080) | API | Listener port behind the reverse proxy. | Local port override verified. |
| `DATABASE_URL` | Required | API | Runtime PostgreSQL/Neon pool connection. | Dedicated `node-staging` branch verified; used by the temporary Node staging process only. Production remains read-only. |
| `DATABASE_DIRECT_URL` | Optional | API | Direct connection reserved for controlled operational use. | Dedicated staging direct endpoint verified for exact fixture lookup/cleanup; Node runtime does not consume it. |
| `JWT_SECRET` | Required | API | Signs access and refresh JWTs. | Staging-only CSPRNG secret created in temporary process memory without disclosure. A persistent staging secret-store value is still required. |
| `JWT_ACCESS_TOKEN_MINUTES` | Optional | API | Customer access-token lifetime. | Default/source reviewed. |
| `JWT_ADMIN_ACCESS_TOKEN_MINUTES` | Optional | API | Administrator access-token lifetime. | Default/source reviewed. |
| `JWT_REFRESH_TOKEN_DAYS` | Optional | API | Refresh-session lifetime. | Default/source reviewed. |
| `PUBLIC_PASSWORD_LOGIN_ENABLED` | Required policy choice | API | Enables legacy customer password login. | Explicitly disabled in local validation. |
| `PUBLIC_REGISTRATION_ENABLED` | Required policy choice | API | Enables legacy customer registration. | Explicitly disabled in local validation; no staging user may be created through the normal public route until an authorized staging policy enables it. |
| `GOOGLE_AUTH_ENABLED` | Conditional | API | Enables customer Google-ID-token login. | CONFIGURATION VERIFIED; enabled only for the temporary staging process, with no safe test token/account available. |
| `GOOGLE_ALLOWED_CLIENT_IDS` | Required when Google enabled | API | Explicit browser/Android/iOS audience allowlist. | Existing verified Web audience injected for temporary staging process only; Android/iOS client IDs remain intentionally absent. |
| `GOOGLE_CLIENT_ID` | Optional migration fallback | API | Legacy single audience fallback. | Not used by the staging process; the explicit allowlist is used instead. |
| `CORS_ALLOWED_ORIGINS` | Required | API | Exact public/admin staging origins, comma-separated. | Loopback public/admin origins preflighted successfully; deployed staging origins not supplied. |
| `PUBLIC_APP_URL` | Required when Google/mail links enabled | API | Public redirect/link base URL. | Loopback value verified only. |
| `ADMIN_APP_URL` | Required when Google/mail links enabled | API | Admin redirect/link base URL. | Loopback value verified only. |
| `CLOUDINARY_ENABLED` | Conditional | API | Enables new Cloudinary uploads. | Disabled for initial staging; authenticated non-mutating Cloudinary ping was previously verified. |
| `CLOUDINARY_CLOUD_NAME` | Required when Cloudinary enabled | API | Cloudinary account selection. | CONFIGURATION VERIFIED without disclosure. |
| `CLOUDINARY_API_KEY` | Required when Cloudinary enabled | API | Cloudinary API credential. | CONFIGURATION VERIFIED without disclosure. |
| `CLOUDINARY_API_SECRET` | Required when Cloudinary enabled | API | Cloudinary API credential. | CONFIGURATION VERIFIED without disclosure. |
| `CLOUDINARY_FOLDER_PREFIX` | Required when a shared account is enabled | API | Isolates newly created staging assets. | `starry-nights-staging-verification` configured, but uploads remain disabled pending shared-account approval. |
| `SMTP_ENABLED` | Conditional | API | Enables outbound email. | Disabled for initial staging; no email was sent. |
| `SMTP_HOST` | Required when SMTP enabled | API | Legacy system-mail transport host. | CONFIGURATION VERIFIED through non-delivery SMTP verification. |
| `SMTP_PORT` | Required when SMTP enabled | API | Legacy system-mail transport port. | CONFIGURATION VERIFIED through non-delivery SMTP verification. |
| `SMTP_USERNAME` | Required when SMTP enabled | API | SMTP credential. | CONFIGURATION VERIFIED without disclosure. |
| `SMTP_PASSWORD` | Required when SMTP enabled | API | SMTP credential. | CONFIGURATION VERIFIED without disclosure. |
| `SMTP_FROM` | Required when SMTP enabled | API | Approved sender identity. | CONFIGURATION VERIFIED without disclosure. |
| `SMTP_TO` | Conditional | API | Default operational recipient. | No safe staging recipient supplied. |
| `SMTP_SUPPORT_TO` | Conditional | API | Support recipient. | No safe staging recipient supplied. |
| `SMTP_HR_TO` | Conditional | API | Career recipient. | No safe staging recipient supplied. |
| `SMTP_SALES_TO` | Conditional | API | Sales recipient. | No safe staging recipient supplied. |
| `SMTP_SECURE` | Required when SMTP enabled | API | TLS mode. | CONFIGURATION VERIFIED through non-delivery SMTP verification. |
| `SMTP_STARTTLS` | Required when SMTP enabled | API | STARTTLS requirement for the system transport. | CONFIGURATION VERIFIED through non-delivery SMTP verification. |
| `SMTP_PAYMENT_*` | Conditional | API | Legacy payment-mail transport used for payment links/receipts. | CONFIGURATION VERIFIED; Node mapping and non-delivery SMTP verification pass. |
| `SMTP_QUOTATION_*` | Optional / future mapping | API | Legacy quotation transport configuration. | CONFIGURATION VERIFIED; current legacy and Node quotation flow intentionally use the verified system-mail fallback. |
| `RAZORPAY_ENABLED` | Conditional | API | Enables payment-link provider. | Existing Test Mode values injected only into the temporary staging process; no link or charge was created. |
| `RAZORPAY_MODE` | Required when enabled | API | Must be `test` in staging. | New startup gate. |
| `RAZORPAY_KEY_ID` | Required when Razorpay enabled | API | Razorpay test/live key identifier. | CONFIGURATION VERIFIED as a Test Mode key pattern, without disclosure. |
| `RAZORPAY_KEY_SECRET` | Required when Razorpay enabled | API | Razorpay API credential. | CONFIGURATION VERIFIED through the read-only provider request. |
| `RAZORPAY_WEBHOOK_SECRET` | Required when Razorpay enabled | API | Webhook HMAC secret. | CONFIGURATION FOUND but value is absent locally; safe missing-secret rejection returned 503. |
| `RAZORPAY_PAYMENT_LINK_EXPIRY_HOURS` | Optional | API | Payment-link expiry. | Default/source reviewed. |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | Optional | API | Direct Blob photo/public-media maximum. | Default/source reviewed. |
| `FUNCTION_UPLOAD_MAX_SIZE_BYTES` | Optional, max 4 MB | API | Legacy multipart compatibility cap below Vercel limit. | New Vercel guard. |
| `PRIVATE_ATTACHMENT_MAX_SIZE_BYTES` | Optional | API | Direct Blob career/quotation document maximum. | Default/source reviewed. |
| `VERCEL_BLOB_ENABLED` | Required for file flows | API | Enables durable object storage. | Blob stores still need connection. |
| `STORAGE_NAMESPACE` | Required | API | `staging/...` path isolation. | New startup gate. |
| `VERCEL_BLOB_PRIVATE_STORE_ID` | Required for private files | API | Staging private store ID for OIDC. | External setup pending. |
| `VERCEL_BLOB_PUBLIC_STORE_ID` | Required for public direct media | API | Staging public store ID for OIDC. | External setup pending. |
| `MAIL_DELIVERY_MODE` | Required | API | `safe` or `disabled`; never customer mail by default. | New startup gate. |
| `SMTP_SAFE_RECIPIENTS` | Conditional | API | Explicit recipients allowed in safe mode. | External setup pending. |
| `CACHE_ENABLED` | Required policy choice | API | Enables in-memory public cache. | Enabled in local validation. |
| `CACHE_MAX_ENTRIES` | Optional | API | Public cache capacity. | Default/source reviewed. |
| `PUBLIC_BROWSER_CACHE_EPOCH` | Required for staging/production replicas | API | Shared, non-secret release epoch that invalidates IndexedDB on deployment. Change it for every release that changes public data/cache behavior. | Set to `node-staging-20260926-01` for this local staging release; set an approved deployment value before hosting. |
| `SEMANTIC_SEARCH_ENABLED` | Optional | API | Enables semantic-search capability. | Disabled locally; no model asset staged. |

## Public frontend environment

| Variable | Required | Application | Purpose | Current verification |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | Required | Public | Node API base ending in `/api`. | Built with loopback Node API and inspected in the emitted bundle. Staging hostname still required. |
| `VITE_CHATBOT_API_BASE_URL` | Optional | Public | Chatbot base; defaults to `VITE_API_BASE_URL`. | Built with loopback Node API. |
| `VITE_GOOGLE_AUTH_ENABLED` | Conditional | Public | Shows/enables Google login UI. | CONFIGURATION VERIFIED in legacy public configuration; live Google test not executed. |
| `VITE_GOOGLE_CLIENT_ID` | Required when Google enabled | Public | Google browser client identifier. | CONFIGURATION VERIFIED to match the API client ID; no staging bundle was built with it. |
| `VITE_PUBLIC_BROWSER_CACHE_ENABLED` | Optional | Public | Enables IndexedDB public-content cache. | Built enabled; deployment epoch protection added. |

## Admin frontend environment

| Variable | Required | Application | Purpose | Current verification |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | Required | Admin | Node API base ending in `/api`. | Built with loopback Node API and admin login rendered. Staging hostname still required. |

## Configuration gate before a real staging run

1. Create staging-only secret-store entries; do not create `.env` files in these repositories.
2. Use the verified dedicated `node-staging` Neon branch/clone for every staging write. Do not use the current production database for any new write test.
3. Set a single `PUBLIC_BROWSER_CACHE_EPOCH` value shared by every API replica; change it on each deploy or public-data release.
4. Set the exact HTTPS public/admin origins and reverse-proxy API URL, then rebuild both frontend images with those `VITE_*` values.
5. Enable Google, SMTP, Cloudinary, and Razorpay only after safe test accounts/recipients/test keys and test webhook endpoints are approved.

## Vercel Preview additions

1. Set `DEPLOYMENT_ENVIRONMENT=staging`, `DATABASE_ENVIRONMENT=staging`, and
   a `STORAGE_NAMESPACE` beginning with `staging/`. The API now refuses to
   start if these labels do not agree.
2. Supply only the proven **node-staging** Neon pooled URL. Do not set a
   production fallback URL in Preview.
3. Connect staging private/public Blob stores. Use Vercel Function OIDC,
   store IDs, and Vercel's `BLOB_WEBHOOK_PUBLIC_KEY`; keep any read-write
   token only in the local migration shell.
4. Set `RAZORPAY_MODE=test` if Razorpay is enabled, and use
   `MAIL_DELIVERY_MODE=safe` with an explicit allowlist or `disabled`.
5. Migrate the five legacy references with the staging-only dry-run/copy tool
   before validating `/api/uploads/*`; no archive mount is used by Vercel.

## Staging-isolation verification — 2026-09-26

The supplied `node-staging` branch connects successfully. It has a distinct
Neon branch identity and endpoint identity from production while sharing the
same Neon project. Its 30-table public schema, successful Flyway-history
fingerprint, and representative aggregate counts match the production clone.

**Result: STAGING DATABASE ISOLATION: PASS.** Node used only the staging pooled
connection for its temporary process. The legacy 30-migration Flyway schema is
the staging clone source; Node has no ORM migration mechanism and must not
generate migrations. The staging database URL belongs only in an ignored local
file or deployment secret store, never in `.env.example`.

## Verified legacy-to-Node mapping

| Legacy configuration | Node temporary runtime mapping | Status |
|---|---|---|
| Supplied staging pooled/direct credentials | `DATABASE_URL` / `DATABASE_DIRECT_URL` in ignored local staging configuration | STAGING DATABASE ISOLATION: PASS; temporary Node API and exact cleaned fixture used staging only. |
| Newly generated staging value | `JWT_SECRET` injected into temporary Node process | CONFIGURATION VERIFIED without disclosure; persistent staging secret-store value pending. |
| `STARRY_GOOGLE_AUTH_ENABLED` + `STARRY_GOOGLE_CLIENT_ID` | `GOOGLE_AUTH_ENABLED` + `GOOGLE_ALLOWED_CLIENT_IDS` | CONFIGURATION VERIFIED; only the existing Web audience was injected and live token remains unavailable. |
| `STARRY_CORS_ALLOWED_ORIGINS` + `STARRY_APP_BASE_URL` | `CORS_ALLOWED_ORIGINS` + `PUBLIC_APP_URL` | CONFIGURATION FOUND. Replace any legacy host with exact staging Node/public origins before deployment. |
| Legacy public-auth toggles | `PUBLIC_PASSWORD_LOGIN_ENABLED` + `PUBLIC_REGISTRATION_ENABLED` | CONFIGURATION FOUND; retain the approved Google-only policy unless a separate change is authorized. |
| `STARRY_MAIL_SYSTEM_*` | `SMTP_*` | CONFIGURATION VERIFIED through non-delivery SMTP verification. |
| `STARRY_MAIL_PAYMENT_*` | `SMTP_PAYMENT_*` | CONFIGURATION VERIFIED; Node payment-link/receipt paths now select this transport. |
| `STARRY_MAIL_QUOTATION_*` | `SMTP_QUOTATION_*` | CONFIGURATION VERIFIED; kept for compatibility, while quotation delivery follows the legacy system-mail fallback. |
| `STARRY_CLOUDINARY_*` | `CLOUDINARY_*` + `CLOUDINARY_FOLDER_PREFIX` | Shared account / staging-folder isolation required; prefix configured while uploads stay disabled. |
| `STARRY_RAZORPAY_MODE` + `STARRY_RAZORPAY_KEY_*` | `RAZORPAY_ENABLED` + `RAZORPAY_KEY_*` in temporary process | CONFIGURATION VERIFIED as Test Mode; no link or charge created. |
| `STARRY_RAZORPAY_WEBHOOK_SECRET` | `RAZORPAY_WEBHOOK_SECRET` | CONFIGURATION FOUND but absent; Node rejects webhooks safely until it is injected. |
| Legacy public `VITE_*` values | New public `VITE_*` values at staging build time | CONFIGURATION VERIFIED for presence and matching Google client ID. Replace legacy API hosts with the staging Node API host; do not copy legacy host values blindly. |
| Legacy admin `VITE_API_BASE_URL` | New admin `VITE_API_BASE_URL` at staging build time | CONFIGURATION VERIFIED for presence. Replace the legacy API host with the staging Node API host. |

## Full staging-pass status update — 2026-09-26

- `GOOGLE_ALLOWED_CLIENT_IDS`: Web audience configuration accepted by staging
  startup. Live Google identity remains required; Android/iOS IDs are pending.
- `CLOUDINARY_*`: temporary process configuration passed a dedicated-folder
  upload/read/delete lifecycle. No existing asset was modified.
- `SMTP_*`: configuration remains verified with delivery disabled; a safe
  recipient is still required.
- `RAZORPAY_*`: Test Mode link, resend, refresh, cancellation and temporary
  local-HMAC verification passed. The existing webhook secret remains absent;
  provider-initiated callback is pending a public staging endpoint.
- `PUBLIC_BROWSER_CACHE_EPOCH`: the full disposable test runtime used
  `node-staging-20260926-02`; choose a fresh shared value for deployment.
