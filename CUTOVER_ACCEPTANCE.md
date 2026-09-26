# Cutover acceptance

Status meanings: **PASS** was executed successfully in the local staging-like validation noted below; **FAIL** was executed and failed; **CONFIGURATION VERIFIED** means the existing setting or non-mutating connection was proven without an end-to-end action; **SAFE FAILURE-PATH VERIFIED** means a safe rejection was executed; **LIVE ACTION NOT EXECUTED** and **NOT EXECUTED** require an approved staging host, safe credential, test account, or unavailable local runtime.

| Check | Status | Evidence / remaining gate |
|---|---|---|
| API health | PASS | Rebuilt Node API running only against `node-staging` returned HTTP 200 with database status present. |
| Database | PASS | `node-staging` has distinct Neon branch/endpoint identities from production, the same project, matching 30-table public schema/Flyway fingerprint/representative aggregates, and a cleaned exact-marker write proof. No schema change. |
| Public site | NOT EXECUTED | Production bundle shell and SPA fallback rendered locally. The in-app browser blocks loopback API calls with `ERR_BLOCKED_BY_CLIENT`, so an actual staging-browser data-flow run remains required. |
| Admin site | NOT EXECUTED | Production bundle and login shell rendered locally; no approved admin login was available. |
| Google auth | CONFIGURATION VERIFIED / LIVE ACTION NOT EXECUTED | Existing client configuration maps to Node and matches the legacy public client configuration; no safe Google ID token/account is available. |
| Admin auth | NOT EXECUTED | No approved administrator credential supplied. |
| Refresh/logout | NOT EXECUTED | Requires approved customer/admin session. |
| SMTP | CONFIGURATION VERIFIED / LIVE ACTION NOT EXECUTED | System, payment, and quotation SMTP transports passed Nodemailer non-delivery verification. Recipients are configured but none is proven safe, so no message was sent. |
| Cloudinary | CONFIGURATION VERIFIED / LIVE ACTION NOT EXECUTED | Authenticated non-mutating `api.ping` passed. Account is not proven staging-only; no asset was created. |
| Razorpay test mode | CONFIGURATION VERIFIED / LIVE ACTION NOT EXECUTED | Existing Test Mode values were injected only into the temporary staging process. No safe test booking/admin account exists, so no payment link or charge was created. |
| Webhook | SAFE FAILURE-PATH VERIFIED | No local webhook secret is configured; isolated Node process rejected webhook request with 503 before database configuration or mutation. Valid callback/transition remains pending. |
| Quotation | NOT EXECUTED | Requires approved admin session and safe test recipient. |
| Enquiry validation/write | PASS | Oversized `inquiryId` now returns 400 before database access. One `STG-NEON-ISOLATION-VERIFY-*` enquiry returned 201 against staging only; its exact marker was absent from production and exact cleanup deleted one staging row with SMTP disabled. |
| Bucket list | NOT EXECUTED | No safe customer test account/session is available. The normal public registration and password-login policies are both disabled, so the requested staging customer was not created by a bypass path. |
| Tours | NOT EXECUTED | No safe admin account and dedicated test record supplied. |
| Payments | NOT EXECUTED | No safe test booking/admin account supplied. |
| Admin permission rejection | PASS | Unauthenticated `/users/me`, `/tours`, `/admin-accounts`, and `POST /files` all returned 401; earlier role-matrix middleware probes remain documented separately. |
| Legacy uploads | PASS | Five live references found, all five archive files exist, and Node static `HEAD` for a notification PDF returned 200. |
| Browser cache invalidation | PASS | Local staging API uses explicit deployment epoch `node-staging-20260926-01`; code prevents a missing deployment epoch from reusing a previous process epoch. Actual staging-browser confirmation remains required. |
| Docker API | NOT EXECUTED | Docker CLI/daemon is not installed on this host. |
| Docker public | NOT EXECUTED | Docker CLI/daemon is not installed on this host. |
| Docker admin | NOT EXECUTED | Docker CLI/daemon is not installed on this host. |
| Reverse proxy / forwarded headers | NOT EXECUTED | `trust proxy` is configured, but no staging proxy was available. |
| Security audit | PASS | Previous production-only audits are clean; documented ESLint development-only findings remain. |
| Rollback readiness | NOT EXECUTED | Runbook exists, but a DNS/proxy rollback drill has not been performed. |

## Critical blockers

1. No deployed staging host, staging DNS/reverse proxy, or Docker runtime is available. The verified local API process was stopped after testing.
2. No approved safe Google/customer/admin credentials are available for live authentication/refresh/logout tests.
3. SMTP, Cloudinary, Razorpay test-mode/webhook, quotation, tour, payment, bucket-list, and full browser acceptance are not yet executed with safe test data.
4. A persistent staging JWT secret and staging database credentials must be installed in the deployment secret store; the local temporary process credentials were intentionally discarded.

**Cutover decision: NO.** The prerequisites above must be executed successfully in approved staging before production traffic is routed to Node.

## Full isolated-staging integration update — 2026-09-26

This update supersedes earlier entries marked `NOT EXECUTED` where the same
check appears below. All HTTP and business writes ran only against the proven
isolated `node-staging` branch.

| Check | Status | Evidence / remaining gate |
|---|---|---|
| Admin login, `/users/me`, refresh, logout | PASS | Staging-only BCrypt SUPER_ADMIN and ADMIN fixtures each completed the normal API login/refresh/logout flow; revoked refresh tokens returned 401. |
| USER authenticated APIs | PASS — staging fixture | Direct staging USER fixture completed `/users/me`, refresh/logout, profile, bucket-list, view history, tours, payments and invoice checks. This is not a Google-login pass. |
| 401 / 403 envelopes | PASS | No bearer returned 401 JSON; ADMIN writes to administrator-account and payment routes returned 403 JSON; ADMIN tour create/update returned success. |
| Google Web configuration | CONFIGURATION VERIFIED | Existing Web audience was accepted by startup allowlist configuration. No developer-owned Google ID token was available; Android/iOS audiences remain unconfigured. |
| SMTP | CONFIGURATION VERIFIED / LIVE ACTION NOT EXECUTED | Legacy system/payment/quotation transports are mapped, but no recipient was proven safe. Delivery remains disabled. Quotation multipart/PDF validation exercised the expected 502 disabled-mail failure path. |
| Cloudinary staging lifecycle | PASS | Dedicated-folder staging image uploaded through `/upload-photo`, was read through `/get-photos`, then deleted through `/delete-photo`; provider read succeeded before deletion and the post-delete provider lookup reported the expected missing resource. |
| Enquiry / notification / chatbot | PASS | Validation plus exact staging create/read/delete checks passed; all transient rows were cleaned by exact reference/session. |
| Tours / manual payment / invoice | PASS | ADMIN created and fully updated a STG tour; SUPER_ADMIN created exact cash payment; USER/admin visibility and invoice JSON passed. |
| Razorpay Test Mode | PASS | Staging test link, resend, provider refresh, cancellation, server-derived amount/currency checks all passed. Test requests use disabled notify flags and are retained CANCELLED only for reconciliation. |
| Webhook | LOCAL HMAC VERIFIED | Missing and invalid HMAC returned 400; a valid temporary staging-secret HMAC returned 200. A public staging callback endpoint has not been registered with the Razorpay Test Dashboard. |
| Quotation | SAFE FAILURE-PATH VERIFIED | Valid multipart PDF input reached the quotation mail path and returned the expected disabled-delivery 502. Safe recipient/delivery remains pending. |
| Public/admin/mobile browser acceptance | NOT EXECUTED | No deployed staging public/admin host or device runtime was available. API-level contract tests passed. |

### Current cutover blockers

1. Deploy the verified image/configuration to actual staging with a persistent
   staging secret store, staging DNS/proxy, and read-only legacy-upload mount.
2. Use a developer-owned Google identity to complete Web Google login; create
   Android/iOS OAuth audiences before native mobile sign-in testing.
3. Supply a clearly approved safe SMTP recipient to run delivery/PDF attachment
   checks. Do not redirect tests to customer or operational addresses.
4. Register the staging endpoint and temporary secret in Razorpay Test Mode to
   complete a provider-initiated callback test.
5. Complete public/admin browser and mobile device acceptance through the real
   staging proxy. Docker is still unverified on this host.

**Cutover decision remains: NO.**
