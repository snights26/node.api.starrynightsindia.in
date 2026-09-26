import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import {
  del,
  head,
  issueSignedToken,
  presignUrl,
  put,
  type HeadBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { env } from "../config/env.js";
import { AppError, badRequest, notFound } from "../lib/api.js";

export const VERCEL_FUNCTION_BINARY_LIMIT = 4 * 1024 * 1024;
export const PRIVATE_STORAGE_REFERENCE_PREFIX = "blob-private://";

export type StorageAccess = "private" | "public";
export type StoragePurpose = "travel-photo" | "career-resume" | "quotation" | "notification-document" | "public-media";
type BlobCommandOptions = { token?: string; storeId?: string };

export type StorageObject = {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
  etag?: string;
  reference: string;
};

type UploadIntentClaims = jwt.JwtPayload & {
  typ: "starry-nights-storage-upload";
  jti: string;
  purpose: StoragePurpose;
  access: StorageAccess;
  pathname: string;
  contentType: string;
  maxSize: number;
  actorId?: string;
};

export type UploadAuthorization = {
  /** Opaque, short-lived API authorization; never a Vercel credential. */
  intent: string;
  pathname: string;
  access: StorageAccess;
  maximumSizeInBytes: number;
  allowedContentTypes: readonly string[];
  multipartRecommended: boolean;
};

export type CreateUploadAuthorizationInput = {
  purpose: StoragePurpose;
  access: StorageAccess;
  actorId?: string;
  filename: string;
  contentType: string;
  size: number;
  allowedContentTypes: readonly string[];
  maximumSizeInBytes: number;
};

type BlobDriver = {
  head(identifier: string, options: BlobCommandOptions): Promise<HeadBlobResult>;
  put(pathname: string, body: Buffer, options: Parameters<typeof put>[2]): Promise<PutBlobResult>;
  del(identifier: string, options: BlobCommandOptions): Promise<void>;
  issueSignedToken(options: Parameters<typeof issueSignedToken>[0]): ReturnType<typeof issueSignedToken>;
  presignUrl: typeof presignUrl;
};

const blobDriver: BlobDriver = { head, put, del, issueSignedToken, presignUrl };
const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const resumeTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
const pdfTypes = ["application/pdf"] as const;

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const stringClaim = (value: unknown): string | undefined => typeof value === "string" && value.length ? value : undefined;

const safeFilename = (filename: string): string => {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "file";
  const normalized = base.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "file";
};

const extension = (filename: string, contentType: string): string => {
  const fromName = safeFilename(filename).match(/(\.[a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return contentType === "image/jpeg" ? ".jpg" : contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : contentType === "application/pdf" ? ".pdf" : ".bin";
};

const asPrivateReference = (pathname: string): string => `${PRIVATE_STORAGE_REFERENCE_PREFIX}${encodeURIComponent(pathname)}`;

export const isPrivateStorageReference = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.startsWith(PRIVATE_STORAGE_REFERENCE_PREFIX);

export const isManagedPublicBlobUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

export const privatePathnameFromReference = (reference: string): string => {
  if (!isPrivateStorageReference(reference)) throw badRequest("Invalid private storage reference");
  try {
    const pathname = decodeURIComponent(reference.slice(PRIVATE_STORAGE_REFERENCE_PREFIX.length));
    if (!pathname || pathname.includes("\\") || pathname.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("invalid pathname");
    }
    return pathname;
  } catch {
    throw badRequest("Invalid private storage reference");
  }
};

/**
 * Maps a historical `/api/uploads/...` reference to a predictable object key.
 * It intentionally accepts no filesystem path and rejects traversal sequences.
 */
export const resolveLegacyUploadPath = (legacyUrl: string, namespace = env.storage.namespace): string => {
  const prefix = "/api/uploads/";
  if (!legacyUrl.startsWith(prefix)) throw badRequest("Invalid legacy upload path");
  const rawSegments = legacyUrl.slice(prefix.length).split("/");
  if (!rawSegments.length || rawSegments.some((segment) => !segment)) throw badRequest("Invalid legacy upload path");
  const segments = rawSegments.map((segment) => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { throw badRequest("Invalid legacy upload path"); }
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) {
      throw badRequest("Invalid legacy upload path");
    }
    return encodeURIComponent(decoded);
  });
  return `${namespace}/legacy/${segments.join("/")}`;
};

export class UploadIntentCodec {
  public constructor(private readonly secret: string) {}

  public issue(claims: Omit<UploadIntentClaims, keyof jwt.JwtPayload | "typ" | "jti">, expiresInSeconds: number): string {
    return jwt.sign({ ...claims, typ: "starry-nights-storage-upload", jti: randomUUID() }, this.secret, {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
      issuer: "starry-nights-api",
      audience: "starry-nights-blob-upload",
    });
  }

  public verify(token: string): UploadIntentClaims {
    const decoded = jwt.verify(token, this.secret, {
      algorithms: ["HS256"], issuer: "starry-nights-api", audience: "starry-nights-blob-upload",
    }) as UploadIntentClaims;
    if (
      decoded.typ !== "starry-nights-storage-upload" || !decoded.jti || !decoded.pathname ||
      !decoded.purpose || !decoded.access || !decoded.contentType || !Number.isSafeInteger(decoded.maxSize) || decoded.maxSize < 1
    ) throw badRequest("Invalid upload authorization");
    return decoded;
  }
}

const missingStorage = (): AppError => new AppError(503, "Durable object storage is not configured for this runtime.");

export class StorageService {
  private readonly codec: UploadIntentCodec | undefined;

  public constructor(
    private readonly driver: BlobDriver = blobDriver,
    signingSecret = env.jwtSecret,
  ) {
    this.codec = signingSecret && signingSecret.length >= 32 ? new UploadIntentCodec(signingSecret) : undefined;
  }

  public isConfigured(access?: StorageAccess): boolean {
    if (!env.storage.enabled) return false;
    if (!access) return this.isConfigured("private") || this.isConfigured("public");
    const configured = access === "private"
      ? Boolean(env.storage.privateStoreId || env.storage.privateReadWriteToken)
      : Boolean(env.storage.publicStoreId || env.storage.publicReadWriteToken);
    return configured;
  }

  public createUploadAuthorization(input: CreateUploadAuthorizationInput): UploadAuthorization {
    if (!this.codec || !this.isConfigured(input.access)) throw missingStorage();
    if (!input.allowedContentTypes.includes(input.contentType)) throw badRequest("This file type is not allowed");
    if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > input.maximumSizeInBytes) throw badRequest("The declared file size is invalid or exceeds the upload limit");
    const pathname = this.pathnameFor(input);
    return {
      intent: this.codec.issue({
        purpose: input.purpose,
        access: input.access,
        pathname,
        contentType: input.contentType,
        maxSize: input.maximumSizeInBytes,
        actorId: input.actorId,
      }, env.storage.uploadIntentMinutes * 60),
      pathname,
      access: input.access,
      maximumSizeInBytes: input.maximumSizeInBytes,
      allowedContentTypes: unique(input.allowedContentTypes),
      // A hint for capable web clients. Native clients use a direct Blob PUT;
      // the payload does not traverse a Vercel Function in either case.
      multipartRecommended: input.size > VERCEL_FUNCTION_BINARY_LIMIT,
    };
  }

  /**
   * Handles the small authorization exchange used by direct Blob clients. The
   * file itself goes from the client to Blob and never through Express.
   */
  public async createPresignedUpload(request: IncomingMessage, body: HandleUploadPresignedBody, actorId?: string): Promise<unknown> {
    if (!this.codec) throw missingStorage();
    if (!env.storage.webhookPublicKey) throw missingStorage();
    return handleUploadPresigned({
      request,
      body,
      webhookPublicKey: env.storage.webhookPublicKey,
      getSignedToken: async (pathname, clientPayload) => {
        const claims = this.verifyIntent(clientPayload, actorId);
        if (claims.pathname !== pathname) throw badRequest("Upload pathname does not match its authorization");
        if (!this.isConfigured(claims.access)) throw missingStorage();
        const signedToken = await this.driver.issueSignedToken({
          ...this.commandOptions(claims.access),
          pathname,
          operations: ["put"],
          validUntil: Date.now() + env.storage.uploadIntentMinutes * 60_000,
          allowedContentTypes: [claims.contentType],
          maximumSizeInBytes: claims.maxSize,
        });
        return {
          token: signedToken,
          urlOptions: {
            validUntil: signedToken.validUntil,
            allowedContentTypes: [claims.contentType],
            maximumSizeInBytes: claims.maxSize,
            allowOverwrite: false,
            addRandomSuffix: false,
          },
        };
      },
    });
  }

  public async finalizeUpload(intent: string, objectUrl: string, actorId?: string, expectedPurpose?: StoragePurpose): Promise<StorageObject> {
    const claims = this.verifyIntent(intent, actorId);
    if (expectedPurpose && claims.purpose !== expectedPurpose) throw badRequest("Upload authorization has an invalid purpose");
    if (!this.isConfigured(claims.access)) throw missingStorage();
    const metadata = await this.safeHead(objectUrl, claims.access);
    if (metadata.pathname !== claims.pathname || metadata.contentType !== claims.contentType || metadata.size < 1 || metadata.size > claims.maxSize) {
      throw badRequest("Uploaded object does not match its authorization");
    }
    return this.objectFromMetadata(metadata, claims.access);
  }

  public async putSmallObject(input: { access: StorageAccess; pathname: string; buffer: Buffer; contentType: string }): Promise<StorageObject> {
    if (!this.isConfigured(input.access)) throw missingStorage();
    if (!input.buffer.length || input.buffer.length > VERCEL_FUNCTION_BINARY_LIMIT) {
      throw new AppError(413, "This file must be uploaded directly to secure object storage");
    }
    const result = await this.driver.put(input.pathname, input.buffer, {
      ...this.commandOptions(input.access),
      access: input.access,
      contentType: input.contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return {
      pathname: result.pathname,
      url: result.url,
      contentType: result.contentType,
      size: input.buffer.length,
      etag: result.etag,
      reference: input.access === "private" ? asPrivateReference(result.pathname) : result.url,
    };
  }

  public async importLegacyObject(pathname: string, content: Buffer, contentType: string): Promise<StorageObject> {
    if (!this.isConfigured("private")) throw missingStorage();
    if (!content.length) throw badRequest("The legacy archive file is empty");
    const result = await this.driver.put(pathname, content, {
      ...this.commandOptions("private"),
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return {
      pathname: result.pathname,
      url: result.url,
      contentType: result.contentType,
      size: content.length,
      etag: result.etag,
      reference: asPrivateReference(result.pathname),
    };
  }

  public async objectExists(reference: string, access: StorageAccess): Promise<boolean> {
    try {
      await this.safeHead(this.identifier(reference, access), access);
      return true;
    } catch (error) {
      if (error instanceof AppError && error.status === 404) return false;
      return false;
    }
  }

  public async getObjectMetadata(reference: string, access: StorageAccess): Promise<StorageObject> {
    const metadata = await this.safeHead(this.identifier(reference, access), access);
    return this.objectFromMetadata(metadata, access);
  }

  public async getDownloadAuthorization(reference: string, access: StorageAccess): Promise<string> {
    const identifier = this.identifier(reference, access);
    const metadata = await this.safeHead(identifier, access);
    if (access === "public") return metadata.url;
    const validUntil = Date.now() + env.storage.downloadUrlMinutes * 60_000;
    const signedToken = await this.driver.issueSignedToken({
      ...this.commandOptions("private"), pathname: metadata.pathname, operations: ["get"], validUntil,
    });
    const result = await this.driver.presignUrl(signedToken, {
      operation: "get", pathname: metadata.pathname, validUntil: Math.min(validUntil, signedToken.validUntil), access: "private",
    });
    return result.presignedUrl;
  }

  public async deleteObject(reference: string, access: StorageAccess): Promise<void> {
    if (!this.isConfigured(access)) throw missingStorage();
    await this.driver.del(this.identifier(reference, access), this.commandOptions(access));
  }

  public resolveLegacyPath(legacyUrl: string): string {
    return resolveLegacyUploadPath(legacyUrl, env.storage.namespace);
  }

  public privateReference(pathname: string): string {
    return asPrivateReference(pathname);
  }

  private pathnameFor(input: CreateUploadAuthorizationInput): string {
    const fileExtension = extension(input.filename, input.contentType);
    const root = `${env.storage.namespace}/${input.access}`;
    if (input.purpose === "travel-photo") return `${root}/travel-photos/${input.actorId ?? "anonymous"}/${randomUUID()}${fileExtension}`;
    if (input.purpose === "career-resume") return `${root}/career-resumes/${randomUUID()}${fileExtension}`;
    if (input.purpose === "quotation") return `${root}/quotations/${input.actorId ?? "admin"}/${randomUUID()}.pdf`;
    if (input.purpose === "notification-document") return `${root}/notifications/${input.actorId ?? "admin"}/${randomUUID()}.pdf`;
    return `${root}/media/${randomUUID()}-${safeFilename(input.filename)}`;
  }

  private verifyIntent(token: string | null, actorId?: string): UploadIntentClaims {
    if (!token || !this.codec) throw badRequest("A valid upload authorization is required");
    let claims: UploadIntentClaims;
    try { claims = this.codec.verify(token); } catch (error) {
      if (error instanceof AppError) throw error;
      throw badRequest("Invalid or expired upload authorization");
    }
    if (claims.actorId !== undefined && claims.actorId !== actorId) throw new AppError(403, "Upload authorization belongs to a different user");
    return claims;
  }

  private commandOptions(access: StorageAccess): BlobCommandOptions {
    const storeId = access === "private" ? env.storage.privateStoreId : env.storage.publicStoreId;
    const token = access === "private" ? env.storage.privateReadWriteToken : env.storage.publicReadWriteToken;
    if (!storeId && !token) throw missingStorage();
    return { ...(storeId ? { storeId } : {}), ...(token ? { token } : {}) };
  }

  private identifier(reference: string, access: StorageAccess): string {
    if (access === "private") return privatePathnameFromReference(reference);
    try {
      const url = new URL(reference);
      if (url.protocol !== "https:") throw new Error("not https");
      return url.toString();
    } catch {
      throw badRequest("Invalid public storage reference");
    }
  }

  private async safeHead(identifier: string, access: StorageAccess): Promise<HeadBlobResult> {
    try {
      return await this.driver.head(identifier, this.commandOptions(access));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || (error instanceof Error && /not found/i.test(error.message))) throw notFound("Stored file was not found");
      throw new AppError(503, "Object storage is currently unavailable");
    }
  }

  private objectFromMetadata(metadata: HeadBlobResult, access: StorageAccess): StorageObject {
    return {
      pathname: metadata.pathname,
      url: metadata.url,
      contentType: metadata.contentType,
      size: metadata.size,
      etag: metadata.etag,
      reference: access === "private" ? asPrivateReference(metadata.pathname) : metadata.url,
    };
  }
}

export const storageService = new StorageService();
export const acceptedStorageTypes = { imageTypes, resumeTypes, pdfTypes } as const;
