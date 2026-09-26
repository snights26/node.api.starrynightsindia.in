import { Router } from "express";
import { asyncRoute } from "../../lib/api.js";
import { storageService } from "../../services/blob-storage.js";

/**
 * Vercel Blob's client SDK calls this tiny endpoint to obtain a scope-limited
 * presigned upload URL. It deliberately returns the SDK protocol response,
 * not the usual application envelope; the binary then bypasses the Function.
 */
export const storageRouter = Router();

storageRouter.post("/storage/uploads/presign", asyncRoute(async (request, response) => {
  const intent = request.body && typeof request.body === "object" && "intent" in request.body && typeof request.body.intent === "string"
    ? request.body.intent
    : null;
  const result = await storageService.createPresignedUpload(intent, request.auth?.id);
  response.status(200).json(result);
}));
