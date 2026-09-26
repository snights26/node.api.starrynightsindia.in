# Authorization matrix

`✓` means the role is allowed by route middleware; `—` means no bearer token is required; `✗` is denied before business persistence. ADMIN has read access and tour mutations only, matching the legacy limited-write filter.

| Endpoint family | Unauthenticated | USER | ADMIN | SUPER_ADMIN | Verification |
|---|---:|---:|---:|---:|---|
| `GET /health`, public catalog/content/gallery/notifications/popup/cache manifest | ✓ | ✓ | ✓ | ✓ | Live public data reads and browser render |
| `POST /auth/*` | ✓ | ✓ | ✓ | ✓ | Public auth routes; endpoint-specific credential rules |
| `GET /users/me`, my tours/payments/bucket/history/photos | ✗ | ✓ self | ✓ self | ✓ | Middleware/source inspection; fake USER reaches user lookup |
| `GET /users`, enquiries, tours, payments, gallery, cache status, analytics | ✗ | ✗ | ✓ | ✓ | Live synthetic-claim probes: gallery/payments returned 401/403/200/200 as expected |
| Category/package/content/media/notification/keyword/cache mutations | ✗ | ✗ | ✗ | ✓ | Live `DELETE /categories/VERIFY-NONEXISTENT-DO-NOT-CREATE`: ADMIN 403, SUPER_ADMIN 404 (passed gate; no row changed) |
| Tour create/update/delete | ✗ | ✗ | ✓ | ✓ | Live `DELETE /tours/VERIFY-NONEXISTENT-DO-NOT-CREATE`: ADMIN 404, USER 403 (passed safe route gate; no row changed) |
| Cash/Razorpay payment writes; admin account changes; enquiry permanent delete | ✗ | ✗ | ✗ | ✓ | Route middleware/source audit; Razorpay not live-tested |
| `GET/POST/PUT/DELETE /admin-accounts*` | ✗ | ✗ | ✗ | ✓ | Live synthetic-claim probe: ADMIN 403, SUPER_ADMIN 200 |
| `POST /files` | ✗ | ✗ | ✗ | ✓ | Spring's global limited-ADMIN filter narrows its controller annotation; no upload performed |
| `POST /enquiries`, `/contact`, `/career-apply`, `/chatbot/query`, `/package-views` | ✓ | ✓ | ✓ | ✓ | Public flows; writes not run against production data |
| Razorpay webhook | HMAC only | HMAC only | HMAC only | HMAC only | Raw-body HMAC SHA-256 timing-safe verification; disabled without secret |

## Executed non-mutating probes

All synthetic JWTs were short-lived and used a nonexistent user ID. They were created solely to exercise middleware; no account, token session, payment, email, or domain data was persisted.

| Probe | Expected | Actual |
|---|---:|---:|
| Anonymous `GET /gallery` | 401 | 401 |
| USER `GET /gallery` | 403 | 403 |
| ADMIN `GET /gallery` | 200 | 200 |
| SUPER_ADMIN `GET /gallery` | 200 | 200 |
| ADMIN category mutation route | 403 | 403 |
| SUPER_ADMIN nonexistent category route | 404 after authorization | 404 |
| USER tour deletion route | 403 | 403 |
| ADMIN nonexistent tour deletion route | 404 after authorization | 404 |
| ADMIN `GET /admin-accounts` | 403 | 403 |
| SUPER_ADMIN `GET /admin-accounts` | 200 | 200 |

This demonstrates that ADMIN did not inherit SUPER_ADMIN mutation permissions. It does not substitute for an approved real-account acceptance test.
