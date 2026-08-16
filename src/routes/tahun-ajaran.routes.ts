import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin, requireRole } from "../middleware/auth.ts";

const router = Router();

router.get("/", requireLogin, async (req, res) => {
  const list = await prisma.tahunAjaran.findMany({
    orderBy: { tanggalMulai: "desc" },
    include: { tarif: true },
  });
  res.render("tahun-ajaran/index", { title: "Tahun Ajaran", list });
});

router.get("/new", requireRole("ADMIN"), (req, res) => {
  res.render("tahun-ajaran/form", { title: "Tambah Tahun Ajaran", ta: null, tarif: null });
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const { label, tanggalMulai, tanggalSelesai, sppBulanan } = req.body as {
    label?: string;
    tanggalMulai?: string;
    tanggalSelesai?: string;
    sppBulanan?: string;
  };

  if (!label || !tanggalMulai || !tanggalSelesai || !sppBulanan) {
    setFlash(req, "error", "Semua field wajib diisi.");
    return res.redirect("/tahun-ajaran/new");
  }

  const existing = await prisma.tahunAjaran.findUnique({ where: { label } });
  if (existing) {
    setFlash(req, "error", "Label tahun ajaran sudah ada.");
    return res.redirect("/tahun-ajaran/new");
  }

  const ta = await prisma.tahunAjaran.create({
    data: {
      label,
      tanggalMulai: new Date(tanggalMulai),
      tanggalSelesai: new Date(tanggalSelesai),
    },
  });

  await prisma.tarif.create({
    data: { tahunAjaranId: ta.id, sppBulanan: Number(sppBulanan) },
  });

  setFlash(req, "success", `Tahun ajaran ${label} berhasil dibuat.`);
  res.redirect("/tahun-ajaran");
});

router.get("/:id/edit", requireRole("ADMIN"), async (req, res) => {
  const ta = await prisma.tahunAjaran.findUnique({
    where: { id: Number(req.params.id) },
    include: { tarif: true },
  });
  if (!ta) {
    setFlash(req, "error", "Tahun ajaran tidak ditemukan.");
    return res.redirect("/tahun-ajaran");
  }
  res.render("tahun-ajaran/form", { title: "Edit Tahun Ajaran", ta, tarif: ta.tarif });
});

router.post("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const { label, tanggalMulai, tanggalSelesai, sppBulanan } = req.body as {
    label?: string;
    tanggalMulai?: string;
    tanggalSelesai?: string;
    sppBulanan?: string;
  };

  if (!label || !tanggalMulai || !tanggalSelesai || !sppBulanan) {
    setFlash(req, "error", "Semua field wajib diisi.");
    return res.redirect(`/tahun-ajaran/${id}/edit`);
  }

  await prisma.tahunAjaran.update({
    where: { id },
    data: {
      label,
      tanggalMulai: new Date(tanggalMulai),
      tanggalSelesai: new Date(tanggalSelesai),
    },
  });

  await prisma.tarif.upsert({
    where: { tahunAjaranId: id },
    update: { sppBulanan: Number(sppBulanan) },
    create: { tahunAjaranId: id, sppBulanan: Number(sppBulanan) },
  });

  setFlash(req, "success", "Tahun ajaran berhasil diperbarui.");
  res.redirect("/tahun-ajaran");
});

router.post("/:id/set-aktif", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction([
    prisma.tahunAjaran.updateMany({ data: { isAktif: false }, where: {} }),
    prisma.tahunAjaran.update({ where: { id }, data: { isAktif: true } }),
  ]);
  setFlash(req, "success", "Tahun ajaran aktif berhasil diubah.");
  res.redirect("/tahun-ajaran");
});

export default router;
