import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin } from "../middleware/auth.ts";
import { getRekapTunggakan, getKeringananSpp } from "../lib/tagihan.ts";
import { sendCsv } from "../lib/csv.ts";

const router = Router();

router.get("/tunggakan", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/tahun-ajaran");
  }

  const jenjangId = req.query.jenjangId ? Number(req.query.jenjangId) : undefined;
  const kelasId = req.query.kelasId ? Number(req.query.kelasId) : undefined;
  const tampilkanSemua = req.query.semua === "1";
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();

  const [jenjangList, kelasList, rekap] = await Promise.all([
    prisma.jenjang.findMany({ orderBy: { urutan: "asc" } }),
    prisma.kelas.findMany({
      where: { tahunAjaranId: tahunAjaranAktif.id, ...(jenjangId ? { jenjangId } : {}) },
      include: { jenjang: true },
      orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
    }),
    getRekapTunggakan(tahunAjaranAktif.id, { jenjangId, kelasId }),
  ]);

  const filteredByLunas = tampilkanSemua ? rekap.list : rekap.list.filter((s) => s.totalTunggakan > 0);
  const list = q ? filteredByLunas.filter((s) => s.nama.toLowerCase().includes(q)) : filteredByLunas;

  res.render("laporan/tunggakan", {
    title: "Laporan Tunggakan",
    tahunAjaranAktif,
    jenjangList,
    kelasList,
    jenjangId,
    kelasId,
    tampilkanSemua,
    q: q || "",
    list,
    perKelas: rekap.perKelas,
    totalSiswaMenunggak: rekap.totalSiswaMenunggak,
    totalNilaiTunggakan: rekap.totalNilaiTunggakan,
  });
});

router.get("/tunggakan/export", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/laporan/tunggakan");
  }

  const jenjangId = req.query.jenjangId ? Number(req.query.jenjangId) : undefined;
  const kelasId = req.query.kelasId ? Number(req.query.kelasId) : undefined;
  const tampilkanSemua = req.query.semua === "1";
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();

  const rekap = await getRekapTunggakan(tahunAjaranAktif.id, { jenjangId, kelasId });
  const filteredByLunas = tampilkanSemua ? rekap.list : rekap.list.filter((s) => s.totalTunggakan > 0);
  const list = q ? filteredByLunas.filter((s) => s.nama.toLowerCase().includes(q)) : filteredByLunas;

  const rows = [
    ["Nama", "NIS", "Jenjang", "Kelas", "Bulan SPP Nunggak", "Tunggakan SPP", "Tunggakan Awal", "Sisa DSP", "Total Tunggakan"],
    ...list.map((s) => [
      s.nama,
      s.nis ?? "-",
      s.jenjangNama,
      s.kelasNama,
      s.jumlahBulanBelumBayar,
      s.tunggakanSpp,
      s.sisaTunggakanAwal,
      s.sisaDsp,
      s.totalTunggakan,
    ]),
  ];

  sendCsv(res, `laporan-tunggakan-${tahunAjaranAktif.label.replace(/\//g, "-")}.csv`, rows);
});

router.get("/keringanan-spp", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/tahun-ajaran");
  }

  const rekap = await getKeringananSpp(tahunAjaranAktif.id);

  res.render("laporan/keringanan-spp", {
    title: "Laporan Keringanan SPP",
    tahunAjaranAktif,
    ...rekap,
  });
});

export default router;
