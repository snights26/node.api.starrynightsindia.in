import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { isManagedPublicBlobUrl, storageService } from "./blob-storage.js";
import { AppError, badRequest } from "../lib/api.js";

let configured = false;
const configure = (): void => {
  if (!env.cloudinary.enabled || !env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new AppError(503, "Cloudinary uploads are not configured for this runtime.");
  }
  if (!configured) {
    cloudinary.config({ cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret, secure: true });
    configured = true;
  }
};

const accepted = new Set(["image/jpeg", "image/png", "image/webp"]);
const androidReleaseTypes = new Set(["application/vnd.android.package-archive", "application/octet-stream"]);

const safeSegment = (value: string): string => value.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "");
const androidReleaseFolder = (): string => [env.cloudinary.folderPrefix, "android-releases"]
  .map((value) => safeSegment(value ?? ""))
  .filter(Boolean)
  .join("/") || "android-releases";

export const isAndroidApkFileName = (fileName: string): boolean => /\.apk$/i.test(fileName.trim());

type AndroidReleaseAsset = {
  publicId: string;
  url: string;
  fileSize: number;
};

/**
 * Creates a short-lived, signed Cloudinary form payload for an APK. The file
 * itself never passes through a Vercel Function, which keeps release uploads
 * outside the platform request-body limit and keeps the Cloudinary secret on
 * the server.
 */
export const createAndroidReleaseUploadAuthorization = (input: {
  fileName: string;
  contentType: string;
  fileSize: number;
  actorId: string;
}) => {
  if (!isAndroidApkFileName(input.fileName)) throw badRequest("Only Android APK files are supported");
  if (!androidReleaseTypes.has(input.contentType)) throw badRequest("The APK content type is not supported");
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > env.androidReleaseMaxFileSize) {
    throw badRequest("The APK is empty or exceeds the release upload limit");
  }

  return storageService.createUploadAuthorization({
    purpose: "android-release",
    access: "public",
    actorId: input.actorId,
    filename: input.fileName,
    contentType: input.contentType,
    size: input.fileSize,
    allowedContentTypes: [...androidReleaseTypes],
    maximumSizeInBytes: env.androidReleaseMaxFileSize,
  });
};

export const finalizeAndroidReleaseAsset = async (
  intent: string,
  uploadedUrl: string,
  actorId: string,
  fileName: string,
): Promise<AndroidReleaseAsset> => {
  if (!isAndroidApkFileName(fileName)) throw badRequest("Only Android APK files are supported");

  const asset = await storageService.finalizeUpload(intent, uploadedUrl, actorId, "android-release");

  if (
    !isManagedPublicBlobUrl(asset.url) ||
    !androidReleaseTypes.has(asset.contentType) ||
    !asset.pathname.toLowerCase().endsWith(".apk") ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > env.androidReleaseMaxFileSize
  ) {
    throw badRequest("The uploaded file is not a valid Android APK release asset");
  }

  return {
    publicId: `blob-public://${asset.url}`,
    url: asset.url,
    fileSize: asset.size,
  };
};

/** Delete new Blob assets and retain cleanup support for legacy Cloudinary releases. */
export const deleteAndroidReleaseAsset = async (publicId: string | null | undefined): Promise<void> => {
  if (!publicId) return;

  if (publicId.startsWith("blob-public://")) {
    const url = publicId.slice("blob-public://".length);
    if (!isManagedPublicBlobUrl(url)) throw new AppError(400, "Invalid Android release storage reference");
    await storageService.deleteObject(url, "public");
    return;
  }

  configure();
  const expectedFolder = androidReleaseFolder();
  if (!publicId.startsWith(`${expectedFolder}/`)) throw new AppError(400, "Invalid Android release storage reference");
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "raw", invalidate: true });
  if (result.result !== "ok" && result.result !== "not found") throw new AppError(503, "Android release storage cleanup is unavailable");
};
export const uploadFile = async (file: Express.Multer.File, folder: string, imageOnly = false): Promise<{ url: string; publicId: string }> => {
  if (!file.buffer.length || file.size > env.uploadMaxFileSize) throw badRequest("The upload is empty or exceeds the size limit");
  configure();
  const safeFolder = [env.cloudinary.folderPrefix, folder].map((value) => safeSegment(value ?? "")).filter(Boolean).join("/") || "uploads";
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: safeFolder, public_id: randomUUID(), resource_type: imageOnly ? "image" : "auto", overwrite: false }, (error, result) => {
      if (error || !result?.secure_url || !result.public_id) {
        reject(new AppError(503, "Image storage is currently unavailable"));
        return;
      }
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.end(file.buffer);
  });
};

export const uploadImage = async (file: Express.Multer.File, folder: string): Promise<{ url: string; publicId: string }> => {
  if (!accepted.has(file.mimetype)) throw badRequest("Only JPEG, PNG, and WebP images are supported");
  return uploadFile(file, folder, true);
};

export const deleteImage = async (publicId: string | null | undefined): Promise<void> => {
  if (!publicId) return;
  configure();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
};

/**
 * New uploads retain their Cloudinary URL for legacy gallery compatibility.
 * Derive an asset ID only when the URL belongs to this runtime's configured
 * folder prefix, so local legacy-upload and unrelated Cloudinary URLs are
 * never deleted by a gallery cleanup.
 */
export const cloudinaryPublicIdFromUrl = (value: string | null | undefined): string | undefined => {
  if (!value || !env.cloudinary.folderPrefix) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname !== `res.cloudinary.com`) return undefined;
    const upload = "/upload/";
    const marker = url.pathname.indexOf(upload);
    if (marker < 0) return undefined;
    const segments = url.pathname.slice(marker + upload.length).split("/").filter(Boolean);
    const version = segments.findIndex((segment) => /^v\d+$/.test(segment));
    const path = segments.slice(version >= 0 ? version + 1 : 0).join("/").replace(/\.[a-zA-Z0-9]+$/, "");
    const prefix = env.cloudinary.folderPrefix.replace(/^\/+|\/+$/g, "");
    return path.startsWith(`${prefix}/`) ? path : undefined;
  } catch {
    return undefined;
  }
};
