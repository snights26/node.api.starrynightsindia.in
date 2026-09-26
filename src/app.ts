import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { assertRuntimeConfiguration, env, isProduction } from "./config/env.js";
import { openapi } from "./docs/openapi.js";
import { optionalAuthenticate, restrictedAdminWrite } from "./lib/auth.js";
import { AppError } from "./lib/api.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { authRouter } from "./modules/auth/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { adminsRouter } from "./modules/admins/routes.js";
import { catalogRouter } from "./modules/catalog/routes.js";
import { cacheRouter } from "./modules/cache/routes.js";
import { chatbotRouter } from "./modules/chatbot/routes.js";
import { contentRouter } from "./modules/content/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { mediaRouter } from "./modules/media/routes.js";
import { operationsRouter } from "./modules/operations/routes.js";
import { occasionRouter } from "./modules/occasion/routes.js";
import { supportRouter } from "./modules/support/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import { storageRouter } from "./modules/storage/routes.js";
import { legacyUploadRouter } from "./modules/storage/legacy-routes.js";

assertRuntimeConfiguration();
export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(pinoHttp({ redact: ["req.headers.authorization", "req.body.password", "req.body.idToken", "req.body.refreshToken"] }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsAllowedOrigins.includes(origin)) return callback(null, true);
    return callback(new AppError(403, "CORS origin is not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "If-None-Match", "If-Match"],
}));
app.use(express.json({ limit: "2mb", verify: (request, _response, buffer) => { (request as express.Request & { rawBody?: Buffer }).rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: isProduction ? 30 : 300, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/api/auth", authLimiter);
app.use("/api", optionalAuthenticate);
app.use("/api", restrictedAdminWrite);
app.use("/api/uploads", legacyUploadRouter);
app.use("/api", storageRouter);
app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", analyticsRouter);
app.use("/api", adminsRouter);
app.use("/api", catalogRouter);
app.use("/api", cacheRouter);
app.use("/api", chatbotRouter);
app.use("/api", contentRouter);
app.use("/api", operationsRouter);
app.use("/api", occasionRouter);
app.use("/api", mediaRouter);
app.use("/api", supportRouter);
app.use("/api", usersRouter);
app.use("/api/swagger-ui.html", swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));
app.use("/api/swagger", swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));
app.use("/api", notFoundHandler);
app.use(errorHandler);

// Vercel recognizes a default-exported Express application in src/app.ts.
// src/server.ts retains the local listener used by npm run dev/start.
export default app;
