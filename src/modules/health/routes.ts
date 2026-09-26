import { Router } from "express";
import { env } from "../../config/env.js";
import { checkDatabase } from "../../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_request, response) => {
  const database = await checkDatabase();
  response.status(database || !env.databaseUrl ? 200 : 503).json({
    success: database || !env.databaseUrl,
    message: database || !env.databaseUrl ? "OK" : "Database unavailable",
    data: {
      status: database || !env.databaseUrl ? "UP" : "DOWN",
      database: env.databaseUrl ? (database ? "UP" : "DOWN") : "NOT_CONFIGURED",
      // These are explicit deployment labels, not connection details. They make
      // staging isolation observable without exposing a database host, secret,
      // or other sensitive configuration.
      environment: {
        deployment: env.deploymentEnvironment,
        database: env.databaseEnvironment ?? "NOT_CONFIGURED",
      },
      integrations: {
        google: env.googleAuthEnabled && env.googleAllowedClientIds.length > 0,
        cloudinary: env.cloudinary.enabled,
        smtp: env.smtp.enabled,
        razorpay: env.razorpay.enabled,
        durableStorage: env.storage.enabled,
      },
    },
  });
});
