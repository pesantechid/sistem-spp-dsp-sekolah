import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { hashPassword } from "../lib/auth.ts";
import { setFlash } from "../lib/flash.ts";
import { requireRole } from "../middleware/auth.ts";

const router = Router();

router.use(requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { nama: "asc" } });
  res.render("users/index", { title: "Kelola User", users });
});

router.get("/new", (req, res) => {
  res.render("users/form", { title: "Tambah User", user: null });
});

router.post("/", async (req, res) => {
  const { nama, username, password, role } = req.body as {
    nama?: string;
    username?: string;
    password?: string;
    role?: string;
  };

  if (!nama || !username || !password || !role) {
    setFlash(req, "error", "Semua field wajib diisi.");
    return res.redirect("/users/new");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    setFlash(req, "error", "Username sudah dipakai, pilih username lain.");
    return res.redirect("/users/new");
  }

  await prisma.user.create({
    data: {
      nama,
      username,
      passwordHash: await hashPassword(password),
      role: role as "ADMIN" | "STAFF" | "VIEWER",
    },
  });

  setFlash(req, "success", `User ${nama} berhasil ditambahkan.`);
  res.redirect("/users");
});

router.get("/:id/edit", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: Number(req.params.id) } });
  if (!user) {
    setFlash(req, "error", "User tidak ditemukan.");
    return res.redirect("/users");
  }
  res.render("users/form", { title: "Edit User", user });
});

router.post("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nama, username, password, role, aktif } = req.body as {
    nama?: string;
    username?: string;
    password?: string;
    role?: string;
    aktif?: string;
  };

  if (!nama || !username || !role) {
    setFlash(req, "error", "Nama, username, dan role wajib diisi.");
    return res.redirect(`/users/${id}/edit`);
  }

  const duplicate = await prisma.user.findFirst({ where: { username, NOT: { id } } });
  if (duplicate) {
    setFlash(req, "error", "Username sudah dipakai user lain.");
    return res.redirect(`/users/${id}/edit`);
  }

  await prisma.user.update({
    where: { id },
    data: {
      nama,
      username,
      role: role as "ADMIN" | "STAFF" | "VIEWER",
      aktif: aktif === "on",
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  setFlash(req, "success", `User ${nama} berhasil diperbarui.`);
  res.redirect("/users");
});

export default router;
