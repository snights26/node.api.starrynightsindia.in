# Legacy upload archive migration

## Status

The historical archive remains read-only at
`F:\www.starrynightsindia.in\api.starrynightsindia.in\uploads`.

The last read-only inventory found five current references and all five source
files: three `career_applications.resume_url` values and two
`notifications.pdf_url` values. The archive is not copied into this repository,
mounted into a container, or deleted.

## Vercel-compatible target

Every referenced file is uploaded to the **private** Blob store with a stable,
deterministic key:

```text
/api/uploads/folder/file.pdf
  -> staging/starry-nights/legacy/folder/file.pdf
```

`STORAGE_NAMESPACE` changes the environment prefix. Database values remain
unchanged. `GET` and `HEAD /api/uploads/<path>` first find the owning database
record, apply authorization, and then redirect to a short-lived private Blob
read URL.

| Historical reference | Access after migration |
| --- | --- |
| `career_applications.resume_url` | ADMIN/SUPER_ADMIN only; unknown paths return 404. |
| Targeted `notifications.pdf_url` | That user or an administrator only. |
| `all`/`public` `notifications.pdf_url` | Public access, still through a short-lived signed Blob URL. |

New notification PDFs use the separate SUPER_ADMIN-only
`/api/notifications/authorize-document` / `finalize-document` direct-private
flow. The generic public media flow must not be used for a targeted document.

No route exposes a permanent resume URL. The legacy source archive stays
untouched even if an administrator later deletes the migrated database record.

## One-time staging utility

`scripts/migrate-legacy-uploads-to-blob.ts` is deliberately staging-only and
performs no database writes. It reads the two reference columns, reads only the
referenced files, uses a content hash and size check, verifies each destination
object exists, and writes a sanitized, ignored report under `reports/`.

It requires these out-of-repository values:

```text
DEPLOYMENT_ENVIRONMENT=staging
DATABASE_ENVIRONMENT=staging
DATABASE_URL=<node-staging pooled URL>
LEGACY_UPLOAD_ARCHIVE=<read-only historical archive path>
VERCEL_BLOB_ENABLED=true
VERCEL_BLOB_PRIVATE_STORE_ID=<staging private store id>
VERCEL_BLOB_PRIVATE_READ_WRITE_TOKEN=<local migration credential>
```

Dry-run inventory:

```powershell
npm run migrate:legacy-uploads
```

An actual Blob copy additionally requires an explicit staging confirmation:

```powershell
$env:LEGACY_UPLOAD_MIGRATION_CONFIRM = 'staging-node-staging'
npm run migrate:legacy-uploads -- --execute
```

The script must not run with production configuration. It never updates or
deletes production/staging database rows, and it never deletes a source file.

## Cutover gate

1. Connect private staging Blob storage and run the dry run.
2. Review only sanitized report counts and fingerprints.
3. Run the explicit staging copy and verify five destination objects.
4. Validate notification and resume authorization through deployed staging.
5. Keep the source archive outside Git; do not reintroduce `LOCAL_UPLOAD_ROOT`
   or an `/app/uploads` mount.
