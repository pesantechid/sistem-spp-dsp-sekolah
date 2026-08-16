import { prisma } from "./prisma.ts";

export const BULAN_LABELS = [
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
];

export function labelBulan(bulanKe: number) {
  return BULAN_LABELS[bulanKe - 1] ?? `Bulan ${bulanKe}`;
}

export type BulanSpp = {
  bulanKe: number;
  label: string;
  berlaku: boolean;
  sudahBayar: boolean;
};

function hitungStatusSpp(bulanMulai: number, sppRate: number, totalDibayar: number) {
  const totalBulanBerlaku = 12 - bulanMulai + 1;
  const totalTagihan = totalBulanBerlaku * sppRate;
  const sisa = Math.max(0, totalTagihan - totalDibayar);
  const bulanLunasPenuh =
    sppRate > 0 ? Math.min(totalBulanBerlaku, Math.floor(totalDibayar / sppRate)) : totalBulanBerlaku;

  const bulan: BulanSpp[] = Array.from({ length: 12 }, (_, i) => {
    const bulanKe = i + 1;
    const berlaku = bulanKe >= bulanMulai;
    const posisi = bulanKe - bulanMulai;
    return {
      bulanKe,
      label: labelBulan(bulanKe),
      berlaku,
      sudahBayar: berlaku && posisi < bulanLunasPenuh,
    };
  });

  const belumBayar = bulan.filter((b) => b.berlaku && !b.sudahBayar);

  return {
    bulan,
    belumBayar,
    jumlahBelumBayar: belumBayar.length,
    totalBulanBerlaku,
    totalTagihan,
    totalDibayar,
    sisa,
    bulanLunasPenuh,
  };
}

export async function getStatusSpp(siswaId: number, tahunAjaranId: number) {
  const [siswaKelas, tarif, dibayar] = await Promise.all([
    prisma.siswaKelas.findUnique({
      where: { siswaId_tahunAjaranId: { siswaId, tahunAjaranId } },
    }),
    prisma.tarif.findUnique({ where: { tahunAjaranId } }),
    prisma.transaksiPembayaranDetail.aggregate({
      where: {
        jenis: "SPP",
        tahunAjaranId,
        transaksi: { siswaId, status: "AKTIF" },
      },
      _sum: { jumlah: true },
    }),
  ]);

  const bulanMulai = siswaKelas?.bulanMulai ?? 1;
  const sppBulanan = siswaKelas?.sppOverride ?? tarif?.sppBulanan ?? 0;
  const totalDibayar = dibayar._sum.jumlah ?? 0;

  const status = hitungStatusSpp(bulanMulai, sppBulanan, totalDibayar);

  return {
    ...status,
    sppBulanan,
    sppKeringanan:
      siswaKelas?.sppOverride != null
        ? {
            kategori: siswaKelas.sppKeringananKategori,
            catatan: siswaKelas.sppKeringananCatatan,
            sppNormal: tarif?.sppBulanan ?? 0,
          }
        : null,
  };
}

export async function getStatusTunggakanAwal(siswaId: number, tahunAjaranId: number) {
  const [tunggakan, dibayar] = await Promise.all([
    prisma.tunggakanAwal.findUnique({
      where: { siswaId_tahunAjaranId: { siswaId, tahunAjaranId } },
    }),
    prisma.transaksiPembayaranDetail.aggregate({
      where: {
        jenis: "TUNGGAKAN_AWAL",
        tahunAjaranId,
        transaksi: { siswaId, status: "AKTIF" },
      },
      _sum: { jumlah: true },
    }),
  ]);

  const saldoAwal = tunggakan?.saldoAwalSpp ?? 0;
  const totalDibayar = dibayar._sum.jumlah ?? 0;
  const sisa = Math.max(0, saldoAwal - totalDibayar);

  return { saldoAwal, totalDibayar, sisa };
}

export async function getStatusDsp(siswaId: number) {
  const [tagihan, dibayar] = await Promise.all([
    prisma.dspTagihan.aggregate({
      where: { siswaId },
      _sum: { jumlahDsp: true },
    }),
    prisma.transaksiPembayaranDetail.aggregate({
      where: {
        jenis: "DSP",
        transaksi: { siswaId, status: "AKTIF" },
      },
      _sum: { jumlah: true },
    }),
  ]);

  const totalTagihan = tagihan._sum.jumlahDsp ?? 0;
  const totalDibayar = dibayar._sum.jumlah ?? 0;
  const sisa = Math.max(0, totalTagihan - totalDibayar);

  return { totalTagihan, totalDibayar, sisa };
}

export function formatRupiah(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}

export type RekapSiswa = {
  siswaId: number;
  nama: string;
  nis: string | null;
  kelasId: number;
  kelasNama: string;
  jenjangNama: string;
  jumlahBulanBelumBayar: number;
  tunggakanSpp: number;
  sisaTunggakanAwal: number;
  sisaDsp: number;
  totalTunggakan: number;
};

export type RingkasanKelas = {
  kelasId: number;
  kelasNama: string;
  jenjangNama: string;
  jumlahSiswaMenunggak: number;
  totalTunggakan: number;
};

async function jumlahBySiswaViaTransaksi(where: NonNullable<Parameters<typeof prisma.transaksiPembayaranDetail.findMany>[0]>["where"]) {
  const rows = await prisma.transaksiPembayaranDetail.findMany({
    where,
    select: { jumlah: true, transaksi: { select: { siswaId: true } } },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    const id = r.transaksi.siswaId;
    map.set(id, (map.get(id) ?? 0) + r.jumlah);
  }
  return map;
}

export async function getRekapTunggakan(
  tahunAjaranId: number,
  filter?: { jenjangId?: number; kelasId?: number }
): Promise<{ list: RekapSiswa[]; perKelas: RingkasanKelas[]; totalSiswaMenunggak: number; totalNilaiTunggakan: number }> {
  const tarif = await prisma.tarif.findUnique({ where: { tahunAjaranId } });
  const sppBulanan = tarif?.sppBulanan ?? 0;

  const siswaKelasList = await prisma.siswaKelas.findMany({
    where: {
      tahunAjaranId,
      status: "AKTIF",
      ...(filter?.kelasId ? { kelasId: filter.kelasId } : {}),
      ...(filter?.jenjangId ? { kelas: { jenjangId: filter.jenjangId } } : {}),
    },
    include: { siswa: true, kelas: { include: { jenjang: true } } },
  });

  const siswaIds = siswaKelasList.map((sk) => sk.siswaId);
  if (siswaIds.length === 0) {
    return { list: [], perKelas: [], totalSiswaMenunggak: 0, totalNilaiTunggakan: 0 };
  }

  const [dibayarSppMap, tunggakanAwalList, dibayarTunggakanMap, dspTagihanGroup, dibayarDspMap] = await Promise.all([
    jumlahBySiswaViaTransaksi({
      jenis: "SPP",
      tahunAjaranId,
      transaksi: { siswaId: { in: siswaIds }, status: "AKTIF" },
    }),
    prisma.tunggakanAwal.findMany({ where: { tahunAjaranId, siswaId: { in: siswaIds } } }),
    jumlahBySiswaViaTransaksi({
      jenis: "TUNGGAKAN_AWAL",
      tahunAjaranId,
      transaksi: { siswaId: { in: siswaIds }, status: "AKTIF" },
    }),
    prisma.dspTagihan.groupBy({ by: ["siswaId"], where: { siswaId: { in: siswaIds } }, _sum: { jumlahDsp: true } }),
    jumlahBySiswaViaTransaksi({
      jenis: "DSP",
      transaksi: { siswaId: { in: siswaIds }, status: "AKTIF" },
    }),
  ]);

  const saldoAwalMap = new Map(tunggakanAwalList.map((t) => [t.siswaId, t.saldoAwalSpp]));
  const totalDspMap = new Map(dspTagihanGroup.map((g) => [g.siswaId, g._sum.jumlahDsp ?? 0]));

  const list: RekapSiswa[] = siswaKelasList.map((sk) => {
    const sppRate = sk.sppOverride ?? sppBulanan;
    const statusSpp = hitungStatusSpp(sk.bulanMulai, sppRate, dibayarSppMap.get(sk.siswaId) ?? 0);
    const jumlahBulanBelumBayar = statusSpp.jumlahBelumBayar;
    const tunggakanSpp = statusSpp.sisa;

    const saldoAwal = saldoAwalMap.get(sk.siswaId) ?? 0;
    const sisaTunggakanAwal = Math.max(0, saldoAwal - (dibayarTunggakanMap.get(sk.siswaId) ?? 0));

    const totalDsp = totalDspMap.get(sk.siswaId) ?? 0;
    const sisaDsp = Math.max(0, totalDsp - (dibayarDspMap.get(sk.siswaId) ?? 0));

    return {
      siswaId: sk.siswaId,
      nama: sk.siswa.namaLengkap,
      nis: sk.siswa.nis,
      kelasId: sk.kelasId,
      kelasNama: sk.kelas.nama,
      jenjangNama: sk.kelas.jenjang.nama,
      jumlahBulanBelumBayar,
      tunggakanSpp,
      sisaTunggakanAwal,
      sisaDsp,
      totalTunggakan: tunggakanSpp + sisaTunggakanAwal + sisaDsp,
    };
  });

  list.sort((a, b) => b.totalTunggakan - a.totalTunggakan);

  const perKelasMap = new Map<number, RingkasanKelas>();
  for (const s of list) {
    if (s.totalTunggakan <= 0) continue;
    if (!perKelasMap.has(s.kelasId)) {
      perKelasMap.set(s.kelasId, {
        kelasId: s.kelasId,
        kelasNama: s.kelasNama,
        jenjangNama: s.jenjangNama,
        jumlahSiswaMenunggak: 0,
        totalTunggakan: 0,
      });
    }
    const entry = perKelasMap.get(s.kelasId)!;
    entry.jumlahSiswaMenunggak++;
    entry.totalTunggakan += s.totalTunggakan;
  }
  const perKelas = Array.from(perKelasMap.values()).sort((a, b) => b.totalTunggakan - a.totalTunggakan);

  const totalSiswaMenunggak = list.filter((s) => s.totalTunggakan > 0).length;
  const totalNilaiTunggakan = list.reduce((sum, s) => sum + s.totalTunggakan, 0);

  return { list, perKelas, totalSiswaMenunggak, totalNilaiTunggakan };
}

export type KeringananSiswa = {
  siswaId: number;
  nama: string;
  kelasNama: string;
  jenjangNama: string;
  kategori: string | null;
  catatan: string | null;
  sppOverride: number;
  sppNormal: number;
  gratis: boolean;
};

export async function getKeringananSpp(tahunAjaranId: number) {
  const tarif = await prisma.tarif.findUnique({ where: { tahunAjaranId } });
  const sppNormal = tarif?.sppBulanan ?? 0;

  const rows = await prisma.siswaKelas.findMany({
    where: { tahunAjaranId, sppOverride: { not: null } },
    include: { siswa: true, kelas: { include: { jenjang: true } } },
    orderBy: { siswa: { namaLengkap: "asc" } },
  });

  const list: KeringananSiswa[] = rows.map((r) => ({
    siswaId: r.siswaId,
    nama: r.siswa.namaLengkap,
    kelasNama: r.kelas.nama,
    jenjangNama: r.kelas.jenjang.nama,
    kategori: r.sppKeringananKategori,
    catatan: r.sppKeringananCatatan,
    sppOverride: r.sppOverride ?? 0,
    sppNormal,
    gratis: r.sppOverride === 0,
  }));

  const perKategoriMap = new Map<string, number>();
  for (const l of list) {
    const key = l.kategori ?? "LAINNYA";
    perKategoriMap.set(key, (perKategoriMap.get(key) ?? 0) + 1);
  }
  const perKategori = Array.from(perKategoriMap.entries()).map(([kategori, jumlah]) => ({ kategori, jumlah }));

  return {
    list,
    perKategori,
    totalGratis: list.filter((l) => l.gratis).length,
    totalPotongan: list.filter((l) => !l.gratis).length,
    sppNormal,
  };
}

export async function generateNoKwitansi(tahunAjaranLabel: string) {
  const tahunPendek = tahunAjaranLabel.replace(/\D/g, "").slice(0, 4) || "0000";
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.transaksiPembayaran.count();
    const urut = String(count + 1 + attempt).padStart(5, "0");
    const noKwitansi = `KW-${tahunPendek}-${urut}`;
    const existing = await prisma.transaksiPembayaran.findUnique({ where: { noKwitansi } });
    if (!existing) return noKwitansi;
  }
  return `KW-${tahunPendek}-${Date.now()}`;
}
