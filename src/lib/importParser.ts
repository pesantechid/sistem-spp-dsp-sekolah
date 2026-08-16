import ExcelJS from "exceljs";
import { prisma } from "./prisma.ts";
import { formatRupiah } from "./tagihan.ts";

export type RowStatus = "valid" | "skip" | "error";
export type RowResult<T> = { row: number; status: RowStatus; message?: string; warning?: string; data?: T };

export type ParsedTahunAjaran = { label: string; tanggalMulai: Date; tanggalSelesai: Date; sppBulanan: number };
export type ParsedKelas = { tahunAjaranLabel: string; jenjangNama: string; nama: string; waliKelas: string | null };

type KategoriKeringanan = "PRESTASI" | "KURANG_MAMPU" | "YATIM" | "PIATU" | "LAINNYA";
type StatusSiswa = "AKTIF" | "LULUS" | "PINDAH" | "KELUAR";

export type ParsedSiswa = {
  nis: string | null;
  nisn: string | null;
  namaLengkap: string;
  jenisKelamin: string | null;
  namaWali: string | null;
  noHpWali: string | null;
  emailWali: string | null;
  status: StatusSiswa;
  tahunAjaranLabel: string;
  kelasNama: string;
  bulanMulai: number;
  sppOverride: number | null;
  sppKeringananKategori: KategoriKeringanan | null;
  sppKeringananCatatan: string | null;
};

export type ParsedTunggakanAwal = { identity: string; tahunAjaranLabel: string; saldoAwalSpp: number; catatan: string | null };
export type ParsedDsp = { identity: string; jumlahDsp: number; tanggalDitetapkan: Date | null; catatan: string | null };
export type ParsedPembayaranDetail = {
  jenis: "SPP" | "DSP" | "TUNGGAKAN_AWAL";
  tahunAjaranLabel: string | null;
  bulanSpp: number | null;
  jumlah: number;
};
export type ParsedPembayaran = { noKwitansi: string; identity: string; tanggal: Date; catatan: string | null; detail: ParsedPembayaranDetail[] };

export type ParsedImport = {
  tahunAjaran: RowResult<ParsedTahunAjaran>[];
  kelas: RowResult<ParsedKelas>[];
  siswa: RowResult<ParsedSiswa>[];
  tunggakanAwal: RowResult<ParsedTunggakanAwal>[];
  dspTagihan: RowResult<ParsedDsp>[];
  riwayatPembayaran: RowResult<ParsedPembayaran>[];
};

export const SHEET_LABELS: Record<keyof ParsedImport, string> = {
  tahunAjaran: "Tahun Ajaran",
  kelas: "Kelas",
  siswa: "Siswa",
  tunggakanAwal: "Tunggakan Awal",
  dspTagihan: "Tagihan DSP",
  riwayatPembayaran: "Riwayat Pembayaran",
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const anyV = v as { text?: unknown; result?: unknown };
    if ("text" in anyV) return String(anyV.text ?? "").trim();
    if ("result" in anyV) return String(anyV.result ?? "").trim();
  }
  return String(v).trim();
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  const t = cellText(v);
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cellDate(v: ExcelJS.CellValue): Date | null {
  if (v instanceof Date) return v;
  const t = cellText(v);
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T00:00:00` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readRows(ws: ExcelJS.Worksheet | undefined, expectedCols: number) {
  const out: { rowNumber: number; cells: ExcelJS.CellValue[] }[] = [];
  if (!ws) return out;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const first = cellText(row.getCell(1).value);
    if (!first) return;
    if (first.toLowerCase().startsWith("contoh")) return;
    const cells: ExcelJS.CellValue[] = [];
    for (let i = 1; i <= expectedCols; i++) cells.push(row.getCell(i).value);
    out.push({ rowNumber, cells });
  });
  return out;
}

const STATUS_VALID = new Set(["AKTIF", "LULUS", "PINDAH", "KELUAR"]);
const KATEGORI_VALID = new Set(["PRESTASI", "KURANG_MAMPU", "YATIM", "PIATU", "LAINNYA"]);

export async function parseAndValidate(buffer: Buffer): Promise<ParsedImport> {
  const wb = new ExcelJS.Workbook();
  // exceljs's bundled types declare a conflicting global `Buffer` shim; cast to work around it.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const [existingTA, existingJenjang, existingKelas, existingSiswa, existingTunggakan, existingKwitansi, existingTarif, existingSiswaKelas] = await Promise.all([
    prisma.tahunAjaran.findMany({ select: { label: true } }),
    prisma.jenjang.findMany({ select: { nama: true } }),
    prisma.kelas.findMany({ select: { nama: true, tahunAjaran: { select: { label: true } } } }),
    prisma.siswa.findMany({ select: { nis: true, nisn: true } }),
    prisma.tunggakanAwal.findMany({
      select: { siswa: { select: { nis: true, nisn: true } }, tahunAjaran: { select: { label: true } } },
    }),
    prisma.transaksiPembayaran.findMany({ select: { noKwitansi: true } }),
    prisma.tarif.findMany({ select: { sppBulanan: true, tahunAjaran: { select: { label: true } } } }),
    prisma.siswaKelas.findMany({
      select: { sppOverride: true, siswa: { select: { nis: true, nisn: true } }, tahunAjaran: { select: { label: true } } },
    }),
  ]);

  const knownTA = new Set(existingTA.map((t) => t.label));
  const knownJenjang = new Set(existingJenjang.map((j) => j.nama));
  const knownKelas = new Set(existingKelas.map((k) => `${k.tahunAjaran.label}|${k.nama}`));

  const knownSiswaIdentities = new Set<string>();
  for (const s of existingSiswa) {
    if (s.nis) knownSiswaIdentities.add(s.nis);
    if (s.nisn) knownSiswaIdentities.add(s.nisn);
  }

  const knownTunggakanPairs = new Set<string>();
  for (const t of existingTunggakan) {
    for (const key of [t.siswa.nis, t.siswa.nisn].filter((v): v is string => Boolean(v))) {
      knownTunggakanPairs.add(`${key}|${t.tahunAjaran.label}`);
    }
  }

  const knownKwitansi = new Set(existingKwitansi.map((k) => k.noKwitansi));

  // Tarif SPP per tahun ajaran + override per siswa, dipakai untuk memberi peringatan (bukan blokir)
  // kalau jumlah SPP di Riwayat Pembayaran tidak sama dengan tarif yang berlaku.
  const tarifByTA = new Map<string, number>();
  for (const t of existingTarif) tarifByTA.set(t.tahunAjaran.label, t.sppBulanan);

  const sppOverrideByKey = new Map<string, number>();
  for (const sk of existingSiswaKelas) {
    if (sk.sppOverride === null) continue;
    for (const id of [sk.siswa.nis, sk.siswa.nisn].filter((v): v is string => Boolean(v))) {
      sppOverrideByKey.set(`${id}|${sk.tahunAjaran.label}`, sk.sppOverride);
    }
  }

  // Sheet: TahunAjaran
  const tahunAjaran: RowResult<ParsedTahunAjaran>[] = [];
  for (const { rowNumber, cells } of readRows(wb.getWorksheet("TahunAjaran"), 4)) {
    const label = cellText(cells[0]);
    const tanggalMulai = cellDate(cells[1]);
    const tanggalSelesai = cellDate(cells[2]);
    const sppBulanan = cellNumber(cells[3]);

    if (!label || !tanggalMulai || !tanggalSelesai || sppBulanan === null) {
      tahunAjaran.push({ row: rowNumber, status: "error", message: "Label, tanggal mulai/selesai, dan SPP bulanan wajib diisi dengan format yang benar." });
      continue;
    }
    if (tanggalMulai >= tanggalSelesai) {
      tahunAjaran.push({ row: rowNumber, status: "error", message: "Tanggal mulai harus sebelum tanggal selesai." });
      continue;
    }
    if (knownTA.has(label)) {
      tahunAjaran.push({ row: rowNumber, status: "skip", message: `Tahun ajaran "${label}" sudah ada, dilewati.` });
      continue;
    }
    knownTA.add(label);
    tarifByTA.set(label, sppBulanan);
    tahunAjaran.push({ row: rowNumber, status: "valid", data: { label, tanggalMulai, tanggalSelesai, sppBulanan } });
  }

  // Sheet: Kelas
  const kelas: RowResult<ParsedKelas>[] = [];
  for (const { rowNumber, cells } of readRows(wb.getWorksheet("Kelas"), 4)) {
    const tahunAjaranLabel = cellText(cells[0]);
    const jenjangNama = cellText(cells[1]);
    const nama = cellText(cells[2]);
    const waliKelas = cellText(cells[3]) || null;

    if (!tahunAjaranLabel || !jenjangNama || !nama) {
      kelas.push({ row: rowNumber, status: "error", message: "Tahun ajaran, jenjang, dan nama kelas wajib diisi." });
      continue;
    }
    if (!knownTA.has(tahunAjaranLabel)) {
      kelas.push({ row: rowNumber, status: "error", message: `Tahun ajaran "${tahunAjaranLabel}" tidak ditemukan.` });
      continue;
    }
    if (!knownJenjang.has(jenjangNama)) {
      kelas.push({ row: rowNumber, status: "error", message: `Jenjang "${jenjangNama}" tidak ditemukan (jenjang harus sudah ada di sistem).` });
      continue;
    }
    const key = `${tahunAjaranLabel}|${nama}`;
    if (knownKelas.has(key)) {
      kelas.push({ row: rowNumber, status: "skip", message: `Kelas "${nama}" di ${tahunAjaranLabel} sudah ada, dilewati.` });
      continue;
    }
    knownKelas.add(key);
    kelas.push({ row: rowNumber, status: "valid", data: { tahunAjaranLabel, jenjangNama, nama, waliKelas } });
  }

  // Sheet: Siswa
  const siswa: RowResult<ParsedSiswa>[] = [];
  for (const { rowNumber, cells } of readRows(wb.getWorksheet("Siswa"), 14)) {
    const nis = cellText(cells[0]) || null;
    const nisn = cellText(cells[1]) || null;
    const namaLengkap = cellText(cells[2]);
    const jenisKelaminRaw = cellText(cells[3]).toUpperCase();
    const jenisKelamin = jenisKelaminRaw === "L" || jenisKelaminRaw === "P" ? jenisKelaminRaw : null;
    const namaWali = cellText(cells[4]) || null;
    const noHpWali = cellText(cells[5]) || null;
    const emailWali = cellText(cells[6]) || null;
    const statusRaw = cellText(cells[7]).toUpperCase();
    const status = (STATUS_VALID.has(statusRaw) ? statusRaw : "AKTIF") as StatusSiswa;
    const tahunAjaranLabel = cellText(cells[8]);
    const kelasNama = cellText(cells[9]);
    const bulanMulaiRaw = cellNumber(cells[10]);
    const bulanMulai = bulanMulaiRaw && bulanMulaiRaw >= 1 && bulanMulaiRaw <= 12 ? bulanMulaiRaw : 1;
    const sppOverride = cellNumber(cells[11]);
    const kategoriRaw = cellText(cells[12]).toUpperCase();
    const sppKeringananKategori = (KATEGORI_VALID.has(kategoriRaw) ? kategoriRaw : null) as KategoriKeringanan | null;
    const sppKeringananCatatan = cellText(cells[13]) || null;

    if (!namaLengkap || !tahunAjaranLabel || !kelasNama) {
      siswa.push({ row: rowNumber, status: "error", message: "Nama lengkap, tahun ajaran, dan kelas wajib diisi." });
      continue;
    }
    if (!knownTA.has(tahunAjaranLabel)) {
      siswa.push({ row: rowNumber, status: "error", message: `Tahun ajaran "${tahunAjaranLabel}" tidak ditemukan.` });
      continue;
    }
    if (!knownKelas.has(`${tahunAjaranLabel}|${kelasNama}`)) {
      siswa.push({ row: rowNumber, status: "error", message: `Kelas "${kelasNama}" di ${tahunAjaranLabel} tidak ditemukan.` });
      continue;
    }
    if (nis && knownSiswaIdentities.has(nis)) {
      siswa.push({ row: rowNumber, status: "skip", message: `Siswa dengan NIS "${nis}" sudah ada, dilewati.` });
      continue;
    }
    if (nisn && knownSiswaIdentities.has(nisn)) {
      siswa.push({ row: rowNumber, status: "skip", message: `Siswa dengan NISN "${nisn}" sudah ada, dilewati.` });
      continue;
    }
    if (nis) knownSiswaIdentities.add(nis);
    if (nisn) knownSiswaIdentities.add(nisn);
    if (sppOverride !== null) {
      for (const id of [nis, nisn].filter((v): v is string => Boolean(v))) {
        sppOverrideByKey.set(`${id}|${tahunAjaranLabel}`, sppOverride);
      }
    }
    siswa.push({
      row: rowNumber,
      status: "valid",
      data: { nis, nisn, namaLengkap, jenisKelamin, namaWali, noHpWali, emailWali, status, tahunAjaranLabel, kelasNama, bulanMulai, sppOverride, sppKeringananKategori, sppKeringananCatatan },
    });
  }

  // Sheet: TunggakanAwal
  const tunggakanAwal: RowResult<ParsedTunggakanAwal>[] = [];
  for (const { rowNumber, cells } of readRows(wb.getWorksheet("TunggakanAwal"), 4)) {
    const identity = cellText(cells[0]);
    const tahunAjaranLabel = cellText(cells[1]);
    const saldoAwalSpp = cellNumber(cells[2]);
    const catatan = cellText(cells[3]) || null;

    if (!identity || !tahunAjaranLabel || saldoAwalSpp === null) {
      tunggakanAwal.push({ row: rowNumber, status: "error", message: "NIS/NISN, tahun ajaran, dan saldo awal SPP wajib diisi." });
      continue;
    }
    if (!knownSiswaIdentities.has(identity)) {
      tunggakanAwal.push({ row: rowNumber, status: "error", message: `Siswa dengan NIS/NISN "${identity}" tidak ditemukan.` });
      continue;
    }
    if (!knownTA.has(tahunAjaranLabel)) {
      tunggakanAwal.push({ row: rowNumber, status: "error", message: `Tahun ajaran "${tahunAjaranLabel}" tidak ditemukan.` });
      continue;
    }
    const key = `${identity}|${tahunAjaranLabel}`;
    if (knownTunggakanPairs.has(key)) {
      tunggakanAwal.push({ row: rowNumber, status: "skip", message: `Tunggakan awal untuk siswa ini di ${tahunAjaranLabel} sudah ada, dilewati.` });
      continue;
    }
    knownTunggakanPairs.add(key);
    tunggakanAwal.push({ row: rowNumber, status: "valid", data: { identity, tahunAjaranLabel, saldoAwalSpp, catatan } });
  }

  // Sheet: DspTagihan (tidak ada unique constraint, tidak ada pengecekan duplikat)
  const dspTagihan: RowResult<ParsedDsp>[] = [];
  for (const { rowNumber, cells } of readRows(wb.getWorksheet("DspTagihan"), 4)) {
    const identity = cellText(cells[0]);
    const jumlahDsp = cellNumber(cells[1]);
    const tanggalDitetapkan = cellDate(cells[2]);
    const catatan = cellText(cells[3]) || null;

    if (!identity || jumlahDsp === null || jumlahDsp <= 0) {
      dspTagihan.push({ row: rowNumber, status: "error", message: "NIS/NISN dan jumlah DSP (lebih dari 0) wajib diisi." });
      continue;
    }
    if (!knownSiswaIdentities.has(identity)) {
      dspTagihan.push({ row: rowNumber, status: "error", message: `Siswa dengan NIS/NISN "${identity}" tidak ditemukan.` });
      continue;
    }
    dspTagihan.push({ row: rowNumber, status: "valid", data: { identity, jumlahDsp, tanggalDitetapkan, catatan } });
  }

  // Sheet: RiwayatPembayaran (baris dengan No. Kwitansi sama digabung jadi satu transaksi)
  const riwayatPembayaran: RowResult<ParsedPembayaran>[] = [];
  type Line = { rowNumber: number; identity: string; tanggal: Date | null; jenis: string; tahunAjaranLabel: string; bulanSpp: number | null; jumlah: number | null; catatan: string | null };
  const groups = new Map<string, { firstRow: number; lines: Line[] }>();
  const groupOrder: string[] = [];

  for (const { rowNumber, cells } of readRows(wb.getWorksheet("RiwayatPembayaran"), 8)) {
    const noKwitansi = cellText(cells[0]);
    if (!noKwitansi) {
      riwayatPembayaran.push({ row: rowNumber, status: "error", message: "No. Kwitansi wajib diisi." });
      continue;
    }
    const line: Line = {
      rowNumber,
      identity: cellText(cells[1]),
      tanggal: cellDate(cells[2]),
      jenis: cellText(cells[3]).toUpperCase(),
      tahunAjaranLabel: cellText(cells[4]),
      bulanSpp: cellNumber(cells[5]),
      jumlah: cellNumber(cells[6]),
      catatan: cellText(cells[7]) || null,
    };
    if (!groups.has(noKwitansi)) {
      groups.set(noKwitansi, { firstRow: rowNumber, lines: [] });
      groupOrder.push(noKwitansi);
    }
    groups.get(noKwitansi)!.lines.push(line);
  }

  for (const noKwitansi of groupOrder) {
    const g = groups.get(noKwitansi)!;
    if (knownKwitansi.has(noKwitansi)) {
      riwayatPembayaran.push({ row: g.firstRow, status: "skip", message: `No. Kwitansi "${noKwitansi}" sudah ada, dilewati.` });
      continue;
    }

    const errors: string[] = [];
    const identities = new Set(g.lines.map((l) => l.identity));
    if (identities.size !== 1 || !g.lines[0].identity) {
      errors.push("Semua baris dengan No. Kwitansi yang sama harus merujuk ke siswa (NIS/NISN) yang sama.");
    } else if (!knownSiswaIdentities.has(g.lines[0].identity)) {
      errors.push(`Siswa dengan NIS/NISN "${g.lines[0].identity}" tidak ditemukan.`);
    }

    const warnings: string[] = [];
    const detail: ParsedPembayaranDetail[] = [];
    let tanggal: Date | null = null;
    let catatan: string | null = null;
    for (const l of g.lines) {
      if (!tanggal && l.tanggal) tanggal = l.tanggal;
      if (!catatan && l.catatan) catatan = l.catatan;

      if (!["SPP", "DSP", "TUNGGAKAN_AWAL"].includes(l.jenis)) {
        errors.push(`Baris ${l.rowNumber}: jenis pembayaran "${l.jenis}" tidak valid.`);
        continue;
      }
      if (l.jumlah === null || l.jumlah <= 0) {
        errors.push(`Baris ${l.rowNumber}: jumlah wajib diisi dan lebih dari 0.`);
        continue;
      }
      if (l.jenis === "SPP") {
        if (!l.tahunAjaranLabel || !knownTA.has(l.tahunAjaranLabel)) {
          errors.push(`Baris ${l.rowNumber}: tahun ajaran wajib diisi dan valid untuk pembayaran SPP.`);
          continue;
        }
        if (l.bulanSpp !== null && (l.bulanSpp < 1 || l.bulanSpp > 12)) {
          errors.push(`Baris ${l.rowNumber}: bulan SPP harus antara 1-12, atau dikosongkan kalau tidak mewakili satu bulan tertentu.`);
          continue;
        }
        const rate = sppOverrideByKey.get(`${l.identity}|${l.tahunAjaranLabel}`) ?? tarifByTA.get(l.tahunAjaranLabel);
        if (l.bulanSpp !== null && rate !== undefined && l.jumlah !== rate) {
          warnings.push(
            `Baris ${l.rowNumber}: jumlah SPP ${formatRupiah(l.jumlah)} berbeda dari tarif bulanan ${formatRupiah(rate)} — akan tercatat sesuai nominal ini dan dihitung otomatis ke saldo SPP tahun ini.`
          );
        }
        detail.push({ jenis: "SPP", tahunAjaranLabel: l.tahunAjaranLabel, bulanSpp: l.bulanSpp, jumlah: l.jumlah });
      } else if (l.jenis === "TUNGGAKAN_AWAL") {
        detail.push({ jenis: "TUNGGAKAN_AWAL", tahunAjaranLabel: l.tahunAjaranLabel || null, bulanSpp: null, jumlah: l.jumlah });
      } else {
        detail.push({ jenis: "DSP", tahunAjaranLabel: null, bulanSpp: null, jumlah: l.jumlah });
      }
    }

    if (!tanggal) errors.push("Tanggal wajib diisi minimal di salah satu baris pada kwitansi ini.");

    if (errors.length > 0) {
      riwayatPembayaran.push({ row: g.firstRow, status: "error", message: errors.join(" ") });
      continue;
    }

    knownKwitansi.add(noKwitansi);
    riwayatPembayaran.push({
      row: g.firstRow,
      status: "valid",
      warning: warnings.length > 0 ? warnings.join(" ") : undefined,
      data: { noKwitansi, identity: g.lines[0].identity, tanggal: tanggal!, catatan, detail },
    });
  }

  return { tahunAjaran, kelas, siswa, tunggakanAwal, dspTagihan, riwayatPembayaran };
}

export type ImportSummary = Record<keyof ParsedImport, { created: number; skipped: number; error: number }>;

function countStatus(rows: RowResult<unknown>[]) {
  return {
    created: rows.filter((r) => r.status === "valid").length,
    skipped: rows.filter((r) => r.status === "skip").length,
    error: rows.filter((r) => r.status === "error").length,
  };
}

export async function commitImport(parsed: ParsedImport, userId: number): Promise<ImportSummary> {
  const taIdByLabel = new Map<string, number>();
  for (const t of await prisma.tahunAjaran.findMany({ select: { id: true, label: true } })) {
    taIdByLabel.set(t.label, t.id);
  }
  const jenjangIdByNama = new Map<string, number>();
  for (const j of await prisma.jenjang.findMany({ select: { id: true, nama: true } })) {
    jenjangIdByNama.set(j.nama, j.id);
  }
  const kelasIdByKey = new Map<string, number>();
  for (const k of await prisma.kelas.findMany({ select: { id: true, nama: true, tahunAjaran: { select: { label: true } } } })) {
    kelasIdByKey.set(`${k.tahunAjaran.label}|${k.nama}`, k.id);
  }
  const siswaIdByIdentity = new Map<string, number>();
  for (const s of await prisma.siswa.findMany({ select: { id: true, nis: true, nisn: true } })) {
    if (s.nis) siswaIdByIdentity.set(s.nis, s.id);
    if (s.nisn) siswaIdByIdentity.set(s.nisn, s.id);
  }

  for (const r of parsed.tahunAjaran) {
    if (r.status !== "valid" || !r.data) continue;
    const ta = await prisma.tahunAjaran.create({
      data: { label: r.data.label, tanggalMulai: r.data.tanggalMulai, tanggalSelesai: r.data.tanggalSelesai },
    });
    await prisma.tarif.create({ data: { tahunAjaranId: ta.id, sppBulanan: r.data.sppBulanan } });
    taIdByLabel.set(r.data.label, ta.id);
  }

  for (const r of parsed.kelas) {
    if (r.status !== "valid" || !r.data) continue;
    const tahunAjaranId = taIdByLabel.get(r.data.tahunAjaranLabel);
    const jenjangId = jenjangIdByNama.get(r.data.jenjangNama);
    if (!tahunAjaranId || !jenjangId) continue;
    const k = await prisma.kelas.create({
      data: { tahunAjaranId, jenjangId, nama: r.data.nama, waliKelas: r.data.waliKelas },
    });
    kelasIdByKey.set(`${r.data.tahunAjaranLabel}|${r.data.nama}`, k.id);
  }

  for (const r of parsed.siswa) {
    if (r.status !== "valid" || !r.data) continue;
    const tahunAjaranId = taIdByLabel.get(r.data.tahunAjaranLabel);
    const kelasId = kelasIdByKey.get(`${r.data.tahunAjaranLabel}|${r.data.kelasNama}`);
    if (!tahunAjaranId || !kelasId) continue;

    const siswa = await prisma.siswa.create({
      data: {
        nis: r.data.nis,
        nisn: r.data.nisn,
        namaLengkap: r.data.namaLengkap,
        jenisKelamin: r.data.jenisKelamin,
        namaWali: r.data.namaWali,
        noHpWali: r.data.noHpWali,
        emailWali: r.data.emailWali,
        status: r.data.status,
      },
    });
    await prisma.siswaKelas.create({
      data: {
        siswaId: siswa.id,
        tahunAjaranId,
        kelasId,
        bulanMulai: r.data.bulanMulai,
        sppOverride: r.data.sppOverride,
        sppKeringananKategori: r.data.sppKeringananKategori,
        sppKeringananCatatan: r.data.sppKeringananCatatan,
      },
    });
    if (r.data.nis) siswaIdByIdentity.set(r.data.nis, siswa.id);
    if (r.data.nisn) siswaIdByIdentity.set(r.data.nisn, siswa.id);
  }

  for (const r of parsed.tunggakanAwal) {
    if (r.status !== "valid" || !r.data) continue;
    const siswaId = siswaIdByIdentity.get(r.data.identity);
    const tahunAjaranId = taIdByLabel.get(r.data.tahunAjaranLabel);
    if (!siswaId || !tahunAjaranId) continue;
    await prisma.tunggakanAwal.create({
      data: { siswaId, tahunAjaranId, saldoAwalSpp: r.data.saldoAwalSpp, catatan: r.data.catatan },
    });
  }

  for (const r of parsed.dspTagihan) {
    if (r.status !== "valid" || !r.data) continue;
    const siswaId = siswaIdByIdentity.get(r.data.identity);
    if (!siswaId) continue;
    await prisma.dspTagihan.create({
      data: {
        siswaId,
        jumlahDsp: r.data.jumlahDsp,
        ...(r.data.tanggalDitetapkan ? { tanggalDitetapkan: r.data.tanggalDitetapkan } : {}),
        catatan: r.data.catatan,
      },
    });
  }

  for (const r of parsed.riwayatPembayaran) {
    if (r.status !== "valid" || !r.data) continue;
    const siswaId = siswaIdByIdentity.get(r.data.identity);
    if (!siswaId) continue;
    const details = r.data.detail.map((d) => ({
      jenis: d.jenis,
      tahunAjaranId: d.tahunAjaranLabel ? taIdByLabel.get(d.tahunAjaranLabel) ?? null : null,
      bulanSpp: d.bulanSpp,
      jumlah: d.jumlah,
    }));
    await prisma.transaksiPembayaran.create({
      data: {
        noKwitansi: r.data.noKwitansi,
        siswaId,
        tanggal: r.data.tanggal,
        dicatatOlehId: userId,
        catatan: r.data.catatan ? `[Diimpor] ${r.data.catatan}` : "[Diimpor]",
        detail: { create: details },
      },
    });
  }

  return {
    tahunAjaran: countStatus(parsed.tahunAjaran),
    kelas: countStatus(parsed.kelas),
    siswa: countStatus(parsed.siswa),
    tunggakanAwal: countStatus(parsed.tunggakanAwal),
    dspTagihan: countStatus(parsed.dspTagihan),
    riwayatPembayaran: countStatus(parsed.riwayatPembayaran),
  };
}
