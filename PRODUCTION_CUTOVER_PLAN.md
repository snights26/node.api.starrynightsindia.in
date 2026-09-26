# Production cutover plan

This plan does not authorize routing production traffic. It is the sequence to use only after every required item in `CUTOVER_ACCEPTANCE.md` has passed in approved staging.

## Pre-cutover

1. Confirm a recoverable Neon backup/restore path and record the tested restore owner, timestamp, and runbook. No schema migration is part of this release.
2. Inject staging/production values through the deployment secret store: database URL, JWT secret, Google client, SMTP, Cloudinary, Razorpay test/live credentials as appropriate, and exact CORS/UI URLs. Never bake secrets into images.
3. Build immutable API/public/admin images from the verified commit. Rebuild frontend images with their final `VITE_API_BASE_URL` values.
4. Set one non-secret `PUBLIC_BROWSER_CACHE_EPOCH` shared by all Node API replicas and change it for this deploy.
5. Migrate the five referenced legacy files to the private Blob store using the
   staging-only verified utility. Keep the source archive outside Git as a
   read-only rollback archive; do not mount it into Vercel or configure
   `LOCAL_UPLOAD_ROOT`.
6. Configure reverse proxy/DNS, TLS, forwarded headers, request-size limits, `/api/health` checks, and SPA fallback. Preserve Spring routes while Node is warmed up.
7. Validate Google redirect/audience configuration, a safe SMTP recipient, Cloudinary staging folder, Razorpay **test** key/webhook, and exactly one approved test customer/admin account. Create no production-only testing account.
8. Ensure payment webhooks route to exactly one active implementation at a time. Do not allow Spring and Node to reconcile or notify for the same payment concurrently.

## Cutover sequence

1. **Deploy Node API dark.** Deploy a Vercel Preview with `DEPLOYMENT_ENVIRONMENT=staging`, node-staging Neon, and staging Blob stores while traffic remains routed to Spring. Verify `/api/health`, database `UP`, CORS from both deployed frontend origins, authorized legacy Blob paths, and non-mutating catalog/content reads.
2. **Run staging acceptance.** Complete real Google/admin refresh/logout, mail, Cloudinary test-object lifecycle, Razorpay test link/webhook/reconciliation/cancel, quotation attachment, and rollback-safe writes. Require the acceptance checklist to be PASS for every required item.
3. **Switch API traffic.** Move the public API upstream from Spring to Node using a reversible proxy/backend-pool change. Observe error rate, database pool health, 401/refresh loops, mail queue behavior, and payment webhook logs. Do not switch payment webhooks before the Node API is healthy.
4. **Switch admin frontend.** Deploy the built admin bundle pointing to Node. Use the approved admin account to validate read-only dashboards first, then the staging test record flows.
5. **Switch public frontend.** Deploy the built public bundle pointing to Node. Validate home/catalog/detail/category/search/contact and one safe customer account without creating a charge.
6. **Enable/route external integrations one at a time.** Google, SMTP, Cloudinary, then Razorpay test/live according to approved change control. Keep telemetry and rollback window open.

## Rollback plan

1. Stop new Node feature/write activity and preserve logs, request IDs, payment IDs, and the exact deployment/cache epoch.
2. Route API traffic back to Spring through the reverse proxy/backend-pool change. Route admin/public bundles back only if their Node API assumptions prevent normal use; otherwise they may remain if API contract compatibility is confirmed.
3. Keep the same database and the legacy upload archive. Do **not** delete Node-created rows, payments, refresh sessions, or uploaded test evidence as a rollback mechanism.
4. Treat Node-created catalog/content/tour/payment rows as Spring-compatible only after the completed staging write matrix proves the exact flow. Until then, stop and reconcile manually rather than replaying writes.
5. Route Razorpay webhooks to only the chosen active backend. Do not replay a webhook or send a second payment-link/receipt merely to test recovery. Reconcile provider IDs, local payment state, and customer email delivery before re-enabling Node.
6. Roll back the public browser cache epoch only by deploying the previous application with a **new** epoch, never by asking browsers to retain an old snapshot.

## Observability and stop conditions

Immediately pause cutover and roll back routing if health/database degrades, authenticated requests enter a refresh loop, Node returns unexpected 4xx/5xx for a known frontend route, legacy uploads return 404, a payment provider response cannot be reconciled, or an external message could be sent twice.
