# Pre-testing readiness — Neon staging foundation

Date: 2026-09-26

## Staging database isolation: PASS

- The supplied `node-staging` connection succeeds and belongs to the same Neon
  project as production, but has a distinct branch identity and endpoint
  identity. No endpoint URL, database identifier, or credential is recorded
  here.
- The public schema table set matches production exactly (30 tables), including
  `flyway_schema_history` and the representative catalog, user, enquiry, tour,
  payment, and content tables.
- Successful Flyway migration history has the same aggregate count and
  fingerprint as production.
- Aggregate counts for representative catalog, content, user, enquiry, tour,
  payment, itinerary, and gallery tables match the cloned production snapshot.
- All comparison transactions were read-only and rolled back.

## Local staging configuration

- `.env.staging.local` was created only after `.env.*.local` was added to the
  API `.gitignore`. It contains the supplied staging pooled/direct database
  configuration and no production database value.
- A CSPRNG-generated, staging-only JWT secret was supplied to each temporary
  Node process in process memory. It was never logged or committed. A persistent
  deployment-secret-store value is still required before hosting staging.
- Customer password login and public registration remain disabled.
- The existing verified Web Google audience was injected only into the
  temporary staging process through `GOOGLE_ALLOWED_CLIENT_IDS`; no Android or
  iOS audience was invented.
- SMTP delivery and Cloudinary uploads are disabled. The Cloudinary staging
  folder prefix is configured for future approved use.
- Existing Razorpay Test Mode settings were process-only for API startup; no
  link, payment, or webhook callback was created. The webhook secret remains
  absent.
- The native legacy upload archive was inspected read-only only; Vercel runtime
  now uses a private Blob compatibility route and has no `LOCAL_UPLOAD_ROOT`.
- `PUBLIC_BROWSER_CACHE_EPOCH` is `node-staging-20260926-01` for this local
  staging release.

## Executed staging checks

| Check | Result |
| --- | --- |
| Node typecheck and production build | PASS |
| Node health backed by staging | PASS (HTTP 200) |
| Packages, categories, featured rows, hero, statistics, package detail | PASS (HTTP 200, JSON content) |
| Oversized enquiry identifier | PASS (HTTP 400, no write) |
| Exactly scoped staging enquiry write | PASS (HTTP 201) |
| Exact marker absent from production | PASS |
| Exact staging fixture cleanup | PASS (one row deleted; no residual) |
| Final exact-marker audit (staging and production) | PASS (both cleaned markers absent) |

## Safety boundary

No customer, administrator, tour, payment, package, bucket-list, Cloudinary,
SMTP, Razorpay, or production-database fixture is active. See
`STAGING_TEST_DATA.md` for every created-and-cleaned enquiry record.

## Superseding full staging-pass note — 2026-09-26

The safety boundary above describes the initial foundation pass only. The
subsequent authorized full pass created the clearly identified staging-only
fixtures recorded in `STAGING_TEST_DATA.md`. It passed normal SUPER_ADMIN and
ADMIN login/refresh/logout, a marked USER-fixture API flow, role boundaries,
profile/bucket/view/enquiry/notification/chatbot checks, tour/manual-payment/
invoice checks, Cloudinary dedicated-folder lifecycle, and Razorpay Test Mode
link/resend/refresh/cancel plus local HMAC verification. It also found and
corrected three Node runtime defects: tour INSERT parameter arity, safe mail
HTML conversion of database-backed display values, and Razorpay email-status
parameter typing. SMTP delivery, provider-initiated Razorpay webhook, real
Google login, deployed proxy/browser/device, and Docker checks remain pending.

## Next staging gates

1. Store a persistent staging JWT secret and staging database credentials in
   the deployment secret store; do not copy `.env.staging.local` to a host.
2. Provide approved staging URL(s), reverse proxy, and frontend builds.
3. Create staging-only user/admin fixtures only when the next acceptance pass
   is authorized.
4. Supply a safe SMTP recipient, Cloudinary account/folder approval, and a
   Razorpay Test Mode webhook secret before integration action tests.

## Vercel readiness update — 2026-09-26

- **Express:** `src/app.ts` default-exports the application for Vercel; local
  `src/server.ts` remains unchanged for normal development.
- **Filesystem:** runtime static archive serving and `LOCAL_UPLOAD_ROOT` are
  removed. The five verified historical references have a staging-only Blob
  migration utility; it is not executed in this pass.
- **Uploads:** travel photos (25 MB), resumes, quotations, and public media
  have a direct Blob authorization/finalization design. Legacy multipart
  compatibility is capped below the Vercel 4.5 MB request ceiling.
- **Isolation:** non-local startup requires explicit deployment/database labels;
  a Vercel Preview must declare staging and cannot silently use production.
- **Still external:** deployed staging API URL, private/public Blob stores,
  Vercel project/OIDC connection plus `BLOB_WEBHOOK_PUBLIC_KEY`, safe SMTP
  recipient, and staging Razorpay webhook URL remain required before hosted
  staging testing.
