import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    nama?: string;
    role?: "ADMIN" | "STAFF" | "VIEWER";
  }
}
