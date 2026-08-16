-- CreateTable
CREATE TABLE "pengaturan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "namaYayasan" TEXT,
    "namaSekolah" TEXT NOT NULL DEFAULT '',
    "alamatSekolah" TEXT,
    "teleponSekolah" TEXT,
    "kodeSuratPrefix" TEXT,
    "namaPenandatangan" TEXT,
    "jabatanPenandatangan" TEXT NOT NULL DEFAULT 'Kepala Sekolah',
    "nipPenandatangan" TEXT,
    "kontakBendahara" TEXT,
    "batasTanggalBayar" INTEGER NOT NULL DEFAULT 10
);
