import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin, requireRole } from "../middleware/auth.ts";
import { getStatusSpp, getStatusTunggakanAwal, getStatusDsp, generateNoKwitansi } from "../lib/tagihan.ts";
import { sendCsv } from "../lib/csv.ts";

const router = Router();

async function getTahunAjaranAktif() {
  return prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
}

function parsePembayaranFilters(req: import("express").Request) {
  const q = (req.query.q as string | undefined)?.trim();
  const statusParam = req.query.status as string | undefined;
  const status = statusParam === "AKTIF" || statusParam === "DIBATALKAN" ? statusParam : undefined;
  const dari = (req.query.dari as string | undefined)?.trim();
  const sampai = (req.query.sampai as string | undefined)?.trim();
  const kelasIdParam = req.query.kelasId as string | undefined;
  const kelasId = kelasIdParam ? Number(kelasIdParam) : undefined;
  return { q, status, dari, sampai, kelasId };
}

function buildPembayaranWhere(
  filters: ReturnType<typeof parsePembayaranFilters>,
  tahunAjaranAktifId: number | undefined,
) {
  const { q, status, dari, sampai, kelasId } = filters;

  const siswaFilter: Record<string, unknown> = {};
  if (q) siswaFilter.namaLengkap = { contains: q };
  if (kelasId && tahunAjaranAktifId) {
    siswaFilter.siswaKelas = { some: { tahunAjaranId: tahunAjaranAktifId, kelasId } };
  }

  const where: Record<string, unknown> = {};
  if (Object.keys(siswaFilter).length) where.siswa = siswaFilter;
  if (status) where.status = status;
  if (dari || sampai) {
    const tanggal: Record<string, Date> = {};
    if (dari) tanggal.gte = new Date(`${dari}T00:00:00`);
    if (sampai) tanggal.lte = new Date(`${sampai}T23:59:59`);
    where.tanggal = tanggal;
  }

  return where;
}

router.get("/", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await getTahunAjaranAktif();
  const filters = parsePembayaranFilters(req);

  const [kelasList, list] = await Promise.all([
    tahunAjaranAktif
      ? prisma.kelas.findMany({
          where: { tahunAjaranId: tahunAjaranAktif.id },
          include: { jenjang: true },
          orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
        })
      : Promise.resolve([]),
    prisma.transaksiPembayaran.findMany({
      where: buildPembayaranWhere(filters, tahunAjaranAktif?.id),
      include: { siswa: true, dicatatOleh: true, detail: true },
      orderBy: { tanggal: "desc" },
      take: 100,
    }),
  ]);

  res.render("pembayaran/index", {
    title: "Pembayaran",
    list,
    kelasList,
    q: filters.q || "",
    status: filters.status || "",
    dari: filters.dari || "",
    sampai: filters.sampai || "",
    kelasId: filters.kelasId,
  });
});

router.get("/export", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await getTahunAjaranAktif();
  const filters = parsePembayaranFilters(req);

  const list = await prisma.transaksiPembayaran.findMany({
    where: buildPembayaranWhere(filters, tahunAjaranAktif?.id),
    include: { siswa: true, dicatatOleh: true, detail: true },
    orderBy: { tanggal: "desc" },
  });

  const rows = [
    ["No. Kwitansi", "Tanggal", "Siswa", "Jumlah Item", "Total", "Dicatat Oleh", "Status"],
    ...list.map((t) => {
      const total = t.detail.reduce((s, d) => s + d.jumlah, 0);
      return [
        t.noKwitansi,
        new Date(t.tanggal).toLocaleDateString("id-ID"),
        t.siswa.namaLengkap,
        t.detail.length,
        total,
        t.dicatatOleh.nama,
        t.status === "AKTIF" ? "Aktif" : "Dibatalkan",
      ];
    }),
  ];

  sendCsv(res, "riwayat-pembayaran.csv", rows);
});

router.get("/new", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const tahunAjaranAktif = await getTahunAjaranAktif();
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/tahun-ajaran");
  }

  const siswaIdParam = req.query.siswaId as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const kelasIdParam = req.query.kelasId as string | undefined;
  const kelasId = kelasIdParam ? Number(kelasIdParam) : undefined;
  const ref = req.query.ref as string | undefined;

  if (!siswaIdParam) {
    const kelasList = await prisma.kelas.findMany({
      where: { tahunAjaranId: tahunAjaranAktif.id },
      include: { jenjang: true },
      orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
    });

    const hasil = await prisma.siswa.findMany({
      where: {
        status: "AKTIF",
        ...(q ? { namaLengkap: { contains: q } } : {}),
        ...(kelasId
          ? { siswaKelas: { some: { tahunAjaranId: tahunAjaranAktif.id, kelasId } } }
          : {}),
      },
      include: {
        siswaKelas: {
          where: { tahunAjaranId: tahunAjaranAktif.id },
          include: { kelas: { include: { jenjang: true } } },
        },
      },
      orderBy: { namaLengkap: "asc" },
      take: 50,
    });

    return res.render("pembayaran/cari", {
      title: "Catat Pembayaran",
      hasil,
      q: q || "",
      kelasList,
      kelasId,
    });
  }

  const siswaId = Number(siswaIdParam);
  const siswa = await prisma.siswa.findUnique({
    where: { id: siswaId },
    include: {
      siswaKelas: {
        where: { tahunAjaranId: tahunAjaranAktif.id },
        include: { kelas: { include: { jenjang: true } } },
      },
    },
  });

  if (!siswa) {
    setFlash(req, "error", "Siswa tidak ditemukan.");
    return res.redirect("/pembayaran/new");
  }

  const [statusSpp, statusTunggakan, statusDsp] = await Promise.all([
    getStatusSpp(siswaId, tahunAjaranAktif.id),
    getStatusTunggakanAwal(siswaId, tahunAjaranAktif.id),
    getStatusDsp(siswaId),
  ]);

  res.render("pembayaran/form", {
    title: "Catat Pembayaran",
    siswa,
    tahunAjaranAktif,
    statusSpp,
    statusTunggakan,
    statusDsp,
    refKwitansi: ref || null,
  });
});

router.post("/", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { siswaId, bayarSpp, bayarTunggakan, bayarDsp, catatan } = req.body as {
    siswaId?: string;
    bayarSpp?: string;
    bayarTunggakan?: string;
    bayarDsp?: string;
    catatan?: string;
  };

  const tahunAjaranAktif = await getTahunAjaranAktif();
  if (!tahunAjaranAktif || !siswaId) {
    setFlash(req, "error", "Data tidak lengkap.");
    return res.redirect("/pembayaran/new");
  }

  const id = Number(siswaId);
  const jumlahSppInput = bayarSpp ? Number(bayarSpp) : 0;
  const jumlahTunggakan = bayarTunggakan ? Number(bayarTunggakan) : 0;
  const jumlahDsp = bayarDsp ? Number(bayarDsp) : 0;

  const [statusSpp, statusTunggakan, statusDsp] = await Promise.all([
    getStatusSpp(id, tahunAjaranAktif.id),
    getStatusTunggakanAwal(id, tahunAjaranAktif.id),
    getStatusDsp(id),
  ]);

  const details: { jenis: "SPP" | "DSP" | "TUNGGAKAN_AWAL"; tahunAjaranId?: number; bulanSpp?: number; jumlah: number }[] = [];

  if (jumlahSppInput > 0) {
    const jumlah = Math.min(jumlahSppInput, statusSpp.sisa);
    if (jumlah > 0) details.push({ jenis: "SPP", tahunAjaranId: tahunAjaranAktif.id, jumlah });
  }

  if (jumlahTunggakan > 0) {
    const jumlah = Math.min(jumlahTunggakan, statusTunggakan.sisa);
    if (jumlah > 0) details.push({ jenis: "TUNGGAKAN_AWAL", tahunAjaranId: tahunAjaranAktif.id, jumlah });
  }

  if (jumlahDsp > 0) {
    const jumlah = Math.min(jumlahDsp, statusDsp.sisa);
    if (jumlah > 0) details.push({ jenis: "DSP", jumlah });
  }

  if (details.length === 0) {
    setFlash(req, "error", "Tidak ada item pembayaran yang dipilih.");
    return res.redirect(`/pembayaran/new?siswaId=${id}`);
  }

  const noKwitansi = await generateNoKwitansi(tahunAjaranAktif.label);

  const transaksi = await prisma.transaksiPembayaran.create({
    data: {
      noKwitansi,
      siswaId: id,
      dicatatOlehId: req.session.userId!,
      catatan: catatan?.trim() || null,
      detail: { create: details },
    },
  });

  setFlash(req, "success", `Pembayaran berhasil dicatat. No. Kwitansi: ${noKwitansi}`);
  res.redirect(`/pembayaran/${transaksi.id}`);
});

router.get("/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const transaksi = await prisma.transaksiPembayaran.findUnique({
    where: { id },
    include: { siswa: true, dicatatOleh: true, detail: true },
  });

  if (!transaksi) {
    setFlash(req, "error", "Transaksi tidak ditemukan.");
    return res.redirect("/pembayaran");
  }

  const total = transaksi.detail.reduce((sum, d) => sum + d.jumlah, 0);

  res.render("pembayaran/kwitansi", { title: "Kwitansi", transaksi, total, fullBleed: true });
});

router.post("/:id/batalkan", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.transaksiPembayaran.update({
    where: { id },
    data: { status: "DIBATALKAN" },
  });
  setFlash(req, "success", "Transaksi berhasil dibatalkan.");
  res.redirect(`/pembayaran/${id}`);
});

router.post("/:id/ganti", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const transaksi = await prisma.transaksiPembayaran.findUnique({ where: { id } });

  if (!transaksi || transaksi.status !== "AKTIF") {
    setFlash(req, "error", "Transaksi tidak ditemukan atau sudah dibatalkan.");
    return res.redirect(`/pembayaran/${id}`);
  }

  await prisma.transaksiPembayaran.update({
    where: { id },
    data: {
      status: "DIBATALKAN",
      catatan: [transaksi.catatan, "[Dibatalkan untuk diganti dengan transaksi baru]"].filter(Boolean).join(" — "),
    },
  });

  setFlash(req, "success", `Transaksi ${transaksi.noKwitansi} dibatalkan. Silakan catat pembayaran pengganti.`);
  res.redirect(`/pembayaran/new?siswaId=${transaksi.siswaId}&ref=${encodeURIComponent(transaksi.noKwitansi)}`);
});

export default router;
