import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { requireLogin } from "../middleware/auth.ts";
import { getRekapTunggakan, BULAN_LABELS } from "../lib/tagihan.ts";

const router = Router();

router.get("/", requireLogin, async (req, res) => {
  const tahunAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });

  const [jumlahSiswaAktif, jumlahKelas, jumlahUser, rekap, recentPembayaran, recentSurat] = await Promise.all([
    prisma.siswa.count({ where: { status: "AKTIF" } }),
    tahunAktif ? prisma.kelas.count({ where: { tahunAjaranId: tahunAktif.id } }) : 0,
    prisma.user.count(),
    tahunAktif ? getRekapTunggakan(tahunAktif.id) : null,
    prisma.transaksiPembayaran.findMany({
      where: { status: "AKTIF" },
      include: { siswa: true, detail: true },
      orderBy: { tanggal: "desc" },
      take: 5,
    }),
    prisma.suratTagihanLog.findMany({
      include: { siswa: true },
      orderBy: { tanggalDibuat: "desc" },
      take: 5,
    }),
  ]);

  res.render("dashboard", {
    title: "Dashboard",
    tahunAktif,
    jumlahSiswaAktif,
    jumlahKelas,
    jumlahUser,
    rekap,
    recentPembayaran,
    recentSurat,
    BULAN_LABELS,
  });
});

export default router;
