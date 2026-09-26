# Staging verification test data

This register contains only records deliberately created for migration and
cutover verification.  No general customer, administrator, package, booking,
or payment records are included.  Cleanup is always scoped by the exact UUID
and identifying value recorded below.

| Entity type | Generated ID | Unique code / email / reference | Creation purpose | Cleanup status |
| --- | --- | --- | --- | --- |
| Enquiry | `54247fd0-02d5-40db-84eb-d9b41653b059` | `STG-CUTOVER-4839395a0be545d492d0abf361dfd0d5` | Prior controlled Node API enquiry-create validation with external delivery disabled | Cleaned: exact-ID deletion verified |
| Enquiry | `e896f901-5d2a-4524-b8d6-b7d72d5dbc88` | `STG-NEON-ISOLATION-PREFLIGHT` | Staging API response preflight after the dedicated Neon branch was proven; SMTP, Cloudinary, and Razorpay actions disabled | Cleaned: exact ID, reference, and fixture name matched; one-row deletion verified |
| Enquiry | `760bda9c-68aa-45ec-ba66-54e31c2aed29` | `STG-NEON-ISOLATION-VERIFY-c677558acbb74637` | Dedicated staging-branch isolation proof through the Node API; exact marker checked as absent from production | Cleaned: exact ID, reference, and fixture name matched; one-row deletion and no residual row verified |

## Full staging integration pass — 2026-09-26

All records below exist only in the isolated `node-staging` branch.  No
password, token, provider identifier, or secret is retained in this register.

| Entity type | Generated ID | Unique code / email / reference | Creation purpose | Cleanup status |
| --- | --- | --- | --- | --- |
| SUPER_ADMIN | `9c5df059-fac4-4dd4-9967-171d84364b86` | `stg-super-admin` | STAGING FIXTURE — normal BCrypt admin-login/authorization acceptance | Retained for staging browser/device acceptance; refresh sessions cleaned after every test |
| ADMIN | `7e20129a-33f6-4f79-acc9-2c62b8ec66da` | `stg-node-admin` | Created through `POST /api/admin-accounts`; normal ADMIN login and role boundary acceptance | Retained for staging browser/device acceptance; refresh sessions cleaned after every test |
| USER | `662b9037-db23-4da5-84a7-026b263a54f4` | `stg+node-verification@starrynights.invalid` / `STG-NODE-VERIFICATION` | STAGING API FIXTURE — NOT GOOGLE AUTH VERIFICATION | Retained for staging browser/device acceptance; bucket/view rows cleaned |
| Tour | `6a169750-dcbf-479f-8788-1de033ae1947` | `STG-CUTOVER-TOUR-E97EFF6E` | Admin create/update, ownership read, manual payment and Razorpay Test Mode target | Retained for Razorpay/browser/device acceptance |
| Cash payment | `c52144ac-749a-49aa-ad07-acf4ffb7a758` | `STG-CASH-E97EFF6E` | Manual payment, user/admin visibility, invoice acceptance | Retained with the staging tour |
| Razorpay payment | `e9aa4afe-075e-49ed-9896-900f8f620783` | Staging Test Mode request | Test-link failure-path diagnostic | Retained, CANCELLED, for gateway reconciliation |
| Razorpay payment | `f85a4068-0938-473d-8b99-615a0edabece` | Staging Test Mode request | Test-link failure-path diagnostic | Retained, CANCELLED, for gateway reconciliation |
| Razorpay payment | `e9a8fde2-a7cf-4392-acf0-cce75d65ef02` | Staging Test Mode request | Test-link failure-path diagnostic | Retained, CANCELLED, for gateway reconciliation |
| Razorpay payment | `77cd7b8f-0f33-4a3b-ab35-eb47a0804a33` | Staging Test Mode request | Link/resend/refresh/cancel/local-HMAC acceptance | Retained, CANCELLED, for gateway reconciliation |
| Enquiry | Exact `STG-ENQUIRY-A8B5C93E` row | `STG-ENQUIRY-A8B5C93E` | Validation, create, admin-read acceptance | Cleaned by exact reference |
| Notification | Exact `STG-NOTIFICATION-A8B5C93E` row | `STG-NOTIFICATION-A8B5C93E` | Targeted notification/user-read acceptance | Cleaned by exact reference |
| Chatbot interaction | Exact session `stg-chatbot-A8B5C93E` | `stg-chatbot-A8B5C93E` | Public chatbot acceptance | Cleaned by exact session |
| Gallery/travel photo | API-generated staging-only row | Dedicated Cloudinary staging folder | Upload/read/delete lifecycle acceptance | Cleaned through API; provider read before and missing-resource result after deletion verified |
| Diagnostic tour | `STG-TOUR-DIAG-ONLY` / `STG-TOUR-STACK-ONLY` | Exact diagnostic references | Runtime-error diagnosis while correcting Node tour creation | Cleaned exactly; no payment link was attached |
| Prior tour | `STG-CUTOVER-TOUR-B99E9D04` | Exact staging reference | Pre-fix tour runtime test | Cleaned exactly with its exact cash payment before final fixture creation |

## Staging isolation — 2026-09-26

The supplied `node-staging` Neon branch is proven isolated from production:
the Neon branch and endpoint identities differ while the project identity,
public table set, successful Flyway-history fingerprint, and representative
aggregate counts match. The staging-only verification marker was absent from
production before cleanup.

The production database remains read-only for all future verification. New
fixture, user, administrator, tour, payment, package, or bucket-list rows may
be created only in the isolated staging branch and must be entered in this
register with their exact IDs before cleanup.
