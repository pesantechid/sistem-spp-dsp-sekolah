import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    flash?: { type: "success" | "error"; message: string };
  }
}

export function flashMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.flash = req.session.flash ?? null;
  req.session.flash = undefined;
  next();
}

export function setFlash(req: Request, type: "success" | "error", message: string) {
  req.session.flash = { type, message };
}
