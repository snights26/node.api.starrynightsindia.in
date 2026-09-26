# Starry Nights Node API

This is the Node.js/Express migration target for the existing Spring API. It uses the same PostgreSQL/Neon schema directly; it has no ORM migrations and must never be used to alter, reset, or seed the production database.

## Run locally

1. Copy `.env.example` to `.env` and set the runtime secrets and database URL.
2. Run `npm install`.
3. Run `npm run dev`.

The API is served below `/api`; `GET /api/health` is safe without a configured database and Swagger is available at `/api/swagger-ui.html`.

## Important configuration

- `DATABASE_URL` is the pooled runtime Neon connection. `DATABASE_DIRECT_URL` is retained for explicitly approved administrative work and is not used by the application.
- `JWT_SECRET` must be the existing compatible HMAC secret (32+ characters) during cutover so existing sessions can be handled according to the rollout plan.
- Google, Cloudinary, SMTP, and Razorpay are opt-in. The service starts with those integrations disabled.
- Razorpay requests are server-side only. Configure test credentials first and set a webhook secret before accepting gateway callbacks.
- Existing Cloudinary URLs remain compatible. New large/customer/document uploads use Vercel Blob direct authorization; `/api/uploads` resolves migrated private objects and has no filesystem mount.

## Production build

Run `npm run build` and `npm start`, or deploy the default Express export in `src/app.ts` to Vercel. No Spring/Flyway Docker artefacts are copied into this application.

## Structure

`src/modules` owns the compatibility routes; `src/db` contains the pooled PostgreSQL access layer; `src/lib` centralizes responses, validation, JWT authorization, and errors; `src/services` contains cache, Cloudinary, SMTP, and Blob-storage adapters.

Read [MIGRATION_STATUS.md](MIGRATION_STATUS.md) before cutover for verification scope and outstanding deployment checks.
