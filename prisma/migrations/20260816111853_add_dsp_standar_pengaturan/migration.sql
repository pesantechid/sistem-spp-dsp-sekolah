-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pengaturan" (
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
    "batasTanggalBayar" INTEGER NOT NULL DEFAULT 10,
    "dspStandar" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_pengaturan" ("alamatSekolah", "batasTanggalBayar", "id", "jabatanPenandatangan", "kodeSuratPrefix", "kontakBendahara", "namaPenandatangan", "namaSekolah", "namaYayasan", "nipPenandatangan", "teleponSekolah") SELECT "alamatSekolah", "batasTanggalBayar", "id", "jabatanPenandatangan", "kodeSuratPrefix", "kontakBendahara", "namaPenandatangan", "namaSekolah", "namaYayasan", "nipPenandatangan", "teleponSekolah" FROM "pengaturan";
DROP TABLE "pengaturan";
ALTER TABLE "new_pengaturan" RENAME TO "pengaturan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
