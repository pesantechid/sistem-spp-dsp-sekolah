import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { verifyPassword } from "../lib/auth.ts";
import { setFlash } from "../lib/flash.ts";

const router = Router();

router.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("login", { title: "Masuk", fullBleed: true });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    setFlash(req, "error", "Username dan password wajib diisi.");
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.aktif) {
    setFlash(req, "error", "Username atau password salah.");
    return res.redirect("/login");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    setFlash(req, "error", "Username atau password salah.");
    return res.redirect("/login");
  }

  req.session.regenerate((err) => {
    if (err) {
      setFlash(req, "error", "Terjadi kesalahan, coba lagi.");
      return res.redirect("/login");
    }
    req.session.userId = user.id;
    req.session.nama = user.nama;
    req.session.role = user.role;
    res.redirect("/");
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
