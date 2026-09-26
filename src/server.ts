import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./db/pool.js";

if (env.googleAuthEnabled && env.googleAllowedClientIds.length === 0) {
  throw new Error("GOOGLE_AUTH_ENABLED requires GOOGLE_ALLOWED_CLIENT_IDS or GOOGLE_CLIENT_ID");
}

const server = app.listen(env.port, () => {
  console.info(`Starry Nights Node API listening on port ${env.port}`);
});

const shutdown = (signal: string): void => {
  console.info(`Received ${signal}; shutting down.`);
  server.close(() => {
    void closeDatabase().finally(() => process.exit(0));
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
