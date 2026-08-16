import ExcelJS from "exceljs";
import { prisma } from "./prisma.ts";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
const CONTOH_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };

type ColumnDef = { header: string; width?: number; validationListRef?: string };

function buildSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ColumnDef[],
  contohRow: (string | number)[]
) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 22 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEADER_FILL;

  const contoh = ws.addRow(["Contoh: " + contohRow[0], ...contohRow.slice(1)]);
  contoh.font = { italic: true, color: { argb: "FF888888" } };
  contoh.fill = CONTOH_FILL;

  columns.forEach((c, i) => {
    if (!c.validationListRef) return;
    const colLetter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= 500; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [c.validationListRef],
        showErrorMessage: true,
        errorTitle: "Nilai tidak valid",
        error: "Pilih salah satu nilai dari daftar dropdown.",
      };
    }
  });

  return ws;
}

export async function buildImportTemplate(): Promise<Buffer> {
  const [tahunAjaranList, jenjangList] = await Promise.all([
    prisma.tahunAjaran.findMany({ orderBy: { tanggalMulai: "desc" }, select: { label: true } }),
    prisma.jenjang.findMany({ orderBy: { urutan: "asc" }, select: { nama: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistem SPP & DSP MTs";
  wb.created = new Date(0);

  const listSheet = wb.addWorksheet("_Daftar", { state: "veryHidden" });
  listSheet.getColumn(1).values = ["TahunAjaran", ...tahunAjaranList.map((t) => t.label)];
  listSheet.getColumn(2).values = ["Jenjang", ...jenjangList.map((j) => j.nama)];
  listSheet.getColumn(3).values = ["JenisKelamin", "L", "P"];
  listSheet.getColumn(4).values = ["StatusSiswa", "AKTIF", "LULUS", "PINDAH", "KELUAR"];
  listSheet.getColumn(5).values = ["KategoriKeringanan", "PRESTASI", "KURANG_MAMPU", "YATIM", "PIATU", "LAINNYA"];
  listSheet.getColumn(6).values = ["JenisPembayaran", "SPP", "DSP", "TUNGGAKAN_AWAL"];

  const ref = (col: string, count: number) => `_Daftar!$${col}$2:$${col}$${count + 1}`;

  buildSheet(
    wb,
    "TahunAjaran",
    [
      { header: "Label", width: 16 },
      { header: "Tanggal Mulai (YYYY-MM-DD)", width: 22 },
      { header: "Tanggal Selesai (YYYY-MM-DD)", width: 22 },
      { header: "SPP Bulanan", width: 14 },
    ],
    ["2025/2026", "2025-07-01", "2026-06-30", 150000]
  );

  buildSheet(
    wb,
    "Kelas",
    [
      { header: "Tahun Ajaran", width: 16, validationListRef: ref("A", tahunAjaranList.length) },
      { header: "Jenjang", width: 12, validationListRef: ref("B", jenjangList.length) },
      { header: "Nama Kelas", width: 16 },
      { header: "Wali Kelas", width: 22 },
    ],
    ["2025/2026", "IX", "IX A", "Budi Santoso"]
  );

  buildSheet(
    wb,
    "Siswa",
    [
      { header: "NIS", width: 14 },
      { header: "NISN", width: 14 },
      { header: "Nama Lengkap", width: 26 },
      { header: "Jenis Kelamin (L/P)", width: 12, validationListRef: ref("C", 2) },
      { header: "Nama Wali", width: 22 },
      { header: "No HP Wali", width: 16 },
      { header: "Email Wali", width: 22 },
      { header: "Status", width: 12, validationListRef: ref("D", 4) },
      { header: "Tahun Ajaran", width: 16, validationListRef: ref("A", tahunAjaranList.length) },
      { header: "Kelas", width: 14 },
      { header: "Bulan Mulai (1=Juli..12=Juni)", width: 14 },
      { header: "SPP Override (kosongkan jika normal)", width: 16 },
      { header: "Kategori Keringanan", width: 18, validationListRef: ref("E", 5) },
      { header: "Catatan Keringanan", width: 22 },
    ],
    [
      "1001", "0031001001", "Ahmad Fauzi", "L", "Slamet", "081234567890", "",
      "2025/2026", "IX A", 1, "", "", "",
    ]
  );

  buildSheet(
    wb,
    "TunggakanAwal",
    [
      { header: "NIS / NISN Siswa", width: 16 },
      { header: "Tahun Ajaran", width: 16, validationListRef: ref("A", tahunAjaranList.length) },
      { header: "Saldo Awal SPP", width: 16 },
      { header: "Catatan", width: 26 },
    ],
    ["1001", "2025/2026", 300000, "Tunggakan dari sekolah lama"]
  );

  buildSheet(
    wb,
    "DspTagihan",
    [
      { header: "NIS / NISN Siswa", width: 16 },
      { header: "Jumlah DSP", width: 16 },
      { header: "Tanggal Ditetapkan (YYYY-MM-DD, opsional)", width: 22 },
      { header: "Catatan", width: 26 },
    ],
    ["1001", 2500000, "2025-07-01", ""]
  );

  buildSheet(
    wb,
    "RiwayatPembayaran",
    [
      { header: "No Kwitansi", width: 18 },
      { header: "NIS / NISN Siswa", width: 16 },
      { header: "Tanggal (YYYY-MM-DD)", width: 16 },
      { header: "Jenis", width: 14, validationListRef: ref("F", 3) },
      { header: "Tahun Ajaran (wajib utk SPP)", width: 16, validationListRef: ref("A", tahunAjaranList.length) },
      { header: "Bulan SPP 1-12 (opsional, kosongkan jika bayar tidak pas 1 bulan)", width: 16 },
      { header: "Jumlah", width: 14 },
      { header: "Catatan", width: 22 },
    ],
    ["KW-LAMA-00001", "1001", "2025-08-05", "SPP", "2025/2026", 1, 150000, ""]
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
