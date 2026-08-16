import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin, requireRole } from "../middleware/auth.ts";

const router = Router();

async function getTahunAjaranTerpilih(tahunAjaranIdParam?: string) {
  if (tahunAjaranIdParam) {
    const ta = await prisma.tahunAjaran.findUnique({ where: { id: Number(tahunAjaranIdParam) } });
    if (ta) return ta;
  }
  const aktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (aktif) return aktif;
  return prisma.tahunAjaran.findFirst({ orderBy: { tanggalMulai: "desc" } });
}

router.get("/", requireLogin, async (req, res) => {
  const semuaTahunAjaran = await prisma.tahunAjaran.findMany({ orderBy: { tanggalMulai: "desc" } });
  const tahunAjaran = await getTahunAjaranTerpilih(req.query.tahunAjaranId as string | undefined);

  const list = tahunAjaran
    ? await prisma.kelas.findMany({
        where: { tahunAjaranId: tahunAjaran.id },
        include: { jenjang: true, _count: { select: { siswaKelas: true } } },
        orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
      })
    : [];

  res.render("kelas/index", { title: "Kelas", list, semuaTahunAjaran, tahunAjaran });
});

router.get("/new", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const semuaTahunAjaran = await prisma.tahunAjaran.findMany({ orderBy: { tanggalMulai: "desc" } });
  const jenjangList = await prisma.jenjang.findMany({ orderBy: { urutan: "asc" } });
  const tahunAjaran = await getTahunAjaranTerpilih(req.query.tahunAjaranId as string | undefined);
  res.render("kelas/form", { title: "Tambah Kelas", kelas: null, semuaTahunAjaran, jenjangList, tahunAjaran });
});

router.post("/", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { tahunAjaranId, jenjangId, nama, waliKelas } = req.body as {
    tahunAjaranId?: string;
    jenjangId?: string;
    nama?: string;
    waliKelas?: string;
  };

  if (!tahunAjaranId || !jenjangId || !nama) {
    setFlash(req, "error", "Tahun ajaran, jenjang, dan nama kelas wajib diisi.");
    return res.redirect("/kelas/new");
  }

  const duplicate = await prisma.kelas.findFirst({
    where: { tahunAjaranId: Number(tahunAjaranId), nama },
  });
  if (duplicate) {
    setFlash(req, "error", "Nama kelas sudah ada di tahun ajaran ini.");
    return res.redirect("/kelas/new");
  }

  await prisma.kelas.create({
    data: {
      tahunAjaranId: Number(tahunAjaranId),
      jenjangId: Number(jenjangId),
      nama,
      waliKelas: waliKelas || null,
    },
  });

  setFlash(req, "success", `Kelas ${nama} berhasil ditambahkan.`);
  res.redirect(`/kelas?tahunAjaranId=${tahunAjaranId}`);
});

router.get("/:id/edit", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const kelas = await prisma.kelas.findUnique({ where: { id: Number(req.params.id) } });
  if (!kelas) {
    setFlash(req, "error", "Kelas tidak ditemukan.");
    return res.redirect("/kelas");
  }
  const semuaTahunAjaran = await prisma.tahunAjaran.findMany({ orderBy: { tanggalMulai: "desc" } });
  const jenjangList = await prisma.jenjang.findMany({ orderBy: { urutan: "asc" } });
  res.render("kelas/form", { title: "Edit Kelas", kelas, semuaTahunAjaran, jenjangList, tahunAjaran: null });
});

router.post("/:id", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { jenjangId, nama, waliKelas } = req.body as {
    jenjangId?: string;
    nama?: string;
    waliKelas?: string;
  };

  if (!jenjangId || !nama) {
    setFlash(req, "error", "Jenjang dan nama kelas wajib diisi.");
    return res.redirect(`/kelas/${id}/edit`);
  }

  const kelas = await prisma.kelas.update({
    where: { id },
    data: { jenjangId: Number(jenjangId), nama, waliKelas: waliKelas || null },
  });

  setFlash(req, "success", `Kelas ${nama} berhasil diperbarui.`);
  res.redirect(`/kelas?tahunAjaranId=${kelas.tahunAjaranId}`);
});

export default router;
