import type { Role } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      auth?: {
        id: string;
        email: string;
        userId: string;
        role: Role;
      };
    }
  }
}

export {};
