import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { setFlash } from "../lib/flash.ts";
import { requireLogin, requireRole } from "../middleware/auth.ts";
import { getStatusSpp, getStatusTunggakanAwal, getStatusDsp } from "../lib/tagihan.ts";
import { getPengaturan } from "../lib/pengaturan.ts";
import { sendCsv } from "../lib/csv.ts";

const router = Router();

async function getTahunAjaranAktif() {
  return prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
}

router.get("/", requireLogin, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const kelasId = req.query.kelasId ? Number(req.query.kelasId) : undefined;
  const tahunAjaranAktif = await getTahunAjaranAktif();

  const kelasList = tahunAjaranAktif
    ? await prisma.kelas.findMany({
        where: { tahunAjaranId: tahunAjaranAktif.id },
        include: { jenjang: true },
        orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
      })
    : [];

  const siswaList = await prisma.siswa.findMany({
    where: {
      ...(q ? { namaLengkap: { contains: q } } : {}),
      ...(kelasId || tahunAjaranAktif
        ? {
            siswaKelas: {
              some: {
                ...(tahunAjaranAktif ? { tahunAjaranId: tahunAjaranAktif.id } : {}),
                ...(kelasId ? { kelasId } : {}),
              },
            },
          }
        : {}),
    },
    include: {
      siswaKelas: {
        where: tahunAjaranAktif ? { tahunAjaranId: tahunAjaranAktif.id } : undefined,
        include: { kelas: { include: { jenjang: true } } },
      },
    },
    orderBy: { namaLengkap: "asc" },
    take: 300,
  });

  res.render("siswa/index", { title: "Siswa", siswaList, kelasList, q: q || "", kelasId, tahunAjaranAktif });
});

router.get("/export", requireLogin, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const kelasId = req.query.kelasId ? Number(req.query.kelasId) : undefined;
  const tahunAjaranAktif = await getTahunAjaranAktif();

  const siswaList = await prisma.siswa.findMany({
    where: {
      ...(q ? { namaLengkap: { contains: q } } : {}),
      ...(kelasId || tahunAjaranAktif
        ? {
            siswaKelas: {
              some: {
                ...(tahunAjaranAktif ? { tahunAjaranId: tahunAjaranAktif.id } : {}),
                ...(kelasId ? { kelasId } : {}),
              },
            },
          }
        : {}),
    },
    include: {
      siswaKelas: {
        where: tahunAjaranAktif ? { tahunAjaranId: tahunAjaranAktif.id } : undefined,
        include: { kelas: { include: { jenjang: true } } },
      },
    },
    orderBy: { namaLengkap: "asc" },
  });

  const rows = [
    ["Nama", "NIS", "NISN", "Jenis Kelamin", "Kelas", "Wali", "No HP Wali", "Email Wali", "Status"],
    ...siswaList.map((s) => {
      const sk = s.siswaKelas[0];
      return [
        s.namaLengkap,
        s.nis ?? "-",
        s.nisn ?? "-",
        s.jenisKelamin ?? "-",
        sk ? `${sk.kelas.jenjang.nama} - ${sk.kelas.nama}` : "-",
        s.namaWali ?? "-",
        s.noHpWali ?? "-",
        s.emailWali ?? "-",
        s.status,
      ];
    }),
  ];

  sendCsv(res, "data-siswa.csv", rows);
});

router.get("/new", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const tahunAjaranAktif = await getTahunAjaranAktif();
  const kelasList = tahunAjaranAktif
    ? await prisma.kelas.findMany({
        where: { tahunAjaranId: tahunAjaranAktif.id },
        include: { jenjang: true },
        orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
      })
    : [];

  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif. Buat tahun ajaran dulu sebelum menambah siswa.");
    return res.redirect("/tahun-ajaran");
  }

  const pengaturan = await getPengaturan();

  res.render("siswa/form", { title: "Tambah Siswa", siswa: null, kelasList, tahunAjaranAktif, pengaturan });
});

router.post("/", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const {
    namaLengkap,
    nis,
    nisn,
    jenisKelamin,
    namaWali,
    noHpWali,
    emailWali,
    kelasId,
    bulanMulai,
    saldoAwalSpp,
    jumlahDsp,
  } = req.body as Record<string, string | undefined>;

  const tahunAjaranAktif = await getTahunAjaranAktif();
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect("/siswa/new");
  }

  if (!namaLengkap?.trim() || !kelasId) {
    setFlash(req, "error", "Nama lengkap dan kelas wajib diisi.");
    return res.redirect("/siswa/new");
  }

  const siswa = await prisma.siswa.create({
    data: {
      namaLengkap: namaLengkap.trim().replace(/\s+/g, " "),
      nis: nis?.trim() || null,
      nisn: nisn?.trim() || null,
      jenisKelamin: jenisKelamin || null,
      namaWali: namaWali?.trim() || null,
      noHpWali: noHpWali?.trim() || null,
      emailWali: emailWali?.trim() || null,
    },
  });

  await prisma.siswaKelas.create({
    data: {
      siswaId: siswa.id,
      tahunAjaranId: tahunAjaranAktif.id,
      kelasId: Number(kelasId),
      bulanMulai: bulanMulai ? Number(bulanMulai) : 1,
    },
  });

  if (saldoAwalSpp && Number(saldoAwalSpp) > 0) {
    await prisma.tunggakanAwal.create({
      data: {
        siswaId: siswa.id,
        tahunAjaranId: tahunAjaranAktif.id,
        saldoAwalSpp: Number(saldoAwalSpp),
        catatan: "Input awal saat pendataan siswa.",
      },
    });
  }

  if (jumlahDsp && Number(jumlahDsp) > 0) {
    await prisma.dspTagihan.create({
      data: {
        siswaId: siswa.id,
        jumlahDsp: Number(jumlahDsp),
        catatan: "Input awal saat pendataan siswa.",
      },
    });
  }

  setFlash(req, "success", `Siswa ${siswa.namaLengkap} berhasil ditambahkan.`);
  res.redirect(`/siswa/${siswa.id}`);
});

router.get("/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const siswa = await prisma.siswa.findUnique({
    where: { id },
    include: {
      siswaKelas: {
        include: { kelas: { include: { jenjang: true } }, tahunAjaran: true },
        orderBy: { tahunAjaran: { tanggalMulai: "desc" } },
      },
      tunggakanAwal: { include: { tahunAjaran: true } },
      dspTagihan: true,
    },
  });

  if (!siswa) {
    setFlash(req, "error", "Siswa tidak ditemukan.");
    return res.redirect("/siswa");
  }

  const tahunAjaranAktif = await getTahunAjaranAktif();
  const kelasList = tahunAjaranAktif
    ? await prisma.kelas.findMany({
        where: { tahunAjaranId: tahunAjaranAktif.id },
        include: { jenjang: true },
        orderBy: [{ jenjang: { urutan: "asc" } }, { nama: "asc" }],
      })
    : [];

  const [statusSpp, statusTunggakan, statusDsp, riwayatPembayaran] = tahunAjaranAktif
    ? await Promise.all([
        getStatusSpp(id, tahunAjaranAktif.id),
        getStatusTunggakanAwal(id, tahunAjaranAktif.id),
        getStatusDsp(id),
        prisma.transaksiPembayaran.findMany({
          where: { siswaId: id },
          include: { detail: true },
          orderBy: { tanggal: "desc" },
          take: 20,
        }),
      ])
    : [null, null, null, []];

  const skAktif = tahunAjaranAktif
    ? siswa.siswaKelas.find((sk) => sk.tahunAjaranId === tahunAjaranAktif.id) ?? null
    : null;

  const taAktif = tahunAjaranAktif
    ? siswa.tunggakanAwal.find((t) => t.tahunAjaranId === tahunAjaranAktif.id) ?? null
    : null;

  res.render("siswa/detail", {
    title: siswa.namaLengkap,
    siswa,
    kelasList,
    tahunAjaranAktif,
    statusSpp,
    statusTunggakan,
    statusDsp,
    riwayatPembayaran,
    skAktif,
    taAktif,
  });
});

router.get("/:id/edit", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const siswa = await prisma.siswa.findUnique({ where: { id: Number(req.params.id) } });
  if (!siswa) {
    setFlash(req, "error", "Siswa tidak ditemukan.");
    return res.redirect("/siswa");
  }
  const tahunAjaranAktif = await getTahunAjaranAktif();
  res.render("siswa/form", { title: "Edit Siswa", siswa, kelasList: [], tahunAjaranAktif });
});

router.post("/:id", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { namaLengkap, nis, nisn, jenisKelamin, namaWali, noHpWali, emailWali, status } = req.body as Record<
    string,
    string | undefined
  >;

  if (!namaLengkap?.trim()) {
    setFlash(req, "error", "Nama lengkap wajib diisi.");
    return res.redirect(`/siswa/${id}/edit`);
  }

  await prisma.siswa.update({
    where: { id },
    data: {
      namaLengkap: namaLengkap.trim().replace(/\s+/g, " "),
      nis: nis?.trim() || null,
      nisn: nisn?.trim() || null,
      jenisKelamin: jenisKelamin || null,
      namaWali: namaWali?.trim() || null,
      noHpWali: noHpWali?.trim() || null,
      emailWali: emailWali?.trim() || null,
      ...(status ? { status: status as "AKTIF" | "LULUS" | "PINDAH" | "KELUAR" } : {}),
    },
  });

  setFlash(req, "success", "Data siswa berhasil diperbarui.");
  res.redirect(`/siswa/${id}`);
});

router.post("/:id/dsp", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { jumlahDsp, catatan } = req.body as { jumlahDsp?: string; catatan?: string };

  if (!jumlahDsp || Number(jumlahDsp) <= 0) {
    setFlash(req, "error", "Jumlah DSP wajib diisi dan lebih dari 0.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.dspTagihan.create({
    data: {
      siswaId: id,
      jumlahDsp: Number(jumlahDsp),
      catatan: catatan?.trim() || null,
    },
  });

  setFlash(req, "success", "Tagihan DSP berhasil ditambahkan.");
  res.redirect(`/siswa/${id}`);
});

router.post("/:id/dsp/:dspId", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const dspId = Number(req.params.dspId);
  const { jumlahDsp, catatan } = req.body as { jumlahDsp?: string; catatan?: string };

  if (!jumlahDsp || Number(jumlahDsp) <= 0) {
    setFlash(req, "error", "Jumlah DSP wajib diisi dan lebih dari 0.");
    return res.redirect(`/siswa/${id}`);
  }

  const existing = await prisma.dspTagihan.findUnique({ where: { id: dspId } });
  if (!existing || existing.siswaId !== id) {
    setFlash(req, "error", "Tagihan DSP tidak ditemukan.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.dspTagihan.update({
    where: { id: dspId },
    data: { jumlahDsp: Number(jumlahDsp), catatan: catatan?.trim() || null },
  });

  setFlash(req, "success", "Tagihan DSP berhasil diperbarui.");
  res.redirect(`/siswa/${id}`);
});

router.post("/:id/dsp/:dspId/hapus", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const dspId = Number(req.params.dspId);

  const existing = await prisma.dspTagihan.findUnique({ where: { id: dspId } });
  if (!existing || existing.siswaId !== id) {
    setFlash(req, "error", "Tagihan DSP tidak ditemukan.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.dspTagihan.delete({ where: { id: dspId } });

  setFlash(req, "success", "Tagihan DSP berhasil dihapus.");
  res.redirect(`/siswa/${id}`);
});

const KATEGORI_KERINGANAN_VALID = ["PRESTASI", "KURANG_MAMPU", "YATIM", "PIATU", "LAINNYA"];

router.post("/:id/keringanan-spp", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { kategori, sppOverride, catatan } = req.body as {
    kategori?: string;
    sppOverride?: string;
    catatan?: string;
  };

  const tahunAjaranAktif = await getTahunAjaranAktif();
  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect(`/siswa/${id}`);
  }

  const sk = await prisma.siswaKelas.findUnique({
    where: { siswaId_tahunAjaranId: { siswaId: id, tahunAjaranId: tahunAjaranAktif.id } },
  });
  if (!sk) {
    setFlash(req, "error", "Siswa belum punya data kelas di tahun ajaran aktif.");
    return res.redirect(`/siswa/${id}`);
  }

  if (!kategori || !KATEGORI_KERINGANAN_VALID.includes(kategori)) {
    await prisma.siswaKelas.update({
      where: { id: sk.id },
      data: { sppOverride: null, sppKeringananKategori: null, sppKeringananCatatan: null },
    });
    setFlash(req, "success", "Keringanan SPP dihapus, siswa kembali ke tarif normal.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.siswaKelas.update({
    where: { id: sk.id },
    data: {
      sppOverride: sppOverride ? Number(sppOverride) : 0,
      sppKeringananKategori: kategori as "PRESTASI" | "KURANG_MAMPU" | "YATIM" | "PIATU" | "LAINNYA",
      sppKeringananCatatan: catatan?.trim() || null,
    },
  });

  setFlash(req, "success", "Keringanan SPP berhasil disimpan.");
  res.redirect(`/siswa/${id}`);
});

router.post("/:id/pindah-kelas", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { kelasId } = req.body as { kelasId?: string };
  const tahunAjaranAktif = await getTahunAjaranAktif();

  if (!kelasId || !tahunAjaranAktif) {
    setFlash(req, "error", "Kelas tujuan wajib dipilih.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.siswaKelas.upsert({
    where: { siswaId_tahunAjaranId: { siswaId: id, tahunAjaranId: tahunAjaranAktif.id } },
    update: { kelasId: Number(kelasId) },
    create: {
      siswaId: id,
      tahunAjaranId: tahunAjaranAktif.id,
      kelasId: Number(kelasId),
    },
  });

  setFlash(req, "success", "Kelas siswa berhasil diperbarui.");
  res.redirect(`/siswa/${id}`);
});

router.post("/:id/tunggakan-awal", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const id = Number(req.params.id);
  const { saldoAwalSpp, catatan } = req.body as { saldoAwalSpp?: string; catatan?: string };
  const tahunAjaranAktif = await getTahunAjaranAktif();

  if (!tahunAjaranAktif) {
    setFlash(req, "error", "Belum ada tahun ajaran aktif.");
    return res.redirect(`/siswa/${id}`);
  }

  await prisma.tunggakanAwal.upsert({
    where: { siswaId_tahunAjaranId: { siswaId: id, tahunAjaranId: tahunAjaranAktif.id } },
    update: { saldoAwalSpp: Number(saldoAwalSpp) || 0, catatan: catatan?.trim() || null },
    create: {
      siswaId: id,
      tahunAjaranId: tahunAjaranAktif.id,
      saldoAwalSpp: Number(saldoAwalSpp) || 0,
      catatan: catatan?.trim() || null,
    },
  });

  setFlash(req, "success", "Tunggakan awal berhasil diperbarui.");
  res.redirect(`/siswa/${id}`);
});

export default router;
