import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

export class AppError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError => new AppError(400, message, details);
export const unauthorized = (message = "Unauthorized"): AppError => new AppError(401, message);
export const forbidden = (message = "Forbidden"): AppError => new AppError(403, message);
export const notFound = (message = "Not found"): AppError => new AppError(404, message);
export const conflict = (message: string): AppError => new AppError(409, message);

export const ok = <T>(data: T, message = "OK") => ({ success: true, message, data });
export const created = <T>(data: T) => ({ success: true, message: "Created", data });
export const message = (text: string) => ({ success: true, message: text, data: null });

export const asyncRoute = <TRequest extends Request = Request>(
  handler: (request: TRequest, response: Response, next: NextFunction) => Promise<unknown>,
) => (request: TRequest, response: Response, next: NextFunction): void => {
  void handler(request, response, next).catch(next);
};

export const validateBody = <T extends z.ZodType>(schema: T) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(badRequest("Validation failed", result.error.flatten()));
      return;
    }
    request.body = result.data;
    next();
  };

export const parseUuidOrText = (value: string): string => value.trim();
