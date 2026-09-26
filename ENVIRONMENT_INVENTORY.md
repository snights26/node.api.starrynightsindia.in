# Node API Environment Inventory

Source of truth: `src/config/env.ts`, all `env` consumers, and
`.env.example`, inspected on 2026-09-25. Values are intentionally omitted.
`Required` means required for the named enabled feature; no variable is a
license to enable a production integration without staging verification.

Current status terminology: **legacy available** means an ignored legacy
configuration was found and read-only mapped without disclosure; **unset here**
means no Node deployment environment has been supplied; **staging missing**
means a dedicated staging value/account still has to be supplied.

| Variable | Required / default | Class | Development / staging / production | Purpose and legacy mapping | Current configuration / test status |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Optional; `development` | Operational | Vercel sets `production` for Preview and Production | Enables production rate/error behavior; not a deployment selector. | build tested. |
| `DEPLOYMENT_ENVIRONMENT` | Required outside local; `local` | Operational safety | exactly `staging` or `production` | Explicit Vercel environment selector. | New Vercel gate; Preview must be `staging`. |
| `DATABASE_ENVIRONMENT` | Required outside local | Operational safety | must equal deployment environment | Prevents staging from using an unlabeled/production database URL. | New Vercel gate. |
| `PORT` | Optional; `8080` | Operational | listener behind proxy in all environments | HTTP listener. Legacy `PORT`. | unset here; default source reviewed. |
| `DATABASE_URL` | Required for database routes; none | Secret | separate dev/staging/prod pooled URLs | Runtime `pg` pool. Legacy `NEON_POOLED_JDBC_URL` + DB username/password. | `node-staging` pooled connection verified in an ignored local staging file and temporary Node process; production remains read-only. |
| `DATABASE_DIRECT_URL` | Optional; none | Secret | separate direct URL only for approved operations | Declared for operational parity; Node runtime does not consume it. Legacy `NEON_DIRECT_JDBC_URL` + migration credentials. | `node-staging` direct connection verified for exact fixture validation/cleanup; not used by normal Node runtime. |
| `JWT_SECRET` | Required for JWT issue/verify; 32+ chars | Secret | unique dev/staging/prod secrets | HMAC JWT signing. Legacy `STARRY_JWT_SECRET`. | CSPRNG staging-only secret injected into each temporary Node process; persistent staging secret-store value remains required. |
| `JWT_ACCESS_TOKEN_MINUTES` | Optional; `15` | Operational | policy per environment | USER access-token duration. Legacy `STARRY_JWT_ACCESS_TOKEN_MINUTES`. | example/default reviewed. |
| `JWT_ADMIN_ACCESS_TOKEN_MINUTES` | Optional; `60` | Operational | policy per environment | ADMIN/SUPER_ADMIN access-token duration. No legacy one-to-one value. | example/default reviewed. |
| `JWT_REFRESH_TOKEN_DAYS` | Optional; `7` | Operational | policy per environment | Refresh session duration. Legacy `STARRY_JWT_REFRESH_TOKEN_DAYS`. | example/default reviewed. |
| `PUBLIC_PASSWORD_LOGIN_ENABLED` | Optional; `false` | Operational policy | explicitly choose each environment | Enables public password login. Legacy `STARRY_PUBLIC_PASSWORD_AUTH_ENABLED`. | legacy policy found false; retain Google-only unless approved. |
| `PUBLIC_REGISTRATION_ENABLED` | Optional; `false` | Operational policy | explicitly choose each environment | Enables public registration. Legacy `STARRY_PUBLIC_REGISTRATION_ENABLED`. | legacy policy found false; staging test-user workflow required. |
| `GOOGLE_AUTH_ENABLED` | Optional; `false` | Operational policy | enable only with complete clients | Gates Google sign-in. Legacy `STARRY_GOOGLE_AUTH_ENABLED`. | Existing verified Web configuration injected only into the temporary staging process; live sign-in untested. |
| `GOOGLE_ALLOWED_CLIENT_IDS` | Required when Google enabled; empty | Public identifier | Web + Android + iOS client IDs for each environment | Explicit comma-separated accepted audiences. New Node migration variable. | Temporary staging process uses the existing Web audience only; Android/iOS audiences remain absent and deployment injection is pending. |
| `GOOGLE_CLIENT_ID` | Optional migration fallback; empty | Public identifier | legacy web ID only during transition | Adds the legacy single audience to the allowlist. Legacy `STARRY_GOOGLE_CLIENT_ID`. | legacy available; retire after allowlist cutover is stable. |
| `CORS_ALLOWED_ORIGINS` | Required for deployed browser clients; dev default two localhost origins | Operational public | exact dev/staging/prod public and admin origins | CORS allowlist. Legacy `STARRY_CORS_ALLOWED_ORIGINS`. | local defaults reviewed; staging/prod origins missing. |
| `PUBLIC_APP_URL` | Optional; none | Operational public | exact public UI URL | Declared public-app metadata. Legacy `STARRY_APP_BASE_URL`. | legacy available; no current Node consumer beyond config. |
| `ADMIN_APP_URL` | Optional; none | Operational public | exact admin UI URL | Declared admin-app metadata; no direct legacy mapping. | unset here; no current Node consumer beyond config. |
| `CLOUDINARY_ENABLED` | Optional; `false` | Operational policy | enable only with non-production test isolation | Gates Cloudinary uploads. Legacy `STARRY_CLOUDINARY_ENABLED`. | legacy available/non-mutating ping previously verified; staging policy missing. |
| `CLOUDINARY_CLOUD_NAME` | Required when enabled; none | Public identifier | appropriate account per environment | Cloudinary account name. Legacy `STARRY_CLOUDINARY_CLOUD_NAME`. | legacy available; staging account/folder choice missing. |
| `CLOUDINARY_API_KEY` | Required when enabled; none | Secret | separate least-privilege key per environment where possible | Cloudinary API credential. Legacy `STARRY_CLOUDINARY_API_KEY`. | legacy available; no staging credential. |
| `CLOUDINARY_API_SECRET` | Required when enabled; none | Secret | separate least-privilege secret per environment where possible | Cloudinary signing credential. Legacy `STARRY_CLOUDINARY_API_SECRET`. | legacy available; no staging credential. |
| `CLOUDINARY_FOLDER_PREFIX` | Optional; empty | Operational | use `staging`/`production` if an account is shared | Prefixes every newly uploaded asset folder; leaves existing URLs unchanged. New in this pass. | Staging prefix configured in ignored local configuration; uploads remain disabled pending shared-account approval. |
| `SMTP_ENABLED` | Optional; `false` | Operational policy | enable only with safe recipients in staging | Global outbound-mail gate. Legacy `STARRY_MAIL_ENABLED`. | Disabled in initial staging process; delivery deliberately untested. |
| `SMTP_HOST` | Required when SMTP enabled; none | Operational | SMTP endpoint per environment | System-mail host. Legacy `STARRY_MAIL_SYSTEM_HOST`. | legacy available; non-delivery verification previously passed. |
| `SMTP_PORT` | Optional; `587` | Operational | transport port | System-mail port. Legacy `STARRY_MAIL_SYSTEM_PORT`. | example/default reviewed. |
| `SMTP_USERNAME` | Required when SMTP enabled; none | Secret | dedicated mailbox credential | System-mail username. Legacy `STARRY_MAIL_SYSTEM_USERNAME`. | legacy available; no safe staging recipient. |
| `SMTP_PASSWORD` | Required when SMTP enabled; none | Secret | dedicated app password/credential | System-mail password. Legacy `STARRY_MAIL_SYSTEM_PASSWORD`. | legacy available; no delivery test. |
| `SMTP_FROM` | Required when SMTP enabled; none | Operational identity | approved sender identity | System-mail from address. Legacy `STARRY_MAIL_SYSTEM_FROM`. | legacy available; sender approval unverified. |
| `SMTP_TO` | Optional; none | Operational identity | safe staging destination / production operations mailbox | Default mail destination. Legacy `STARRY_MAIL_TO`. | legacy available; safe staging recipient missing. |
| `SMTP_SUPPORT_TO` | Optional; none | Operational identity | safe staging / production support mailbox | Contact/enquiry destination. Legacy `STARRY_MAIL_SUPPORT_TO`. | legacy available; safe staging recipient missing. |
| `SMTP_HR_TO` | Optional; none | Operational identity | safe staging / production HR mailbox | Career destination. Legacy `STARRY_MAIL_HR_TO`. | legacy available; safe staging recipient missing. |
| `SMTP_SALES_TO` | Optional; none | Operational identity | safe staging / production sales mailbox | Sales destination. Legacy `STARRY_MAIL_SALES_TO`. | legacy available; safe staging recipient missing. |
| `SMTP_SECURE` | Optional; `false` | Operational | transport TLS mode | System SMTP implicit TLS. Legacy `STARRY_MAIL_SYSTEM_SSL`. | legacy available/default reviewed. |
| `SMTP_STARTTLS` | Optional; `true` | Operational | transport TLS policy | System SMTP STARTTLS requirement. Legacy `STARRY_MAIL_SYSTEM_STARTTLS`. | legacy available/default reviewed. |
| `SMTP_PAYMENT_HOST` | Required only when payment mail is enabled; none | Operational | payment transport host | Payment-mail host. Legacy `STARRY_MAIL_PAYMENT_HOST`. | legacy available/non-delivery mapped. |
| `SMTP_PAYMENT_PORT` | Optional; `587` | Operational | payment transport port | Payment-mail port. Legacy `STARRY_MAIL_PAYMENT_PORT`. | example/default reviewed. |
| `SMTP_PAYMENT_USERNAME` | Required with payment mail; none | Secret | payment mailbox credential | Payment-mail username. Legacy `STARRY_MAIL_PAYMENT_USERNAME`. | legacy available. |
| `SMTP_PAYMENT_PASSWORD` | Required with payment mail; none | Secret | payment app password | Payment-mail password. Legacy `STARRY_MAIL_PAYMENT_PASSWORD`. | legacy available; no delivery test. |
| `SMTP_PAYMENT_FROM` | Required with payment mail; none | Operational identity | approved payment sender | Payment-mail sender. Legacy `STARRY_MAIL_PAYMENT_FROM`. | legacy available. |
| `SMTP_PAYMENT_SECURE` | Optional; `false` | Operational | TLS mode | Payment implicit TLS. Legacy `STARRY_MAIL_PAYMENT_SSL`. | legacy available/default reviewed. |
| `SMTP_PAYMENT_STARTTLS` | Optional; `true` | Operational | TLS policy | Payment STARTTLS. Legacy `STARRY_MAIL_PAYMENT_STARTTLS`. | legacy available/default reviewed. |
| `SMTP_QUOTATION_HOST` | Optional; none | Operational | quotation transport if approved | Quotation host; current code uses system transport fallback. Legacy `STARRY_MAIL_QUOTATION_HOST`. | legacy available; not active. |
| `SMTP_QUOTATION_PORT` | Optional; `587` | Operational | quotation transport port | Quotation port. Legacy `STARRY_MAIL_QUOTATION_PORT`. | example/default reviewed. |
| `SMTP_QUOTATION_USERNAME` | Optional; none | Secret | quotation credential if later enabled | Quotation username. Legacy `STARRY_MAIL_QUOTATION_USERNAME`. | legacy available; not active. |
| `SMTP_QUOTATION_PASSWORD` | Optional; none | Secret | quotation app password if later enabled | Quotation password. Legacy `STARRY_MAIL_QUOTATION_PASSWORD`. | legacy available; not active. |
| `SMTP_QUOTATION_FROM` | Optional; none | Operational identity | quotation sender if later enabled | Quotation from address. Legacy `STARRY_MAIL_QUOTATION_FROM`. | legacy available; not active. |
| `SMTP_QUOTATION_SECURE` | Optional; `false` | Operational | TLS mode | Quotation implicit TLS. Legacy `STARRY_MAIL_QUOTATION_SSL`. | legacy available/default reviewed. |
| `SMTP_QUOTATION_STARTTLS` | Optional; `true` | Operational | TLS policy | Quotation STARTTLS. Legacy `STARRY_MAIL_QUOTATION_STARTTLS`. | legacy available/default reviewed. |
| `RAZORPAY_ENABLED` | Optional; `false` | Operational policy | staging Test Mode before production Live Mode | Gates Razorpay links. Legacy `STARRY_RAZORPAY_ENABLED`/mode. | Legacy Test Mode values injected only into the temporary staging process; no transaction performed. |
| `RAZORPAY_KEY_ID` | Required when enabled; none | Public identifier | matching Test or Live set only | Razorpay key identifier. Legacy `STARRY_RAZORPAY_KEY_ID`. | Legacy Test Mode value mapped only in temporary staging process; deployment injection pending. |
| `RAZORPAY_KEY_SECRET` | Required when enabled; none | Secret | matching Test or Live set only | Razorpay API secret. Legacy `STARRY_RAZORPAY_KEY_SECRET`. | legacy Test Mode available/read-only verified. |
| `RAZORPAY_WEBHOOK_SECRET` | Required for webhook verification; none | Secret | unique Test / Live webhook secret | HMAC verifies callbacks. Legacy `STARRY_RAZORPAY_WEBHOOK_SECRET`. | absent in legacy local config; must be created/configured. |
| `RAZORPAY_PAYMENT_LINK_EXPIRY_HOURS` | Optional; `48` | Operational | policy per environment | Payment-link expiry, bounded to 1–4320 hours. Legacy `STARRY_RAZORPAY_PAYMENT_LINK_EXPIRY_HOURS`. | example/default reviewed. |
| `RAZORPAY_MODE` | Required when Razorpay enabled outside local | Operational safety | `test` for staging, `live` for production | Explicit provider environment; staging startup rejects Live mode. | New Vercel gate. |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | Optional; `26214400` | Operational | direct-upload product limit | Travel photos/public media maximum. | 25 MB direct Blob path. |
| `FUNCTION_UPLOAD_MAX_SIZE_BYTES` | Optional; max 4 MB | Operational | all environments | Legacy multipart compatibility limit below Vercel’s 4.5 MB ceiling. | New Vercel limit. |
| `PRIVATE_ATTACHMENT_MAX_SIZE_BYTES` | Optional; `10485760` | Operational | direct private document limit | Career/quotation maximum. | Direct Blob path; not a Function body limit. |
| `VERCEL_BLOB_ENABLED` | Required for Blob flows | Operational policy | true in configured staging/production | Enables durable object storage. | New Vercel configuration. |
| `STORAGE_NAMESPACE` | Required outside local | Operational safety | starts `staging/` or `production/` | Separates Blob object paths by environment. | Startup gate. |
| `VERCEL_BLOB_PRIVATE_STORE_ID` | Required for private Blob | Non-secret server config | separate staging/production store | Selects private Blob store for OIDC. | External setup pending. |
| `VERCEL_BLOB_PUBLIC_STORE_ID` | Required for public Blob | Non-secret server config | separate staging/production store | Selects public Blob store for OIDC. | External setup pending. |
| `BLOB_WEBHOOK_PUBLIC_KEY` | Required for presigned direct uploads | Public server config | Vercel-generated per connected store/project | Verifies Vercel Blob upload callbacks and is required by `handleUploadPresigned`. | External setup pending; this is not a secret. |
| `VERCEL_BLOB_*_READ_WRITE_TOKEN` | Local migration only | Secret | never client/never Git | Scoped CLI credential fallback; Vercel Functions prefer OIDC. | Must not be set in mobile/frontend. |
| `MAIL_DELIVERY_MODE` | Required for staging | Operational safety | `safe` or `disabled` in staging | Suppresses mail outside explicit safe recipients. | New Vercel gate. |
| `SMTP_SAFE_RECIPIENTS` | Required for safe mode | Operational identity | dedicated staging recipients | Only addresses permitted when safe delivery is enabled. | External setup pending. |
| `CACHE_ENABLED` | Optional; `true` | Operational policy | normally true | In-process public cache. Legacy `STARRY_CACHE_ENABLED`. | legacy available/default reviewed. |
| `CACHE_MAX_ENTRIES` | Optional; `1000` | Operational | size per replica | In-process cache capacity. Legacy cache-size configuration is not equivalent. | example/default reviewed. |
| `PUBLIC_BROWSER_CACHE_EPOCH` | Required for multi-replica staging/prod; none (random per process fallback) | Operational public | new shared value on every release | Invalidates public-web IndexedDB safely. New Node migration value. | `node-staging-20260926-01` used by local staging process; select deployment release value before hosting. |
| `SEMANTIC_SEARCH_ENABLED` | Optional; `false` | Operational policy | keep false until approved feature deployment | Declared compatibility flag; no Node semantic-search implementation consumes it. Legacy `STARRY_SEMANTIC_SEARCH_ENABLED`. | safe to defer/Post-V1; disabled. |

## Vercel Blob and deployment placement rules

- `VERCEL_BLOB_PRIVATE_STORE_ID`, `VERCEL_BLOB_PUBLIC_STORE_ID`,
  `BLOB_WEBHOOK_PUBLIC_KEY`, `STORAGE_NAMESPACE`, limits, and deployment labels are server configuration,
  not mobile/client environment variables.
- A connected Blob store supplies `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN`, and
  `BLOB_WEBHOOK_PUBLIC_KEY`. This project maps distinct private/public store
  IDs explicitly and relies on Vercel's managed OIDC token at runtime. Blob
  read-write tokens are secret local migration credentials only and must not be
  stored in Vercel Preview/Production unless OIDC is unavailable and a separate
  exception is approved.
- `LOCAL_UPLOAD_ROOT` is retired. `/api/uploads/*` now resolves private Blob
  objects after authorization; no mount, bind volume, or archive directory is
  part of the runtime API.

## Placement rules

- Backend secrets (`DATABASE_*`, `JWT_SECRET`, SMTP passwords, Cloudinary API
  secret, Razorpay key secret/webhook secret) belong only in the API host or
  Portainer secret environment. They are never GitHub variables, frontend build
  arguments, or Expo/EAS public variables.
- Public OAuth client IDs, CORS URLs, cache epoch, limits and feature flags are
  operational/public values. They may be deployment variables, but must not be
  copied to a client unless a client explicitly needs that public value.
- `DATABASE_DIRECT_URL` is documented only; the Node service must not run
  migrations or use it as a normal runtime connection.
- `.env.staging.local` is ignored through `.env.*.local`; it is for this local
  verification only. Deployments must use their secret store and must not copy
  the file or its values.

## Full staging-pass configuration update — 2026-09-26

- Existing legacy Web Google configuration was accepted by a temporary staging
  allowlist process. Native Android/iOS audience IDs remain pending.
- System, payment, and quotation SMTP settings were mapped for temporary
  runtime validation, with `SMTP_ENABLED=false` for all business tests because
  no recipient is proven safe.
- Cloudinary credentials were used only in temporary process memory with
  `CLOUDINARY_FOLDER_PREFIX=starry-nights-staging-verification`; its full
  upload/read/delete lifecycle passed.
- Razorpay credentials were verified as Test Mode and used only in temporary
  process memory. Link/resend/refresh/cancel passed. The legacy webhook secret
  is absent; a temporary process-only HMAC secret verified local signature
  handling only.
- The full pass used the distinct cache epoch
  `node-staging-20260926-02` in its disposable processes. Persist a new,
  release-specific staging epoch through the deployment secret/config store.
