# Final migration verification report

## Builds

| Target | Result |
|---|---|
| Node API | PASS — TypeScript typecheck and production build |
| Public frontend | PASS — Vite production build |
| Admin frontend | PASS — Vite production build |

The public/admin bundles retain large-chunk warnings and legacy lint findings, neither of which blocks the new build.

## API parity

- Spring effective route count: **134** (133 mapping annotations plus the two-path gallery delete mapping).
- Fully migrated: **131**.
- Partial: **3**, all explicitly documented: enhanced `/health` envelope and legacy local upload writer/static-serving differences.
- Missing: **0**.
- Intentionally deferred endpoint: **0**.

See [API_PARITY_REPORT.md](API_PARITY_REPORT.md) for every route's method, mapping, role, request/response contract, data behavior, and integration note.

## Database

- Connection verified: **yes**, through a read-only Node `pg` connection using already-local legacy Neon configuration without exposing credentials.
- API live smoke: **yes**, including health, package list/detail, categories, featured rows, hero content, and homepage statistics.
- Schema metadata: **27 in-scope schema tables** validated against the live `information_schema`, including primary/foreign keys and required column names.
- Schema modifications: **none**. No Node migration was created or executed. The prior controlled, clearly marked enquiry fixture was created and exactly cleaned; no customer, administrator, or persistent production business data was modified. The production database is read-only for all future verification pending a dedicated staging database.

## Authentication and authorization

- Google customer login: implementation reviewed; Google library verification, explicit issuer validation, configured audience, USER role, JWT issuance, and refresh persistence are present. Live token acceptance requires a safe test token/client and was not performed.
- Admin login: implementation reviewed; BCrypt comparison and ADMIN/SUPER_ADMIN role filtering are present. No real administrator password was used.
- JWT: copied frontend claim expectations (`sub`, `uid`, `userId`, `role`) are preserved.
- Roles: live middleware tests confirmed no accidental ADMIN inheritance of SUPER_ADMIN mutation/account permissions. See [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

## Integrations

| Integration | Status |
|---|---|
| Cloudinary | Implemented; live upload deferred to approved test credentials |
| SMTP | Templates/control flow verified with SMTP disabled; live delivery deferred to safe test recipient/configuration |
| Razorpay | Server-side amounts, INR validation, webhook HMAC/timing-safe verification, and payment state guards reviewed; disabled configuration fails before persistence and provider/link failures remove the just-created request; no link or charge created |
| Quotations | Copied admin UI still produces the package/customer PDF; Node receives the same multipart fields and sends it as an attachment without persistence |
| Cache | In-memory hit/invalidation/version test and live public-cache manifest/content reads passed; the manifest now has a shared deployment epoch to prevent a restarted API from permanently trusting an older IndexedDB snapshot |

## Frontends

- Public frontend rendered against the Node API and existing database with no observed CORS, JSON-shape, or console error.
- Admin login page rendered with no console error. Authenticated admin workflow testing remains deferred until a safe approved credential is provided.
- No scattered API host, Spring URL, local production port, credential, JDBC, SMTP, Razorpay-secret, or Cloudinary-secret reference was found in either Node frontend source; only development `.env.example` localhost values remain.
- Every legacy frontend API URL maps to a Node endpoint. See [FRONTEND_API_COMPATIBILITY.md](FRONTEND_API_COMPATIBILITY.md).
- Artifact check: each target contains only `.env.example` at its root and no `dist` output. Locally generated `node_modules` remains for development verification, is listed in each target's `.gitignore`, and was not copied from a legacy project.

## Security

- Production-only dependency audits are clean after updating Nodemailer and the compatible fflate patch.
- Two ESLint-only transitive development findings remain in each frontend; they are documented in [SECURITY_NOTES.md](SECURITY_NOTES.md) and do not ship in the Docker runtime.

## Production readiness constraints

This is **not yet a production-cutover approval**. Complete the following in approved staging/test infrastructure before routing live traffic:

1. Exercise Google sign-in, admin login, refresh rotation, and logout with safe accounts. The existing public-registration and password-login policies are disabled, so provision any staging test user through an authorized normal staging identity flow rather than an application or database bypass.
2. Use test SMTP recipient(s), Cloudinary credentials, and Razorpay test keys/webhook; verify delivery and reconciliation without real charges.
3. Run transactional package/tour/payment write tests inside a rollback-safe test dataset or staging database.
4. Mount the legacy upload archive if existing records still reference `/api/uploads/*`.
5. Address or accept the copied frontend lint debt and large bundle warnings as separate frontend-quality work.

## Staging-isolation gate

The supplied `node-staging` Neon branch is now verified isolated from
production: it has a distinct branch and endpoint identity in the same project,
with a matching 30-table public schema, Flyway-history fingerprint, and
representative aggregate counts. A single clearly marked staging API enquiry
was confirmed absent from production and exactly cleaned after the proof.

Production remains read-only for all future verification. Node must not
generate migrations against either database. A deployed staging secret store,
host, proxy, frontend build, and safe test identities/integration recipients
are still required before the remaining acceptance testing.

Legacy Spring/public/admin projects were not modified.

## Full staging integration pass — 2026-09-26

Executed only against the proven-isolated `node-staging` branch:

- Staging-only SUPER_ADMIN and ADMIN fixtures passed normal BCrypt login,
  `/users/me`, refresh, logout, and revoked-refresh behavior. ADMIN is blocked
  from administrator and payment writes but can create/update staging tours.
- A clearly marked direct USER fixture passed authenticated business APIs. This
  verifies ownership flows only; it is explicitly **not** a Google-login pass.
- Enquiry validation/create/admin-read/exact-delete, bucket-list toggle,
  recently-viewed create/read/remove, profile completion, notification target
  create/read/delete, and chatbot interaction cleanup passed.
- ADMIN tour creation/update and SUPER_ADMIN cash payment, invoice, and
  customer/admin reads passed after correcting a tour INSERT placeholder defect
  and mail-template runtime conversion defect.
- Dedicated-folder Cloudinary upload/read/delete passed through the Node API.
  No existing Cloudinary asset was touched.
- Razorpay **Test Mode** link creation, resend, refresh, cancellation and
  local temporary-secret HMAC checks passed. Provider callbacks were not
  verified because no staging public webhook was registered.
- Valid quotation multipart/PDF input reached the mail path and safely returned
  the expected disabled-delivery failure; no email was sent.

The pass also corrected a PostgreSQL parameter-type conflict in Razorpay
email-status updates. API typecheck and build passed after every correction.

This is still not production-cutover approval. Real Google sign-in, safe SMTP
delivery, Razorpay Dashboard callback, deployed proxy/browser/device, Docker,
and staging deployment-secret-store acceptance remain outstanding. See
`CUTOVER_ACCEPTANCE.md` and `STAGING_TEST_DATA.md`.

## Staging validation addendum

- The corrected public enquiry INSERT passed an integration-disabled staging-like validation: invalid request `400`, one clearly marked test record `201`, exact cleanup `1` record.
- The dedicated staging foundation pass rebuilt Node, ran it only against the isolated branch, passed health/catalog/content smoke checks, added a 400 guard for oversized enquiry references, and performed an exact-marker staging write/production-absence/cleanup proof. SMTP, Cloudinary, and payment actions stayed disabled.
- Five current legacy-upload references are retained; every referenced archive file exists and Node served a non-content `HEAD` check successfully.
- Existing legacy configuration was mapped only in temporary process memory: SMTP system/payment/quotation connections, Cloudinary non-mutating connectivity, and Razorpay Test Mode read-only connectivity were verified. No email, asset, payment link, charge, or webhook transition was created; the local Razorpay webhook secret is absent.
- Node now maps the distinct legacy payment mail transport for payment-link/receipt emails while retaining the legacy system-mail fallback for quotation delivery.
- See `STAGING_CHECKLIST.md`, `LEGACY_UPLOAD_MIGRATION.md`, `PRODUCTION_CUTOVER_PLAN.md`, and `CUTOVER_ACCEPTANCE.md`. No staging cutover approval is implied: Docker, reverse proxy, safe account, and external test-integration checks remain outstanding.
