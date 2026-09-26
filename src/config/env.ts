import "dotenv/config";
import { parseGoogleAllowedClientIds } from "../lib/google-audience.js";

const asBoolean = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : value.trim().toLowerCase() === "true";

const asInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const smtpAccount = (prefix: string) => ({
  host: process.env[`${prefix}_HOST`]?.trim() || undefined,
  port: asInteger(process.env[`${prefix}_PORT`], 587),
  username: process.env[`${prefix}_USERNAME`]?.trim() || undefined,
  password: process.env[`${prefix}_PASSWORD`] || undefined,
  from: process.env[`${prefix}_FROM`]?.trim() || undefined,
  secure: asBoolean(process.env[`${prefix}_SECURE`]),
  starttls: asBoolean(process.env[`${prefix}_STARTTLS`], true),
});

const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Google client IDs are public OAuth audiences, not secrets. The legacy
// single-client setting remains part of the allowlist during cutover.
const googleAllowedClientIds = parseGoogleAllowedClientIds(process.env.GOOGLE_ALLOWED_CLIENT_IDS, process.env.GOOGLE_CLIENT_ID);

const deploymentEnvironment = (process.env.DEPLOYMENT_ENVIRONMENT ?? "local").trim().toLowerCase();
const databaseEnvironment = process.env.DATABASE_ENVIRONMENT?.trim().toLowerCase() || undefined;
const storageNamespace = process.env.STORAGE_NAMESPACE?.trim().replace(/^\/+|\/+$/g, "") || deploymentEnvironment;
// Vercel Blob uses an OIDC token supplied to Functions at runtime. Store IDs
// are intentionally separate from the automatic token, so a staging Function
// cannot silently select a production store. `BLOB_STORE_ID` is the official
// single-store integration name and is treated as the private-store fallback.
const privateBlobStoreId = process.env.BLOB_PRIVATE_STORE_ID?.trim() || process.env.BLOB_STORE_ID?.trim() || undefined;
const publicBlobStoreId = process.env.BLOB_PUBLIC_STORE_ID?.trim() || undefined;
const privateBlobReadWriteToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || undefined;
const publicBlobReadWriteToken = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || undefined;
const csv = (value: string | undefined): string[] => (value ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  deploymentEnvironment,
  databaseEnvironment,
  port: asInteger(process.env.PORT, 8080),
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  databaseDirectUrl: process.env.DATABASE_DIRECT_URL?.trim() || undefined,
  jwtSecret: process.env.JWT_SECRET?.trim() || undefined,
  jwtAccessMinutes: asInteger(process.env.JWT_ACCESS_TOKEN_MINUTES, 15),
  jwtAdminAccessMinutes: asInteger(process.env.JWT_ADMIN_ACCESS_TOKEN_MINUTES, 60),
  jwtRefreshDays: asInteger(process.env.JWT_REFRESH_TOKEN_DAYS, 7),
  publicPasswordLoginEnabled: asBoolean(process.env.PUBLIC_PASSWORD_LOGIN_ENABLED),
  publicRegistrationEnabled: asBoolean(process.env.PUBLIC_REGISTRATION_ENABLED),
  googleAuthEnabled: asBoolean(process.env.GOOGLE_AUTH_ENABLED),
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
  googleAllowedClientIds,
  corsAllowedOrigins: origins,
  publicAppUrl: process.env.PUBLIC_APP_URL?.trim() || undefined,
  adminAppUrl: process.env.ADMIN_APP_URL?.trim() || undefined,
  cloudinary: {
    enabled: asBoolean(process.env.CLOUDINARY_ENABLED),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || undefined,
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || undefined,
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || undefined,
    folderPrefix: process.env.CLOUDINARY_FOLDER_PREFIX?.trim() || undefined,
  },
  smtp: {
    enabled: asBoolean(process.env.SMTP_ENABLED),
    ...smtpAccount("SMTP"),
    to: process.env.SMTP_TO?.trim() || undefined,
    supportTo: process.env.SMTP_SUPPORT_TO?.trim() || undefined,
    hrTo: process.env.SMTP_HR_TO?.trim() || undefined,
    salesTo: process.env.SMTP_SALES_TO?.trim() || undefined,
  },
  smtpPayment: smtpAccount("SMTP_PAYMENT"),
  smtpQuotation: smtpAccount("SMTP_QUOTATION"),
  razorpay: {
    enabled: asBoolean(process.env.RAZORPAY_ENABLED),
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || undefined,
    keySecret: process.env.RAZORPAY_KEY_SECRET || undefined,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || undefined,
    paymentLinkExpiryHours: asInteger(process.env.RAZORPAY_PAYMENT_LINK_EXPIRY_HOURS, 48),
    mode: (process.env.RAZORPAY_MODE?.trim().toLowerCase() || "disabled") as "disabled" | "test" | "live",
  },
  uploadMaxFileSize: asInteger(process.env.UPLOAD_MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024),
  // A Function receives legacy multipart requests only below Vercel's 4.5 MB
  // body ceiling. Product limits remain higher through direct Blob uploads.
  functionUploadMaxFileSize: Math.min(asInteger(process.env.FUNCTION_UPLOAD_MAX_SIZE_BYTES, 4 * 1024 * 1024), 4 * 1024 * 1024),
  privateAttachmentMaxFileSize: asInteger(process.env.PRIVATE_ATTACHMENT_MAX_SIZE_BYTES, 10 * 1024 * 1024),
  storage: {
    // A configured store ID activates the Vercel OIDC path. A read/write token
    // remains a local-only fallback for the migration utility; it is never
    // needed in a Vercel Function and must not be exposed to a client.
    enabled: Boolean(privateBlobStoreId || publicBlobStoreId || privateBlobReadWriteToken || publicBlobReadWriteToken),
    namespace: storageNamespace,
    privateStoreId: privateBlobStoreId,
    publicStoreId: publicBlobStoreId,
    // Local migration/testing may use scoped Vercel Blob tokens. Production
    // Vercel Functions use short-lived platform OIDC credentials instead.
    privateReadWriteToken: privateBlobReadWriteToken,
    publicReadWriteToken: publicBlobReadWriteToken,
    uploadIntentMinutes: asInteger(process.env.BLOB_UPLOAD_INTENT_MINUTES, 15),
    // Public cache entries live for five minutes, so signed reads outlive one
    // cache window without becoming long-lived credentials.
    downloadUrlMinutes: asInteger(process.env.BLOB_DOWNLOAD_URL_MINUTES, 15),
  },
  mail: {
    deliveryMode: (process.env.MAIL_DELIVERY_MODE?.trim().toLowerCase() || "live") as "live" | "safe" | "disabled",
    safeRecipients: csv(process.env.SMTP_SAFE_RECIPIENTS),
  },
  cacheEnabled: asBoolean(process.env.CACHE_ENABLED, true),
  cacheMaxEntries: asInteger(process.env.CACHE_MAX_ENTRIES, 1000),
  publicBrowserCacheEpoch: process.env.PUBLIC_BROWSER_CACHE_EPOCH?.trim() || undefined,
  semanticSearchEnabled: asBoolean(process.env.SEMANTIC_SEARCH_ENABLED),
} as const;

export const isProduction = env.nodeEnv === "production";

/**
 * `NODE_ENV=production` is shared by Vercel Preview and Production. Explicit
 * deployment/database labels prevent a Preview Function from silently using a
 * production connection string when a staging variable is absent.
 */
export const assertRuntimeConfiguration = (): void => {
  if (!["local", "staging", "production"].includes(env.deploymentEnvironment)) {
    throw new Error("DEPLOYMENT_ENVIRONMENT must be local, staging, or production");
  }
  if (env.deploymentEnvironment === "local") return;
  if (!env.databaseUrl || env.databaseEnvironment !== env.deploymentEnvironment) {
    throw new Error("DATABASE_URL and matching DATABASE_ENVIRONMENT are required outside local development");
  }
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured outside local development");
  }
  if (!env.storage.namespace.startsWith(`${env.deploymentEnvironment}/`)) {
    throw new Error("STORAGE_NAMESPACE must begin with the explicit deployment environment");
  }
  if (env.deploymentEnvironment === "staging") {
    if (env.razorpay.enabled && env.razorpay.mode !== "test") throw new Error("Staging may use Razorpay test mode only");
    if (!(["safe", "disabled"] as string[]).includes(env.mail.deliveryMode)) throw new Error("Staging mail must use safe or disabled delivery mode");
  }
  if (env.deploymentEnvironment === "production" && env.razorpay.enabled && env.razorpay.mode !== "live") {
    throw new Error("Production Razorpay must declare RAZORPAY_MODE=live when enabled");
  }
};
