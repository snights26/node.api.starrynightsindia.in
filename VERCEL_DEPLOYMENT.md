# Vercel deployment readiness

## Express entrypoint

`src/app.ts` builds and default-exports Express without calling `listen()`.
`src/server.ts` retains the local listener for `npm run dev` and `npm start`.
Vercel can deploy the default export without a `vercel.json`; no obsolete
builder configuration is committed.

The package requires Node **22 or later**. The Dockerfile stays on Node 22 for
non-Vercel parity. Build command: `npm run build`.

## Explicit environment separation

Vercel Preview and Production both set `NODE_ENV=production`, so cold start
checks explicit labels instead.

| Environment | `DEPLOYMENT_ENVIRONMENT` | `DATABASE_ENVIRONMENT` | Database | Razorpay | Mail |
| --- | --- | --- | --- | --- | --- |
| Preview/staging | `staging` | `staging` | node-staging Neon only | Test only | `safe` or `disabled` |
| Production | `production` | `production` | approved production only | Live only when enabled | approved live policy |

A missing/mismatched database environment, weak JWT secret, or incorrect
storage namespace fails non-local startup before database access. Preview
therefore cannot silently fall back to production.

Set Vercel’s root directory to `node.api.starrynightsindia.in`. Configure the
variables in `ENVIRONMENT_INVENTORY.md`; never import `.env.staging.local` or
commit environment files.

## Runtime constraints addressed

- No `express.static`, `LOCAL_UPLOAD_ROOT`, host bind mount, or `/app/uploads`
  dependency remains in runtime code.
- 4.5 MB is treated as the Function payload ceiling. Large uploads go direct
  to Blob; large downloads are authorized redirects.
- Health checks process/database reachability only, not a filesystem.
- `publicCache` is per-instance, best-effort only. Correctness and mutation
  visibility always come from the database.
- Razorpay receives the raw body captured before JSON parsing, verifies HMAC
  with timing-safe comparison, and reconciles against database state.

## Pre-import checklist

1. Complete the repository secret scan before creating/pushing a private GitHub repo. This workspace currently has an empty `.git` directory rather than a valid repository, so Git history/tracked-file status could not be audited in this pass. Initialize or attach the intended repository, then review `git status --ignored` and the first staged diff before any push.
2. Connect staging Blob stores and set Preview values for the node-staging Neon branch, including the Vercel-managed `BLOB_WEBHOOK_PUBLIC_KEY` needed for presigned uploads.
3. Set exact staging CORS origins, Google allowlist, Razorpay Test settings,
   and safe/disabled mail behavior.
4. Run the staging-only legacy Blob migration; source archive stays outside Git.
5. Do not promote Preview until production database/storage values and migration
   approval are separately complete.
