import { prisma } from "./prisma.ts";
import { getStatusSpp, getStatusTunggakanAwal, getStatusDsp } from "./tagihan.ts";

const NAMA_BULAN_KALENDER = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function bulanKalenderDariBulanKe(bulanKe: number) {
  return ((bulanKe - 1 + 6) % 12) + 1; // bulanKe 1 (Juli) -> kalender 7 (Juli)
}

export function getBulanKalender(tahunMulaiAjaran: Date, bulanKe: number) {
  const bulanKalender = bulanKalenderDariBulanKe(bulanKe);
  const tahunMulai = tahunMulaiAjaran.getFullYear();
  const tahun = bulanKe <= 6 ? tahunMulai : tahunMulai + 1;
  return { nama: NAMA_BULAN_KALENDER[bulanKalender - 1], tahun };
}

export function romawi(bulanKalender1to12: number) {
  return ROMAWI[bulanKalender1to12 - 1] ?? String(bulanKalender1to12);
}

export async function generateNoSurat(kodeSuratPrefix: string | null | undefined, tanggal: Date) {
  const jumlah = await prisma.suratTagihanLog.findMany({
    where: { noSurat: { not: null } },
    distinct: ["noSurat"],
    select: { noSurat: true },
  });
  const urut = jumlah.length + 1;
  const prefix = kodeSuratPrefix?.trim() || "MTs";
  return `${String(urut).padStart(3, "0")}/${prefix}/${romawi(tanggal.getMonth() + 1)}/${tanggal.getFullYear()}`;
}

export async function getDataSuratSiswa(siswaId: number, tahunAjaranId: number) {
  const siswaKelas = await prisma.siswaKelas.findUnique({
    where: { siswaId_tahunAjaranId: { siswaId, tahunAjaranId } },
    include: { siswa: true, kelas: { include: { jenjang: true } } },
  });
  if (!siswaKelas) return null;

  const [statusSpp, statusTunggakan, statusDsp] = await Promise.all([
    getStatusSpp(siswaId, tahunAjaranId),
    getStatusTunggakanAwal(siswaId, tahunAjaranId),
    getStatusDsp(siswaId),
  ]);

  const tunggakanSpp = statusSpp.sisa;
  const totalTunggakan = tunggakanSpp + statusTunggakan.sisa + statusDsp.sisa;

  return {
    siswa: siswaKelas.siswa,
    kelasNama: siswaKelas.kelas.nama,
    jenjangNama: siswaKelas.kelas.jenjang.nama,
    jumlahBulanBelumBayar: statusSpp.jumlahBelumBayar,
    tunggakanSpp,
    sisaTunggakanAwal: statusTunggakan.sisa,
    sisaDsp: statusDsp.sisa,
    totalTunggakan,
  };
}
