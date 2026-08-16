import type { Request, Response, NextFunction } from "express";

type Role = "ADMIN" | "STAFF" | "VIEWER";

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.locals.currentUser = {
    id: req.session.userId,
    nama: req.session.nama,
    role: req.session.role,
  };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.redirect("/login");
    }
    res.locals.currentUser = {
      id: req.session.userId,
      nama: req.session.nama,
      role: req.session.role,
    };
    if (!req.session.role || !roles.includes(req.session.role)) {
      return res.status(403).render("error", {
        title: "Akses Ditolak",
        message: "Anda tidak punya akses ke halaman ini.",
      });
    }
    next();
  };
}
