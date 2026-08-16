import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.join(__dirname, "..", "..", "BUKU CATATAN SPP KELAS IX 2026-2027.xlsx");

const SHEET_NAMES = ["IX A", "IX B", "IX C", "IX D"];
const TARIF_SPP = 115000;
const NAMA_KOLOM = 2; // B
const TUNGGAKAN_SPP_KOLOM = 4; // D
const TUNGGAKAN_DSP_KOLOM = 5; // E
const BULAN_KOLOM_MULAI = 7; // G = Juli (bulanKe 1)
const BARIS_DATA_MULAI = 6;

function angka(cell: ExcelJS.Cell): number {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" ? r : 0;
  }
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function teks(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "result" in v) {
    return String((v as { result?: unknown }).result ?? "").trim();
  }
  return String(v).trim();
}

type BarisSiswa = {
  namaLengkap: string;
  kelasNama: string;
  tunggakanAwal: number;
  tunggakanDsp: number;
  bayarBulan: Map<number, number>;
};

function bacaSheetKelas(sheet: ExcelJS.Worksheet, kelasNama: string): BarisSiswa[] {
  const hasil: BarisSiswa[] = [];
  let baris = BARIS_DATA_MULAI;
  while (true) {
    const row = sheet.getRow(baris);
    const nama = teks(row.getCell(NAMA_KOLOM));
    if (!nama || nama.toUpperCase().startsWith("JUMLAH")) break;

    const bayarBulan = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      const nilai = angka(row.getCell(BULAN_KOLOM_MULAI + i));
      if (nilai > 0) bayarBulan.set(i + 1, nilai);
    }

    hasil.push({
      namaLengkap: nama,
      kelasNama,
      tunggakanAwal: angka(row.getCell(TUNGGAKAN_SPP_KOLOM)),
      tunggakanDsp: angka(row.getCell(TUNGGAKAN_DSP_KOLOM)),
      bayarBulan,
    });
    baris++;
  }
  return hasil;
}

async function bersihkanDataUjiCoba() {
  const siswaUjiCoba = await prisma.siswa.findFirst({ where: { namaLengkap: "Ahmad Fauzi" } });
  const kelasUjiCoba = await prisma.kelas.findFirst({ where: { nama: "IX A" }, include: { siswaKelas: true } });

  if (!siswaUjiCoba && !kelasUjiCoba) {
    console.log("Tidak ada data uji coba terdeteksi, lewati pembersihan.");
    return;
  }

  console.log("Membersihkan data uji coba...");

  if (siswaUjiCoba) {
    const transaksiList = await prisma.transaksiPembayaran.findMany({ where: { siswaId: siswaUjiCoba.id } });
    for (const t of transaksiList) {
      await prisma.transaksiPembayaranDetail.deleteMany({ where: { transaksiId: t.id } });
    }
    await prisma.transaksiPembayaran.deleteMany({ where: { siswaId: siswaUjiCoba.id } });
    await prisma.tunggakanAwal.deleteMany({ where: { siswaId: siswaUjiCoba.id } });
    await prisma.dspTagihan.deleteMany({ where: { siswaId: siswaUjiCoba.id } });
    await prisma.siswaKelas.deleteMany({ where: { siswaId: siswaUjiCoba.id } });
    await prisma.siswa.delete({ where: { id: siswaUjiCoba.id } });
    console.log(`  - Siswa uji coba "Ahmad Fauzi" (id=${siswaUjiCoba.id}) dihapus.`);
  }

  if (kelasUjiCoba) {
    const sisaSiswaKelas = await prisma.siswaKelas.count({ where: { kelasId: kelasUjiCoba.id } });
    if (sisaSiswaKelas === 0) {
      await prisma.kelas.delete({ where: { id: kelasUjiCoba.id } });
      console.log(`  - Kelas uji coba "IX A" (id=${kelasUjiCoba.id}) dihapus.`);
    } else {
      console.log(`  - Kelas "IX A" (id=${kelasUjiCoba.id}) masih punya ${sisaSiswaKelas} siswa, tidak dihapus.`);
    }
  }
}

async function main() {
  const tahunAjaran = await prisma.tahunAjaran.findFirst({ where: { isAktif: true } });
  if (!tahunAjaran) throw new Error("Tidak ada tahun ajaran aktif. Jalankan seed dulu.");

  const jenjangIX = await prisma.jenjang.findUnique({ where: { nama: "IX" } });
  if (!jenjangIX) throw new Error('Jenjang "IX" tidak ditemukan. Jalankan seed dulu.');

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Tidak ada user ADMIN. Jalankan seed dulu.");

  await bersihkanDataUjiCoba();

  const sudahAda = await prisma.siswaKelas.count({
    where: { tahunAjaranId: tahunAjaran.id, kelas: { jenjangId: jenjangIX.id } },
  });
  if (sudahAda > 0) {
    throw new Error(
      `Sudah ada ${sudahAda} data siswa Kelas IX di tahun ajaran ${tahunAjaran.label}. ` +
        "Migrasi dibatalkan untuk mencegah data ganda. Hapus manual dulu jika ingin impor ulang."
    );
  }

  console.log(`Membaca ${EXCEL_PATH} ...`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const semuaBaris: BarisSiswa[] = [];
  for (const namaSheet of SHEET_NAMES) {
    const sheet = workbook.getWorksheet(namaSheet);
    if (!sheet) throw new Error(`Sheet "${namaSheet}" tidak ditemukan di file Excel.`);
    const baris = bacaSheetKelas(sheet, namaSheet);
    console.log(`  Sheet "${namaSheet}": ${baris.length} siswa terbaca.`);
    semuaBaris.push(...baris);
  }

  const namaTerpakai = new Map<string, number>();
  for (const b of semuaBaris) {
    namaTerpakai.set(b.namaLengkap, (namaTerpakai.get(b.namaLengkap) ?? 0) + 1);
  }
  const namaDuplikat = [...namaTerpakai.entries()].filter(([, jumlah]) => jumlah > 1);
  const peringatan: string[] = [];
  for (const [nama, jumlah] of namaDuplikat) {
    peringatan.push(`Nama "${nama}" muncul ${jumlah}x — periksa manual, kemungkinan ada 2 siswa beda dengan nama sama, atau duplikasi data.`);
  }

  const kelasIdMap = new Map<string, number>();
  for (const namaSheet of SHEET_NAMES) {
    const kelas = await prisma.kelas.upsert({
      where: { tahunAjaranId_nama: { tahunAjaranId: tahunAjaran.id, nama: namaSheet } },
      update: {},
      create: { tahunAjaranId: tahunAjaran.id, jenjangId: jenjangIX.id, nama: namaSheet },
    });
    kelasIdMap.set(namaSheet, kelas.id);
  }
  console.log(`Kelas IX A-D siap untuk tahun ajaran ${tahunAjaran.label}.`);

  let totalTunggakanAwal = 0;
  let totalDsp = 0;
  let totalTransaksiMigrasi = 0;
  let totalNominalMigrasi = 0;
  let urutKwitansi = 1;
  const jumlahPerKelas = new Map<string, number>();

  for (const b of semuaBaris) {
    if (b.tunggakanAwal < 0 || b.tunggakanDsp < 0) {
      peringatan.push(`"${b.namaLengkap}" (${b.kelasNama}): nilai tunggakan negatif di sumber Excel (SPP=${b.tunggakanAwal}, DSP=${b.tunggakanDsp}).`);
    }
    for (const [bulanKe, nominal] of b.bayarBulan) {
      if (nominal !== TARIF_SPP) {
        peringatan.push(`"${b.namaLengkap}" (${b.kelasNama}): bulan ke-${bulanKe} tercatat Rp${nominal.toLocaleString("id-ID")}, beda dari tarif resmi Rp${TARIF_SPP.toLocaleString("id-ID")}.`);
      }
    }

    const siswa = await prisma.siswa.create({
      data: { namaLengkap: b.namaLengkap },
    });

    const kelasId = kelasIdMap.get(b.kelasNama)!;
    await prisma.siswaKelas.create({
      data: { siswaId: siswa.id, tahunAjaranId: tahunAjaran.id, kelasId, bulanMulai: 1, status: "AKTIF" },
    });

    if (b.tunggakanAwal > 0) {
      await prisma.tunggakanAwal.create({
        data: {
          siswaId: siswa.id,
          tahunAjaranId: tahunAjaran.id,
          saldoAwalSpp: b.tunggakanAwal,
          catatan: "Migrasi dari Excel BUKU CATATAN SPP KELAS IX 2026-2027.xlsx — estimasi saldo awal per 2026-08-16",
        },
      });
      totalTunggakanAwal += b.tunggakanAwal;
    }

    if (b.tunggakanDsp > 0) {
      await prisma.dspTagihan.create({
        data: {
          siswaId: siswa.id,
          jumlahDsp: b.tunggakanDsp,
          catatan: "Estimasi saldo DSP tersisa dari data Excel lama (bukan tagihan penuh) — migrasi 2026-08-16",
        },
      });
      totalDsp += b.tunggakanDsp;
    }

    if (b.bayarBulan.size > 0) {
      const noKwitansi = `MIG-${tahunAjaran.label.replace(/\D/g, "").slice(0, 4)}-${String(urutKwitansi).padStart(5, "0")}`;
      urutKwitansi++;
      const totalBayar = [...b.bayarBulan.values()].reduce((a, x) => a + x, 0);
      const transaksi = await prisma.transaksiPembayaran.create({
        data: {
          noKwitansi,
          siswaId: siswa.id,
          dicatatOlehId: admin.id,
          catatan: "Migrasi riwayat pembayaran dari Excel lama",
          detail: {
            create: [...b.bayarBulan.entries()].map(([bulanSpp, jumlah]) => ({
              jenis: "SPP" as const,
              tahunAjaranId: tahunAjaran.id,
              bulanSpp,
              jumlah,
            })),
          },
        },
      });
      totalTransaksiMigrasi++;
      totalNominalMigrasi += totalBayar;
      void transaksi;
    }

    jumlahPerKelas.set(b.kelasNama, (jumlahPerKelas.get(b.kelasNama) ?? 0) + 1);
  }

  console.log("\n=== RINGKASAN MIGRASI ===");
  for (const namaSheet of SHEET_NAMES) {
    console.log(`  ${namaSheet}: ${jumlahPerKelas.get(namaSheet) ?? 0} siswa`);
  }
  console.log(`  Total siswa: ${semuaBaris.length}`);
  console.log(`  Total Tunggakan Awal (SPP bawaan): Rp${totalTunggakanAwal.toLocaleString("id-ID")}`);
  console.log(`  Total Tunggakan DSP: Rp${totalDsp.toLocaleString("id-ID")}`);
  console.log(`  Transaksi migrasi dibuat: ${totalTransaksiMigrasi} (total Rp${totalNominalMigrasi.toLocaleString("id-ID")})`);

  if (peringatan.length > 0) {
    console.log(`\n=== PERINGATAN (${peringatan.length}) — periksa manual ===`);
    for (const p of peringatan) console.log(`  - ${p}`);
  } else {
    console.log("\nTidak ada peringatan data.");
  }
}

main()
  .catch((e) => {
    console.error("Migrasi gagal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
