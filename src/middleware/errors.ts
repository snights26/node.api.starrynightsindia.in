import type { ErrorRequestHandler, RequestHandler } from "express";
import type { DatabaseError } from "pg";
import multer from "multer";
import { AppError } from "../lib/api.js";
import { isProduction } from "../config/env.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({ success: false, message: `No endpoint for ${request.method} ${request.path}`, data: null });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  request.log?.error({ err: error, status: error instanceof AppError ? error.status : 500 }, "request failed");
  if (error instanceof AppError) {
    response.status(error.status).json({ success: false, message: error.message, data: error.details ?? null });
    return;
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "The upload exceeds the safe Function request size. Use the direct upload authorization flow for larger files." : "Invalid upload request";
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message, data: null });
    return;
  }
  if ((error as { status?: number; type?: string }).status === 413 || (error as { type?: string }).type === "entity.too.large") {
    response.status(413).json({ success: false, message: "The request is too large. Upload large files directly to secure object storage.", data: null });
    return;
  }
  const databaseError = error as Partial<DatabaseError>;
  if (databaseError.code === "23505") {
    response.status(409).json({ success: false, message: "A record with this value already exists", data: null });
    return;
  }
  if (databaseError.code === "23503") {
    response.status(409).json({ success: false, message: "This record is still in use", data: null });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).json({
    success: false,
    message: isProduction ? "Internal server error" : message,
    data: null,
  });
};
