import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin, requireRole } from "../middleware/auth.ts";
import { getRekapTunggakan, BULAN_LABELS } from "../lib/tagihan.ts";
import { getPengaturan } from "../lib/pengaturan.ts";
import { getDataSuratSiswa, getBulanKalender, generateNoSurat } from "../lib/surat.ts";

const router = Router();

function bulanKeSaatIni(tanggalMulai: Date): number {
  const now = new Date();
  const mulai = new Date(tanggalMulai);
  const diff = (now.getFullYear() - mulai.getFullYear()) * 12 + (now.getMonth() - mulai.getMonth()) + 1;
  return Math.min(12, Math.max(1, diff));
}

router.get("/", requireLogin, async (req, res) => {
  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/tahun-ajaran");
  }

  const jenjangId = req.query.jenjangId ? Number(req.query.jenjangId) : undefined;
  const kelasId = req.query.kelasId ? Number(req.query.kelasId) : undefined;
  const periodeBulan = req.query.periodeBulan
    ? Number(req.query.periodeBulan)
    : bulanKeSaatIni(tahunAjaranAktif.tanggalMulai);
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

  const list = q ? rekap.list.filter((s) => s.nama.toLowerCase().includes(q)) : rekap.list;

  res.render("surat/pilih", {
    title: "Surat Tagihan",
    tahunAjaranAktif,
    jenjangList,
    kelasList,
    jenjangId,
    kelasId,
    periodeBulan,
    q: q || "",
    bulanLabels: BULAN_LABELS,
    list,
  });
});

router.post("/generate", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { periodeBulan, tanggalSurat } = req.body as { periodeBulan?: string; tanggalSurat?: string };
  let siswaIdsRaw = req.body.siswaIds;
  if (!siswaIdsRaw) siswaIdsRaw = [];
  if (!Array.isArray(siswaIdsRaw)) siswaIdsRaw = [siswaIdsRaw];
  const siswaIds = siswaIdsRaw.map(Number).filter((n: number) => Number.isFinite(n));

  if (siswaIds.length === 0 || !periodeBulan) {
    setFlash(req, "error", "Pilih minimal satu siswa dan periode bulan.");
    return res.redirect("/surat");
  }

  const tahunAjaranAktif = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/surat");
  }

  const tanggal = tanggalSurat ? new Date(`${tanggalSurat}T00:00:00`) : new Date();

  const pengaturan = await getPengaturan();
  const noSurat = await generateNoSurat(pengaturan.kodeSuratPrefix, tanggal);

  const logIds: number[] = [];
  for (const siswaId of siswaIds) {
    const log = await prisma.suratTagihanLog.create({
      data: {
        siswaId,
        tahunAjaranId: tahunAjaranAktif.id,
        periodeBulan: Number(periodeBulan),
        noSurat,
        tanggalDibuat: tanggal,
        dibuatOlehId: req.session.userId!,
        metodeKirim: "PRINT",
        status: "DRAFT",
      },
    });
    logIds.push(log.id);
  }

  res.redirect(`/surat/cetak?ids=${logIds.join(",")}`);
});

router.get("/cetak", requireLogin, async (req, res) => {
  const idsParam = String(req.query.ids ?? "");
  const logIds = idsParam
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (logIds.length === 0) {
    setFlash(req, "error", "Tidak ada surat untuk dicetak.");
    return res.redirect("/surat");
  }

  const logs = await prisma.suratTagihanLog.findMany({
    where: { id: { in: logIds } },
    include: { tahunAjaran: true },
    orderBy: { id: "asc" },
  });

  const pengaturan = await getPengaturan();

  const suratList = [];
  for (const log of logs) {
    const data = await getDataSuratSiswa(log.siswaId, log.tahunAjaranId);
    if (!data) continue;
    const bulanKalender = getBulanKalender(log.tahunAjaran.tanggalMulai, log.periodeBulan);
    suratList.push({
      noSurat: log.noSurat,
      tanggalSurat: log.tanggalDibuat,
      periodeBulan: log.periodeBulan,
      bulanKalender,
      ...data,
    });
  }

  res.render("surat/cetak", { title: "Cetak Surat Tagihan", fullBleed: true, pengaturan, suratList });
});

router.get("/riwayat", requireLogin, async (req, res) => {
  const periodeBulan = req.query.periodeBulan ? Number(req.query.periodeBulan) : undefined;
  const logs = await prisma.suratTagihanLog.findMany({
    where: periodeBulan ? { periodeBulan } : {},
    include: { siswa: true, tahunAjaran: true, dibuatOleh: true },
    orderBy: { tanggalDibuat: "desc" },
    take: 300,
  });

  const siswaKelasList = logs.length
    ? await prisma.siswaKelas.findMany({
        where: { OR: logs.map((l) => ({ siswaId: l.siswaId, tahunAjaranId: l.tahunAjaranId })) },
        include: { kelas: true },
      })
    : [];
  const kelasMap = new Map(siswaKelasList.map((sk) => [`${sk.siswaId}-${sk.tahunAjaranId}`, sk.kelas.nama]));

  const list = logs.map((l) => ({
    ...l,
    kelasNama: kelasMap.get(`${l.siswaId}-${l.tahunAjaranId}`) ?? "-",
  }));

  res.render("surat/riwayat", { title: "Riwayat Surat", list, periodeBulan, bulanLabels: BULAN_LABELS });
});

export default router;
