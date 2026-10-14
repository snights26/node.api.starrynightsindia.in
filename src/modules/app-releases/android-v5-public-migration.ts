import { createHash, randomUUID } from "node:crypto";
import { get, issueSignedToken, parseStoreIdFromDelegationToken, put } from "@vercel/blob";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/api.js";
import { isManagedPublicBlobUrl, publicBlobDownloadUrl } from "../../services/blob-storage.js";

export const SN2_V5_SHA256 = "2e9707d0328d43be9c8a857fd43de9c9235c56ee1c680ad583b84a1ba700adea";
export const SN2_V5_SIZE = 34_460_908;
export const APK_CONTENT_TYPE = "application/vnd.android.package-archive";

export type AndroidReleaseMigrationSource = {
  id: string;
  version_name: string;
  version_code: number;
  file_url: string;
  file_size: string | number | null;
  sha256: string;
  is_active: boolean;
};

export type PublicAndroidReleaseAsset = {
  url: string;
  publicId: string;
  fileSize: number;
  sha256: string;
};

const normalizedStoreId = (value: string): string => value.replace(/^store_/, "");
const normalizedContentType = (value: string | null): string => value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
const fileSize = (value: string | number | null): number => Number(value);

const fail = (message: string): never => {
  throw new AppError(409, message);
};

const requireStoreIds = (): { privateStoreId: string; publicStoreId: string } => {
  const { privateStoreId, publicStoreId } = env.storage;
  if (!privateStoreId || !publicStoreId) {
    throw new AppError(503, "Both private and public Blob store IDs must be configured for this migration");
  }
  return { privateStoreId, publicStoreId };
};

export const assertSn2V5MigrationSource = (release: AndroidReleaseMigrationSource): void => {
  if (!release.is_active || release.version_name !== "SN2" || release.version_code !== 5) {
    fail("The active Android release is no longer the approved SN2 versionCode 5 source");
  }
  if (release.sha256.toLowerCase() !== SN2_V5_SHA256 || fileSize(release.file_size) !== SN2_V5_SIZE) {
    fail("The active Android release no longer matches the approved APK checksum and size");
  }
  const source = (() => {
    try {
      return new URL(release.file_url);
    } catch {
      return fail("The active Android release has an invalid source URL");
    }
  })();
  if (source.protocol !== "https:" || !source.hostname.endsWith(".private.blob.vercel-storage.com")) {
    fail("The active Android release is not the expected private Blob source");
  }
};

const digest = async (stream: ReadableStream<Uint8Array>): Promise<{ sha256: string; size: number }> => {
  const hash = createHash("sha256");
  let size = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      hash.update(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return { sha256: hash.digest("hex"), size };
};

const assertExpectedApk = (metadata: { contentType: string; size: number }, verified: { sha256: string; size: number }): void => {
  if (normalizedContentType(metadata.contentType) !== APK_CONTENT_TYPE) fail("The APK content type does not match the approved source");
  if (metadata.size !== SN2_V5_SIZE || verified.size !== SN2_V5_SIZE || verified.sha256 !== SN2_V5_SHA256) {
    fail("The APK size or checksum does not match the approved source");
  }
};

/** Requests a scoped PUT delegation but intentionally does not write a Blob. */
export const preflightPublicAndroidBlobWrite = async (): Promise<void> => {
  const { publicStoreId } = requireStoreIds();
  const signed = await issueSignedToken({
    storeId: publicStoreId,
    pathname: `${env.storage.namespace}/public/android-releases/preflight-${randomUUID()}.apk`,
    operations: ["put"],
    validUntil: Date.now() + 5 * 60_000,
    allowedContentTypes: [APK_CONTENT_TYPE],
    maximumSizeInBytes: SN2_V5_SIZE,
  });
  // Do not return, log, or persist token material. This comparison proves the
  // Vercel runtime authorized the configured public-store target.
  if (normalizedStoreId(parseStoreIdFromDelegationToken(signed.delegationToken)) !== normalizedStoreId(publicStoreId)) {
    throw new AppError(503, "Vercel Blob delegated authorization selected an unexpected store");
  }
};

export const verifyPrivateSn2V5Source = async (release: AndroidReleaseMigrationSource): Promise<{ etag: string }> => {
  assertSn2V5MigrationSource(release);
  const { privateStoreId } = requireStoreIds();
  const source = await get(release.file_url, { access: "private", storeId: privateStoreId, useCache: false });
  if (!source || source.statusCode !== 200 || !source.stream || !source.blob.contentType || source.blob.size === null) {
    throw new AppError(503, "The approved private APK source could not be read");
  }
  assertExpectedApk(source.blob, await digest(source.stream));
  return { etag: source.blob.etag };
};

const verifyAnonymousPublicDownload = async (url: string): Promise<void> => {
  const response = await fetch(publicBlobDownloadUrl(url), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new AppError(503, "The public APK download did not return a successful response");
  if (normalizedContentType(response.headers.get("content-type")) !== APK_CONTENT_TYPE) {
    fail("The public APK download has an unexpected content type");
  }
  if (response.headers.get("content-disposition")?.toLowerCase().includes("attachment") !== true) {
    fail("The public APK download did not return an attachment response");
  }
  if (Number(response.headers.get("content-length")) !== SN2_V5_SIZE) {
    fail("The public APK download has an unexpected content length");
  }
  const downloaded = await digest(response.body);
  assertExpectedApk({ contentType: response.headers.get("content-type") ?? "", size: downloaded.size }, downloaded);
};

/**
 * Reads the private object twice: first to verify the source checksum, then
 * as a streaming public upload. The source Blob is immutable and is never
 * renamed, overwritten, or deleted.
 */
export const copyVerifiedSn2V5ToPublicBlob = async (release: AndroidReleaseMigrationSource): Promise<PublicAndroidReleaseAsset> => {
  const verifiedSource = await verifyPrivateSn2V5Source(release);
  const { privateStoreId, publicStoreId } = requireStoreIds();
  const source = await get(release.file_url, { access: "private", storeId: privateStoreId, useCache: false });
  if (!source || source.statusCode !== 200 || !source.stream || !source.blob.contentType || source.blob.size === null) {
    throw new AppError(503, "The verified private APK source could not be reopened for streaming");
  }
  if (
    source.blob.etag !== verifiedSource.etag ||
    normalizedContentType(source.blob.contentType) !== APK_CONTENT_TYPE ||
    source.blob.size !== SN2_V5_SIZE
  ) {
    fail("The private APK metadata changed before the public copy began");
  }
  const pathname = `${env.storage.namespace}/public/android-releases/${release.id}-SN2-v5.apk`;
  const uploaded = await put(pathname, source.stream, {
    access: "public",
    storeId: publicStoreId,
    contentType: APK_CONTENT_TYPE,
    allowOverwrite: false,
    addRandomSuffix: false,
    multipart: true,
    maximumSizeInBytes: SN2_V5_SIZE,
  });
  if (!isManagedPublicBlobUrl(uploaded.url)) fail("The copied APK was not placed in a public Blob store");
  await verifyAnonymousPublicDownload(uploaded.url);
  return {
    url: uploaded.url,
    publicId: `blob-public://${uploaded.url}`,
    fileSize: SN2_V5_SIZE,
    sha256: SN2_V5_SHA256,
  };
};
