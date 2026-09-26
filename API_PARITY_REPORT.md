# API parity report

Scope: Spring controllers in `api.starrynightsindia.in` were compared line-by-line with the Express route handlers and services in this project. Every Spring mapping includes the `/api` context path below. `YES` means the same route, authorization boundary, schema mapping, and client-facing envelope are implemented; `PARTIAL` identifies a concrete, non-silent difference.

## Compatibility key

| Code | Request compatibility | Response compatibility | Database / integration behavior |
|---|---|---|---|
| `R0` | No request body; path/query preserved | `E` | Standard `{ success, message, data }` envelope and source-shaped mapper |
| `RJ` | JSON fields validated; legacy aliases accepted where the React apps send them | `E` | Direct mapping to the indicated existing schema tables; no migration |
| `RM` | Multipart field names preserved | `E` | Existing integration behavior, noted by code |
| `A` | Bearer JWT claims `sub`, `uid`, `userId`, `role`; source-compatible role gate | `E` | Authorization precedes persistence |
| `C` | Public cache key/query behavior retained | `E` | In-process LRU with mutation invalidation |
| `DB:*` | — | — | Existing Neon/PostgreSQL tables and relationships verified through `information_schema` |
| `I:*` | — | — | `I:GOOGLE`, `I:SMTP`, `I:CLOUDINARY`, `I:RAZORPAY`, or `I:LOCAL_UPLOAD` |

## Endpoint inventory

### Authentication and health

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | `/api/auth/login` | YES | Public; USER only | RJ | E | DB:app_users, refresh_tokens; password login remains config-disabled by default |
| POST | `/api/auth/admin/login` | `/api/auth/admin/login` | YES | Public; ADMIN/SUPER_ADMIN credential only | RJ | E | DB:app_users, refresh_tokens; BCrypt comparison |
| POST | `/api/auth/register` | `/api/auth/register` | YES | Public when explicitly enabled | RJ | E | DB:app_users, refresh_tokens; config-disabled by default |
| POST | `/api/auth/google` | `/api/auth/google` | YES | Public | RJ | E | DB:app_users, refresh_tokens; I:GOOGLE issuer/audience/token verification |
| POST | `/api/auth/refresh` | `/api/auth/refresh` | YES | Refresh token | RJ | E | DB:refresh_tokens rotation/session persistence |
| POST | `/api/auth/logout` | `/api/auth/logout` | YES | Refresh token | RJ | E | DB:refresh_tokens revocation |
| GET | `/api/health` | `/api/health` | PARTIAL | Public | R0 | Node adds standard envelope and DB/integration status to Spring's raw status map | Live read-only check returned `UP` with DB `UP` |

### Catalog and categories

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/categories` | `/api/categories` | YES | Public | R0 | E | DB:categories self-parent tree |
| GET | `/api/categories/tree` | `/api/categories/tree` | YES | Public | R0 | E | DB:categories; client tree shape retained |
| GET | `/api/categories/{code}` | `/api/categories/{code}` | YES | Public | R0 | E | DB:categories by code |
| POST | `/api/categories` | `/api/categories` | YES | A; SUPER_ADMIN | RJ | E | DB:categories; cache invalidation |
| PUT | `/api/categories/{code}` | `/api/categories/{code}` | YES | A; SUPER_ADMIN | RJ | E | DB:categories; cache invalidation |
| DELETE | `/api/categories/{code}` | `/api/categories/{code}` | YES | A; SUPER_ADMIN | R0 | E | DB:categories with relation guard; cache invalidation |
| GET | `/api/categories/{code}/packages` | `/api/categories/{code}/packages` | YES | Public | R0 | E | DB:categories, package_categories, travel_packages |
| GET | `/api/packages` | `/api/packages` | YES | Public | R0/C | E | DB:travel_packages, categories, package_categories; category/brand filters |
| GET | `/api/packages/{code}` | `/api/packages/{code}` | YES | Public | R0/C | E | DB:travel_packages, package_itineraries, package_categories |
| POST | `/api/categories/{code}/packages/{packageCode}` | `/api/categories/{code}/packages/{packageCode}` | YES | A; SUPER_ADMIN | R0 | E | DB:package_categories; cache invalidation |
| DELETE | `/api/categories/{code}/packages/{packageCode}` | `/api/categories/{code}/packages/{packageCode}` | YES | A; SUPER_ADMIN | R0 | E | DB:package_categories; cache invalidation |
| POST | `/api/packages` | `/api/packages` | YES | A; SUPER_ADMIN | RJ | E | DB:travel_packages, package_categories, package_itineraries; cache invalidation |
| PUT | `/api/packages/{code}` | `/api/packages/{code}` | YES | A; SUPER_ADMIN | RJ | E | DB:travel_packages, relations, itineraries; cache invalidation |
| DELETE | `/api/packages/{code}` | `/api/packages/{code}` | YES | A; SUPER_ADMIN | R0 | E | DB:package relations/view history guarded before deletion |

### User, administrator, and bucket-list routes

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/users` | `/api/users` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:app_users |
| GET | `/api/users/me` | `/api/users/me` | YES | A; USER/ADMIN/SUPER_ADMIN | R0 | E | DB:app_users |
| GET | `/api/users/liked-packages/report` | `/api/users/liked-packages/report` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:app_users, user_bucket_list, package relations |
| PUT | `/api/users/me/complete-profile` | `/api/users/me/complete-profile` | YES | A; authenticated self | RJ | E | DB:app_users; I:SMTP profile-completion template |
| GET | `/api/users/{id}` | `/api/users/{id}` | YES | A; self or SUPER_ADMIN | R0 | E | DB:app_users, user_bucket_list |
| POST | `/api/users` | `/api/users` | YES | A; SUPER_ADMIN | RJ | E | DB:app_users |
| PUT | `/api/users/{id}` | `/api/users/{id}` | YES | A; self or SUPER_ADMIN | RJ | E | DB:app_users |
| DELETE | `/api/users/{id}` | `/api/users/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:app_users and dependent-record guards |
| GET | `/api/users/me/bucket-list` | `/api/users/me/bucket-list` | YES | A; authenticated self | R0 | E | DB:user_bucket_list, travel_packages |
| POST | `/api/users/me/bucket-list/{packageCode}` | `/api/users/me/bucket-list/{packageCode}` | YES | A; authenticated self | R0 | E | DB:user_bucket_list toggle |
| PUT | `/api/users/me/bucket-list` | `/api/users/me/bucket-list` | YES | A; authenticated self | RJ | E | DB:user_bucket_list replacement transaction |
| GET | `/api/admin-accounts` | `/api/admin-accounts` | YES | A; SUPER_ADMIN | R0 | E | DB:app_users administrator roles |
| POST | `/api/admin-accounts` | `/api/admin-accounts` | YES | A; SUPER_ADMIN | RJ | E | DB:app_users BCrypt password |
| PUT | `/api/admin-accounts/{id}/role` | `/api/admin-accounts/{id}/role` | YES | A; SUPER_ADMIN | RJ | E | DB:app_users and refresh_tokens invalidation; last-super-admin guard |
| PUT | `/api/admin-accounts/{id}/password` | `/api/admin-accounts/{id}/password` | YES | A; SUPER_ADMIN | RJ | E | DB:app_users and refresh_tokens invalidation |
| DELETE | `/api/admin-accounts/{id}` | `/api/admin-accounts/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:app_users soft removal; last-super-admin guard |

### Content, cache, and occasion popups

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/featured-rows` | `/api/featured-rows` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:featured_rows, featured_row_items |
| GET | `/api/featured-rows/public` | `/api/featured-rows/public` | YES | Public | R0/C | E | DB:featured rows plus category/package expansion |
| POST | `/api/featured-rows` | `/api/featured-rows` | YES | A; SUPER_ADMIN | RJ | E | DB:featured rows/items transaction; cache invalidation |
| PUT | `/api/featured-rows/{rowId}` | `/api/featured-rows/{rowId}` | YES | A; SUPER_ADMIN | RJ | E | DB:featured rows/items transaction; cache invalidation |
| POST | `/api/featured-rows/order` | `/api/featured-rows/order` | YES | A; SUPER_ADMIN | RJ | E | DB:featured_rows sequence; cache invalidation |
| DELETE | `/api/featured-rows/{rowId}` | `/api/featured-rows/{rowId}` | YES | A; SUPER_ADMIN | R0 | E | DB:featured_rows/items; cache invalidation |
| GET | `/api/hero-sliders` | `/api/hero-sliders` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:hero_slider_images |
| GET | `/api/hero-sliders/public` | `/api/hero-sliders/public` | YES | Public | R0/C | E | DB:hero_slider_images active rows |
| POST | `/api/hero-sliders` | `/api/hero-sliders` | YES | A; SUPER_ADMIN | RJ | E | DB:hero_slider_images; cache invalidation |
| PUT | `/api/hero-sliders/{imageId}` | `/api/hero-sliders/{imageId}` | YES | A; SUPER_ADMIN | RJ | E | DB:hero_slider_images; cache invalidation |
| DELETE | `/api/hero-sliders/{imageId}` | `/api/hero-sliders/{imageId}` | YES | A; SUPER_ADMIN | R0 | E | DB:hero_slider_images; cache invalidation |
| GET | `/api/homepage-statistics` | `/api/homepage-statistics` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:homepage_statistics |
| GET | `/api/homepage-statistics/public` | `/api/homepage-statistics/public` | YES | Public | R0/C | E | DB:homepage_statistics active rows |
| POST | `/api/homepage-statistics` | `/api/homepage-statistics` | YES | A; SUPER_ADMIN | RJ | E | DB:homepage_statistics; cache invalidation |
| PUT | `/api/homepage-statistics/{id}` | `/api/homepage-statistics/{id}` | YES | A; SUPER_ADMIN | RJ | E | DB:homepage_statistics; cache invalidation |
| DELETE | `/api/homepage-statistics/{id}` | `/api/homepage-statistics/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:homepage_statistics; cache invalidation |
| GET | `/api/public-cache/manifest` | `/api/public-cache/manifest` | YES | Public | R0/C | E | Browser IndexedDB manifest keys/version retained |
| GET | `/api/cache-management/status` | `/api/cache-management/status` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | In-memory cache status |
| POST | `/api/cache-management/rebuild/catalog` | `/api/cache-management/rebuild/catalog` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/rebuild/featured-rows` | `/api/cache-management/rebuild/featured-rows` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/rebuild/public-content` | `/api/cache-management/rebuild/public-content` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/rebuild/group/{group}` | `/api/cache-management/rebuild/group/{group}` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/rebuild/all` | `/api/cache-management/rebuild/all` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/clear/{group}` | `/api/cache-management/clear/{group}` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/clear/all` | `/api/cache-management/clear/all` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| POST | `/api/cache-management/browser-cache/invalidate` | `/api/cache-management/browser-cache/invalidate` | YES | A; SUPER_ADMIN | R0 | E | C; cache version bumps |
| GET | `/api/occasion-popups/current` | `/api/occasion-popups/current` | YES | Public | R0/C | E | DB:occasion_popups current active row |
| GET | `/api/occasion-popups` | `/api/occasion-popups` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:occasion_popups |
| GET | `/api/occasion-popups/{id}` | `/api/occasion-popups/{id}` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:occasion_popups |
| POST | `/api/occasion-popups` | `/api/occasion-popups` | YES | A; SUPER_ADMIN | RM | E | DB:occasion_popups; I:CLOUDINARY |
| PUT | `/api/occasion-popups/{id}` | `/api/occasion-popups/{id}` | YES | A; SUPER_ADMIN | RM | E | DB:occasion_popups; I:CLOUDINARY |
| POST | `/api/occasion-popups/{id}/activate` | `/api/occasion-popups/{id}/activate` | YES | A; SUPER_ADMIN | R0 | E | DB:occasion_popups locking/single-active invariant |
| POST | `/api/occasion-popups/{id}/deactivate` | `/api/occasion-popups/{id}/deactivate` | YES | A; SUPER_ADMIN | R0 | E | DB:occasion_popups |
| DELETE | `/api/occasion-popups/{id}` | `/api/occasion-popups/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:occasion_popups; cloud cleanup best-effort |

### Enquiries, bookings, payments, and Razorpay

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/enquiries` | `/api/enquiries` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:enquiries |
| POST | `/api/enquiries` | `/api/enquiries` | YES | Public | RJ | E | DB:enquiries; I:SMTP acknowledgement/admin alert; staging validation: invalid request 400, marked test enquiry 201, exact cleanup 1 row with SMTP disabled |
| DELETE | `/api/enquiries/{inquiryId}` | `/api/enquiries/{inquiryId}` | YES | A; SUPER_ADMIN | R0 | E | DB:enquiries |
| GET | `/api/tours` | `/api/tours` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:tour_bookings, tour_accommodations, travel_packages |
| GET | `/api/tours/{tourId}` | `/api/tours/{tourId}` | YES | A; owner or administrator | R0 | E | DB:tour_bookings relations |
| GET | `/api/mytours` | `/api/mytours` | YES | A; authenticated self | R0 | E | DB:tour_bookings by JWT subject; ignores untrusted legacy email query |
| POST | `/api/tours` | `/api/tours` | YES | A; ADMIN/SUPER_ADMIN | RJ | E | DB:tour_bookings, accommodations, initial payment; I:SMTP booking/receipt |
| PUT | `/api/tours/{tourId}` | `/api/tours/{tourId}` | YES | A; ADMIN/SUPER_ADMIN | RJ | E | DB:tour_bookings, accommodations transaction |
| DELETE | `/api/tours/{tourId}` | `/api/tours/{tourId}` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:soft delete for ADMIN; reconciliation guard/permanent delete for SUPER_ADMIN |
| GET | `/api/payments` | `/api/payments` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:payments, tour_bookings |
| GET | `/api/my-payments` | `/api/my-payments` | YES | A; authenticated self | R0 | E | DB:payments, tour_bookings by JWT owner |
| POST | `/api/payments` | `/api/payments` | YES | A; SUPER_ADMIN | RJ | E | DB:payments cash record; I:SMTP receipt |
| GET | `/api/payments/tour-lookup/{tourId}` | `/api/payments/tour-lookup/{tourId}` | YES | A; SUPER_ADMIN | R0 | E | DB:tour_bookings, payments |
| POST | `/api/payments/razorpay` | `/api/payments/razorpay` | YES | A; SUPER_ADMIN | RJ | E | DB:payments; I:RAZORPAY server-only INR link and I:SMTP request |
| POST | `/api/payments/{id}/razorpay/resend` | `/api/payments/{id}/razorpay/resend` | YES | A; SUPER_ADMIN | R0 | E | DB:payments; I:SMTP only |
| POST | `/api/payments/{id}/razorpay/refresh` | `/api/payments/{id}/razorpay/refresh` | YES | A; SUPER_ADMIN | R0 | E | DB:payments; I:RAZORPAY reconciliation |
| POST | `/api/payments/{id}/razorpay/cancel` | `/api/payments/{id}/razorpay/cancel` | YES | A; SUPER_ADMIN | R0 | E | DB:payments; I:RAZORPAY cancellation/reconciliation |
| DELETE | `/api/payments/{id}` | `/api/payments/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:payments; Razorpay history retained |
| GET | `/api/payments/invoice/{tourId}` | `/api/payments/invoice/{tourId}` | YES | A; owner or administrator | R0 | E | DB:tour_bookings, payments invoice projection |
| POST | `/api/webhooks/razorpay` | `/api/webhooks/razorpay` | YES | Razorpay HMAC, no browser auth | Raw signed JSON | E | DB:payments/tour_bookings; I:RAZORPAY HMAC SHA-256 timing-safe comparison |

### Media, notifications, support, and uploads

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/files` | `/api/files` | PARTIAL | A; SUPER_ADMIN effective (the legacy global limited-ADMIN filter narrows its controller annotation) | RM (`file`, `folder`, `imageOnly`) | E `{url}` | I:CLOUDINARY generic/image upload; Spring's local write provider is intentionally not recreated |
| GET | `/api/uploads/{folder}/{filename}` | `/api/uploads/{folder}/{filename}` | YES | Context-specific: career resumes ADMIN/SUPER_ADMIN; public notifications public; targeted notifications owner/admin | R0 | 302 to a short-lived private Blob URL, not E | I:private Blob compatibility resolver; historical DB values remain unchanged and unknown paths 404 |
| GET | `/api/gallery` | `/api/gallery` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:gallery_images, app_users |
| GET | `/api/gallery/public` | `/api/gallery/public` | YES | Public | R0/C | E | DB:gallery_images approved/featured/consented rows |
| GET | `/api/get-photos` | `/api/get-photos` | YES | A; authenticated self | R0 | E | DB:gallery_images owned rows |
| POST | `/api/gallery` | `/api/gallery` | YES | A; SUPER_ADMIN | RJ | E | DB:gallery_images; cache invalidation |
| POST | `/api/upload-photo` | `/api/upload-photo` | YES (small compatibility) | A; authenticated self | RM, capped 4 MB | E | DB:gallery_images; I:private Blob |
| — | — | `/api/upload-photo/authorize`, `/api/upload-photo/finalize` | YES | A; authenticated self | RJ authorization/finalization | E | Direct private Blob JPEG/PNG/WebP up to 25 MB; Function never receives the binary |
| — | — | `/api/storage/uploads/presign` | YES | Signed opaque intent/owner | Blob control protocol | Vercel protocol response | Issues a scope-limited direct-upload URL; no Blob credential reaches client |
| PUT | `/api/gallery/{imageId}` | `/api/gallery/{imageId}` | YES | A; SUPER_ADMIN | RJ | E | DB:gallery_images; cache invalidation |
| DELETE | `/api/gallery/{imageId}` | `/api/gallery/{imageId}` | YES | A; SUPER_ADMIN | R0 | E | DB:gallery_images; cache invalidation |
| DELETE | `/api/delete-photo/{imageId}` | `/api/delete-photo/{imageId}` | YES | A; owner or SUPER_ADMIN | R0 | E | DB:gallery_images; cache invalidation |
| GET | `/api/notifications` | `/api/notifications` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:notifications, app_users |
| GET | `/api/notifications/public` | `/api/notifications/public` | YES | Public | R0/C | E | DB:notifications public/all rows |
| GET | `/api/notifications/me` | `/api/notifications/me` | YES | A; authenticated self | R0 | E | DB:notifications targeted/all rows |
| POST | `/api/notifications` | `/api/notifications` | YES | A; SUPER_ADMIN | RJ | E | DB:notifications; cache invalidation |
| PUT | `/api/notifications/{id}` | `/api/notifications/{id}` | YES | A; SUPER_ADMIN | RJ | E | DB:notifications; cache invalidation |
| DELETE | `/api/notifications/{id}` | `/api/notifications/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:notifications; cache invalidation |
| — | — | `/api/notifications/authorize-document`, `/api/notifications/finalize-document` | YES | A; SUPER_ADMIN | RJ authorization/finalization | E | Necessary Node-only addition: private PDF direct Blob flow; a targeted document cannot use generic public media. |
| GET | `/api/keywords` | `/api/keywords` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:keywords |
| POST | `/api/keywords` | `/api/keywords` | YES | A; SUPER_ADMIN | RJ | E | DB:keywords |
| PUT | `/api/keywords/{id}` | `/api/keywords/{id}` | YES | A; SUPER_ADMIN | RJ | E | DB:keywords |
| DELETE | `/api/keywords/{id}` | `/api/keywords/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:keywords |
| GET | `/api/unanswered` | `/api/unanswered` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:unanswered_questions |
| POST | `/api/unanswered/{id}/answer` | `/api/unanswered/{id}/answer` | YES | A; SUPER_ADMIN | RJ | E | DB:unanswered_questions |
| DELETE | `/api/unanswered/{id}` | `/api/unanswered/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:unanswered_questions |
| POST | `/api/contact` | `/api/contact` | YES | Public | RJ | E | DB:contact_messages; I:SMTP acknowledgement/support alert |
| POST | `/api/career-apply` | `/api/career-apply` | YES | Public | RM (`resume`) | E | DB:career_applications; I:SMTP private attachment |
| POST | `/api/quotations/email` | `/api/quotations/email` | YES | A; ADMIN/SUPER_ADMIN | RM (`quotation`) | E | No quotation persistence; I:SMTP PDF attachment |
| GET | `/api/admin/customer-submissions/contacts` | `/api/admin/customer-submissions/contacts` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:contact_messages pagination/search |
| GET | `/api/admin/customer-submissions/contacts/{id}` | `/api/admin/customer-submissions/contacts/{id}` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:contact_messages |
| DELETE | `/api/admin/customer-submissions/contacts/{id}` | `/api/admin/customer-submissions/contacts/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:contact_messages |
| GET | `/api/admin/customer-submissions/careers` | `/api/admin/customer-submissions/careers` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:career_applications pagination/search |
| GET | `/api/admin/customer-submissions/careers/{id}` | `/api/admin/customer-submissions/careers/{id}` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:career_applications metadata only |
| DELETE | `/api/admin/customer-submissions/careers/{id}` | `/api/admin/customer-submissions/careers/{id}` | YES | A; SUPER_ADMIN | R0 | E | DB:career_applications |

### Package views and chatbot

| Method | Spring route | Node route | Implemented | Auth / roles | Request | Response | DB / integration / notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/package-views` | `/api/package-views` | YES | Public or optional A | RJ | E | DB:package_view_histories, travel_packages; guest/session and user upserts |
| GET | `/api/package-views/me` | `/api/package-views/me` | YES | A; authenticated self | R0 | E | DB:package_view_histories |
| DELETE | `/api/package-views/me/{packageCode}` | `/api/package-views/me/{packageCode}` | YES | A; authenticated self | R0 | E | DB:package_view_histories soft hide |
| DELETE | `/api/package-views/me` | `/api/package-views/me` | YES | A; authenticated self | R0 | E | DB:package_view_histories soft hide |
| GET | `/api/package-views/analytics` | `/api/package-views/analytics` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:package_view_histories aggregation |
| GET | `/api/package-views/viewers` | `/api/package-views/viewers` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:package_view_histories/app_users pagination |
| GET | `/api/package-views/guest-packages` | `/api/package-views/guest-packages` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:package_view_histories/travel_packages |
| GET | `/api/package-views/guest-packages/{packageCode}/viewers` | `/api/package-views/guest-packages/{packageCode}/viewers` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:package_view_histories |
| GET | `/api/package-views/viewers/{viewerIdentifier}/packages` | `/api/package-views/viewers/{viewerIdentifier}/packages` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:package_view_histories/travel_packages |
| POST | `/api/chatbot/query` | `/api/chatbot/query` | YES | Public | RJ | E | DB:keywords, travel_packages, chatbot_interactions, unanswered_questions; deterministic fallback while semantic mode is deferred |
| GET | `/api/chatbot/analytics` | `/api/chatbot/analytics` | YES | A; ADMIN/SUPER_ADMIN | R0 | E | DB:chatbot_interactions |

## Totals and exceptions

| Measure | Count |
|---|---:|
| Spring mapping annotations | 133 |
| Effective Spring routes (the two-path gallery delete counts twice) | 134 |
| Fully migrated | 131 |
| Partially migrated | 3 |
| Missing | 0 |
| Intentionally deferred production endpoints | 0 |

The three partial routes are explicit: health has an enhanced envelope, while legacy local upload write/serve behavior requires an explicit archive mount and does not reintroduce Spring's local-storage writer. No Spring production endpoint is unexplained or absent.
