import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireRole } from "../middleware/auth.ts";
import { getPengaturan } from "../lib/pengaturan.ts";
import { uploadLogo, uploadTtd, uploadKopSurat } from "../middleware/upload.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

function hapusFileLama(publicPath: string | null | undefined) {
  if (!publicPath) return;
  const filePath = path.join(publicDir, publicPath.replace(/^\//, ""));
  fs.unlink(filePath, () => {
    // best-effort, tidak masalah kalau file sudah tidak ada
  });
}

const router = Router();

router.get("/", requireRole("ADMIN"), async (req, res) => {
  const pengaturan = await getPengaturan();
  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({
    where: { isAktif: true },
    include: { tarif: true },
  });
  res.render("pengaturan/form", { title: "Pengaturan", pengaturan, tahunAjaranAktif });
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const {
    namaYayasan,
    namaSekolah,
    alamatSekolah,
    teleponSekolah,
    kodeSuratPrefix,
    namaPenandatangan,
    jabatanPenandatangan,
    nipPenandatangan,
    kontakBendahara,
    batasTanggalBayar,
    dspStandar,
    sppBulanan,
    namaAplikasi,
    deskripsiAplikasi,
  } = req.body as Record<string, string | undefined>;

  if (!namaSekolah) {
    setFlash(req, "error", "Nama sekolah wajib diisi.");
    return res.redirect("/pengaturan");
  }

  const data = {
    namaYayasan: namaYayasan ? namaYayasan.replace(/\r\n/g, "\n").trim() : null,
    namaSekolah,
    alamatSekolah: alamatSekolah || null,
    teleponSekolah: teleponSekolah || null,
    kodeSuratPrefix: kodeSuratPrefix || null,
    namaPenandatangan: namaPenandatangan || null,
    jabatanPenandatangan: jabatanPenandatangan || "Kepala Sekolah",
    nipPenandatangan: nipPenandatangan || null,
    kontakBendahara: kontakBendahara || null,
    batasTanggalBayar: batasTanggalBayar ? Number(batasTanggalBayar) : 10,
    dspStandar: dspStandar ? Number(dspStandar) : 0,
    namaAplikasi: namaAplikasi?.trim() || null,
    deskripsiAplikasi: deskripsiAplikasi?.trim() || null,
  };

  await prisma.pengaturan.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (tahunAjaranAktif && sppBulanan) {
    await prisma.tarif.upsert({
      where: { tahunAjaranId: tahunAjaranAktif.id },
      update: { sppBulanan: Number(sppBulanan) },
      create: { tahunAjaranId: tahunAjaranAktif.id, sppBulanan: Number(sppBulanan) },
    });
  }

  setFlash(req, "success", "Pengaturan berhasil disimpan.");
  res.redirect("/pengaturan");
});

router.post("/logo", requireRole("ADMIN"), (req, res) => {
  uploadLogo(req, res, async (err) => {
    if (err) {
      setFlash(req, "error", err.message || "Gagal upload logo.");
      return res.redirect("/pengaturan");
    }
    if (!req.file) {
      setFlash(req, "error", "Pilih file logo terlebih dahulu.");
      return res.redirect("/pengaturan");
    }

    const pengaturanLama = await getPengaturan();
    hapusFileLama(pengaturanLama.logoPath);

    const logoPath = `/uploads/${req.file.filename}`;
    await prisma.pengaturan.upsert({
      where: { id: 1 },
      update: { logoPath },
      create: { id: 1, namaSekolah: "", logoPath },
    });

    setFlash(req, "success", "Logo berhasil diunggah.");
    res.redirect("/pengaturan");
  });
});

router.post("/logo/hapus", requireRole("ADMIN"), async (req, res) => {
  const pengaturanLama = await getPengaturan();
  hapusFileLama(pengaturanLama.logoPath);
  await prisma.pengaturan.upsert({
    where: { id: 1 },
    update: { logoPath: null },
    create: { id: 1, namaSekolah: "" },
  });
  setFlash(req, "success", "Logo berhasil dihapus.");
  res.redirect("/pengaturan");
});

router.post("/ttd", requireRole("ADMIN"), (req, res) => {
  uploadTtd(req, res, async (err) => {
    if (err) {
      setFlash(req, "error", err.message || "Gagal upload tanda tangan.");
      return res.redirect("/pengaturan");
    }
    if (!req.file) {
      setFlash(req, "error", "Pilih file tanda tangan terlebih dahulu.");
      return res.redirect("/pengaturan");
    }

    const pengaturanLama = await getPengaturan();
    hapusFileLama(pengaturanLama.ttdPath);

    const ttdPath = `/uploads/${req.file.filename}`;
    await prisma.pengaturan.upsert({
      where: { id: 1 },
      update: { ttdPath },
      create: { id: 1, namaSekolah: "", ttdPath },
    });

    setFlash(req, "success", "Tanda tangan berhasil diunggah.");
    res.redirect("/pengaturan");
  });
});

router.post("/ttd/hapus", requireRole("ADMIN"), async (req, res) => {
  const pengaturanLama = await getPengaturan();
  hapusFileLama(pengaturanLama.ttdPath);
  await prisma.pengaturan.upsert({
    where: { id: 1 },
    update: { ttdPath: null },
    create: { id: 1, namaSekolah: "" },
  });
  setFlash(req, "success", "Tanda tangan berhasil dihapus.");
  res.redirect("/pengaturan");
});

router.post("/kop-surat", requireRole("ADMIN"), (req, res) => {
  uploadKopSurat(req, res, async (err) => {
    if (err) {
      setFlash(req, "error", err.message || "Gagal upload kop surat.");
      return res.redirect("/pengaturan");
    }
    if (!req.file) {
      setFlash(req, "error", "Pilih file kop surat terlebih dahulu.");
      return res.redirect("/pengaturan");
    }

    const pengaturanLama = await getPengaturan();
    hapusFileLama(pengaturanLama.kopSuratPath);

    const kopSuratPath = `/uploads/${req.file.filename}`;
    await prisma.pengaturan.upsert({
      where: { id: 1 },
      update: { kopSuratPath },
      create: { id: 1, namaSekolah: "", kopSuratPath },
    });

    setFlash(req, "success", "Kop surat berhasil diunggah.");
    res.redirect("/pengaturan");
  });
});

router.post("/kop-surat/hapus", requireRole("ADMIN"), async (req, res) => {
  const pengaturanLama = await getPengaturan();
  hapusFileLama(pengaturanLama.kopSuratPath);
  await prisma.pengaturan.upsert({
    where: { id: 1 },
    update: { kopSuratPath: null },
    create: { id: 1, namaSekolah: "" },
  });
  setFlash(req, "success", "Kop surat berhasil dihapus.");
  res.redirect("/pengaturan");
});

export default router;
