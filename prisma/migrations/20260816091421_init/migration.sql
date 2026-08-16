-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tahun_ajaran" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "tanggalMulai" DATETIME NOT NULL,
    "tanggalSelesai" DATETIME NOT NULL,
    "isAktif" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "tarif" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tahunAjaranId" INTEGER NOT NULL,
    "sppBulanan" INTEGER NOT NULL,
    CONSTRAINT "tarif_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "tahun_ajaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jenjang" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "kelas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tahunAjaranId" INTEGER NOT NULL,
    "jenjangId" INTEGER NOT NULL,
    "nama" TEXT NOT NULL,
    "waliKelas" TEXT,
    CONSTRAINT "kelas_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "tahun_ajaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "kelas_jenjangId_fkey" FOREIGN KEY ("jenjangId") REFERENCES "jenjang" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "siswa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nis" TEXT,
    "nisn" TEXT,
    "namaLengkap" TEXT NOT NULL,
    "jenisKelamin" TEXT,
    "namaWali" TEXT,
    "noHpWali" TEXT,
    "emailWali" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "siswa_kelas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siswaId" INTEGER NOT NULL,
    "tahunAjaranId" INTEGER NOT NULL,
    "kelasId" INTEGER NOT NULL,
    "bulanMulai" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    CONSTRAINT "siswa_kelas_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "siswa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "siswa_kelas_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "tahun_ajaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "siswa_kelas_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "kelas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tunggakan_awal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siswaId" INTEGER NOT NULL,
    "tahunAjaranId" INTEGER NOT NULL,
    "saldoAwalSpp" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    CONSTRAINT "tunggakan_awal_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "siswa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tunggakan_awal_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "tahun_ajaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dsp_tagihan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siswaId" INTEGER NOT NULL,
    "jumlahDsp" INTEGER NOT NULL,
    "tanggalDitetapkan" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catatan" TEXT,
    CONSTRAINT "dsp_tagihan_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "siswa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transaksi_pembayaran" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noKwitansi" TEXT NOT NULL,
    "siswaId" INTEGER NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dicatatOlehId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "catatan" TEXT,
    CONSTRAINT "transaksi_pembayaran_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "siswa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transaksi_pembayaran_dicatatOlehId_fkey" FOREIGN KEY ("dicatatOlehId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transaksi_pembayaran_detail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transaksiId" INTEGER NOT NULL,
    "jenis" TEXT NOT NULL,
    "tahunAjaranId" INTEGER,
    "bulanSpp" INTEGER,
    "jumlah" INTEGER NOT NULL,
    CONSTRAINT "transaksi_pembayaran_detail_transaksiId_fkey" FOREIGN KEY ("transaksiId") REFERENCES "transaksi_pembayaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "surat_tagihan_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siswaId" INTEGER NOT NULL,
    "tahunAjaranId" INTEGER NOT NULL,
    "periodeBulan" INTEGER NOT NULL,
    "tanggalDibuat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dibuatOlehId" INTEGER NOT NULL,
    "metodeKirim" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tanggalKirim" DATETIME,
    "catatan" TEXT,
    CONSTRAINT "surat_tagihan_log_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "siswa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "surat_tagihan_log_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "tahun_ajaran" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "surat_tagihan_log_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "tahun_ajaran_label_key" ON "tahun_ajaran"("label");

-- CreateIndex
CREATE UNIQUE INDEX "tarif_tahunAjaranId_key" ON "tarif"("tahunAjaranId");

-- CreateIndex
CREATE UNIQUE INDEX "jenjang_nama_key" ON "jenjang"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "jenjang_urutan_key" ON "jenjang"("urutan");

-- CreateIndex
CREATE UNIQUE INDEX "kelas_tahunAjaranId_nama_key" ON "kelas"("tahunAjaranId", "nama");

-- CreateIndex
CREATE UNIQUE INDEX "siswa_nis_key" ON "siswa"("nis");

-- CreateIndex
CREATE UNIQUE INDEX "siswa_nisn_key" ON "siswa"("nisn");

-- CreateIndex
CREATE UNIQUE INDEX "siswa_kelas_siswaId_tahunAjaranId_key" ON "siswa_kelas"("siswaId", "tahunAjaranId");

-- CreateIndex
CREATE UNIQUE INDEX "tunggakan_awal_siswaId_tahunAjaranId_key" ON "tunggakan_awal"("siswaId", "tahunAjaranId");

-- CreateIndex
CREATE UNIQUE INDEX "transaksi_pembayaran_noKwitansi_key" ON "transaksi_pembayaran"("noKwitansi");
