import swaggerJSDoc from "swagger-jsdoc";

export const openapi = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Starry Nights API",
      version: "1.0.0",
      description: "Node.js compatibility migration for the Starry Nights API.",
    },
    servers: [{ url: "/api" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        ApiResponse: {
          type: "object",
          required: ["success", "message", "data"],
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            data: {},
          },
        },
      },
    },
    paths: {
      "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" }, "503": { description: "Database unavailable" } } } },
      "/auth/google": { post: { summary: "Sign in a customer with a verified Google identity token", responses: { "200": { description: "Signed in" } } } },
      "/auth/admin/login": { post: { summary: "Sign in an administrator", responses: { "200": { description: "Signed in" }, "401": { description: "Invalid credentials" } } } },
      "/auth/refresh": { post: { summary: "Refresh an existing browser session", responses: { "200": { description: "Refreshed" }, "401": { description: "Session invalid" } } } },
    },
  },
  apis: [],
});
