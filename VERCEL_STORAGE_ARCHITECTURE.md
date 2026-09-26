# Vercel storage architecture

## Decision

Existing Cloudinary URLs and assets remain unchanged. New durable uploads use
Vercel Blob through `StorageService` in `src/services/blob-storage.ts`.
Cloudinary remains only as a small-request compatibility path for existing
admin endpoints while callers transition to direct public-media upload. No
mobile or browser receives a Cloudinary secret or Blob read-write credential.

This removes the VPS/Docker archive dependency without a risky migration of the
existing Cloudinary library.

## Stores and object classes

Use separate Blob stores/namespaces for private and public material when both
classes are needed. Deployed Vercel Functions use platform OIDC plus
non-secret `BLOB_PRIVATE_STORE_ID`/`BLOB_PUBLIC_STORE_ID` values (or the
official single-private-store fallback `BLOB_STORE_ID`). A scoped
`BLOB_READ_WRITE_TOKEN` is allowed only for a local one-time migration shell.

| Content | Access | Representation | Read behavior |
| --- | --- | --- | --- |
| Mobile travel photos | Private | `blob-private://<encoded pathname>` | Owner/SUPER_ADMIN gets a short-lived signed URL. |
| Career resumes | Private | private reference | ADMIN/SUPER_ADMIN-only signed download. |
| Quotations | Private temporary | no persisted reference | Admin upload, mail attachment, then cleanup. |
| Notification PDFs | Private by default | private reference | Targeted recipient/admin gets a short-lived signed URL; public notices receive a short-lived URL through the public notification response. |
| Legacy `/api/uploads/*` | Private | old DB value unchanged | Compatibility route authorizes then redirects. |
| New direct public media | Public | Blob HTTPS URL | Only for intentional public content. |
| Existing Cloudinary media | Existing behavior | existing URL/public ID | Unchanged. |

Default classification is private. A public Blob URL is accepted only after an
authorized public-media upload flow.

## Direct upload protocol

```text
client -> API authorize (auth + type + declared-size validation)
       <- opaque intent + exact pathname
client -> /api/storage/uploads/presign (intent)
       <- short-lived Blob presigned control URL
client -> Blob direct upload (outside the Function)
client -> feature finalize (intent + Blob URL)
API    -> Blob HEAD verifies pathname/type/size/ownership
API    -> writes business record or sends authorized email
```

The opaque intent is not a Blob credential. Server-side `@vercel/blob`
`issueSignedToken` and `presignUrl` are isolated in `StorageService`; they
constrain one pathname, MIME type, size, expiry, and overwrite behavior. There
is no provider upload callback or webhook key. The Expo app performs the
returned presigned PUT with native `fetch`, rather than bundling the
Node-oriented Blob SDK.

### Direct flows

- `/api/upload-photo/authorize` and `/finalize`: JPEG, PNG, WebP up to 25 MB.
- `/api/career-apply/authorize-upload` and `/finalize-upload`: private PDF or
  Word resume, finalizer validates storage object before persistence.
- `/api/quotations/authorize-upload` and `/finalize-upload`: admin-only,
  private PDF, deleted after mail attempt.
- `/api/notifications/authorize-document` and `/finalize-document`:
  SUPER_ADMIN-only private PDF. This explicit flow is necessary because the
  generic public-media route is not an acceptable store for targeted documents.
- `/api/files/authorize-upload` and `/finalize-upload`: admin-only direct
  public media. Occasion routes accept only a managed public Blob URL.

Legacy multipart endpoints are capped at 4 MB and return 413 with direct-upload
guidance. Product limits remain available through direct Blob, so photos remain
25 MB and private documents retain their configured limit.

## Retention and email

- User photo deletion authorizes ownership, deletes the private object, then
  deletes the gallery row.
- Career deletion removes newly stored private objects. Historical source
  archive files are never deleted by this API.
- Quotations are temporary private objects deleted in a `finally` block.
- SMTP is stateless: small legacy attachments are in memory; direct Blob
  attachments use a short-lived authorized `href`, never a local file path.

## Required external setup

1. Connect an isolated staging private Blob store to the Vercel project. Add a
   public store only if a direct public-media flow is enabled; existing
   Cloudinary URLs remain the public-media system until then.
2. Supply the selected store's non-secret `BLOB_PRIVATE_STORE_ID` (or official
   `BLOB_STORE_ID`) to Functions. Vercel-managed OIDC is preferred; keep
   read/write tokens only in a local migration shell.
3. Use isolated namespaces such as `staging/starry-nights` and
   `production/starry-nights`.
4. Move file callers to direct flows before sending more than 4 MB.
