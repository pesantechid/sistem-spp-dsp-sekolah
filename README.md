# Sistem Manajemen SPP & DSP MTs

Aplikasi web internal untuk mencatat dan memantau pembayaran SPP (uang
sekolah bulanan), DSP (uang gedung/pembangunan), dan tunggakan awal
siswa di sebuah MTs (madrasah tsanawiyah). Dibuat untuk dijalankan
**lokal/offline** di satu komputer (server) dan diakses dari komputer
lain di jaringan yang sama (LAN) lewat browser.

Ditulis dengan Node.js + Express + EJS (server-rendered, tanpa
framework frontend) dan Prisma ORM di atas SQLite — tidak butuh
database server terpisah, cukup satu file `dev.db`.

## Daftar Isi

- [Fitur](#fitur)
- [Peran Pengguna (Role)](#peran-pengguna-role)
- [Teknologi](#teknologi)
- [Kenapa SQLite (bukan MySQL/MariaDB)?](#kenapa-sqlite-bukan-mysqlmariadb)
- [Instalasi & Setup Pertama Kali](#instalasi--setup-pertama-kali)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Panduan Penggunaan](#panduan-penggunaan)
  - [1. Tahun Ajaran & Tarif](#1-tahun-ajaran--tarif)
  - [2. Kelas & Siswa](#2-kelas--siswa)
  - [3. Pembayaran SPP/DSP/Tunggakan Awal](#3-pembayaran-sppdsptunggakan-awal)
  - [4. Laporan Tunggakan & Keringanan](#4-laporan-tunggakan--keringanan)
  - [5. Surat Tagihan](#5-surat-tagihan)
  - [6. Import Data dari Excel](#6-import-data-dari-excel)
  - [7. Pengaturan Aplikasi](#7-pengaturan-aplikasi)
  - [8. Kelola User](#8-kelola-user)
- [Model Perhitungan SPP (Ledger)](#model-perhitungan-spp-ledger)
- [Struktur Data (ringkas)](#struktur-data-ringkas)
- [Backup & Reset Database](#backup--reset-database)
- [Struktur Proyek](#struktur-proyek)

## Fitur

- **Data master**: Tahun Ajaran (dengan tarif SPP per tahun), Jenjang
  (VII/VIII/IX), Kelas per tahun ajaran, dan data Siswa (biodata, wali,
  status aktif/lulus/pindah/keluar, penempatan kelas per tahun ajaran).
- **Pencatatan pembayaran** SPP, DSP, dan Tunggakan Awal dalam satu
  transaksi (satu kwitansi bisa berisi beberapa jenis pembayaran
  sekaligus), dengan nomor kwitansi otomatis dan cetak kwitansi.
- **Pembatalan & catat ulang transaksi** (ADMIN) — transaksi salah bisa
  dibatalkan (tidak dihapus, tetap tercatat sebagai riwayat) dan
  langsung diarahkan mencatat transaksi pengganti.
- **Keringanan/potongan SPP per siswa** (beasiswa prestasi, kurang
  mampu, yatim/piatu, lainnya), termasuk opsi gratis 100%.
- **Laporan tunggakan** per kelas/jenjang/tahun ajaran, termasuk export
  ke CSV, plus laporan rekap siswa penerima keringanan SPP.
- **Surat tagihan** — generate & cetak massal surat tagihan SPP untuk
  banyak siswa sekaligus (per kelas/jenjang/periode bulan), dengan
  riwayat surat yang pernah dibuat.
- **Import data massal dari Excel** — satu file template berisi 6
  sheet (Tahun Ajaran, Kelas, Siswa, Tunggakan Awal, DSP Tagihan,
  Riwayat Pembayaran) untuk migrasi data dari sistem lama, lengkap
  dengan tahap **preview** (validasi tanpa menyentuh database, dengan
  peringatan non-blocking) sebelum **konfirmasi commit**.
- **Pengaturan aplikasi** — nama sekolah/yayasan, alamat, kontak,
  logo, tanda tangan digital, kop surat, nomor surat, batas tanggal
  bayar, dan nominal DSP standar untuk siswa baru — semua bisa
  dikustomisasi tanpa ubah kode.
- **Manajemen user & role** (ADMIN, STAFF, VIEWER) dengan sesi login
  berbasis cookie (tersimpan di `sessions.db`, bertahan 7 hari).

## Peran Pengguna (Role)

| Peran      | Akses                                                                                                   |
|------------|-----------------------------------------------------------------------------------------------------------|
| **VIEWER** | Hanya lihat: dashboard, daftar kelas & siswa, laporan tunggakan/keringanan (+ export CSV), riwayat pembayaran, cetak/riwayat surat tagihan. Tidak bisa input apa pun. |
| **STAFF**  | Semua akses VIEWER, ditambah: input Kelas & Siswa baru, catat pembayaran baru, kelola DSP & keringanan SPP per siswa, pindah kelas, isi tunggakan awal, generate surat tagihan, dan import data Excel. |
| **ADMIN**  | Semua akses STAFF, ditambah: batalkan/ganti-catat-ulang transaksi, hapus data DSP, kelola Tahun Ajaran (termasuk set tahun ajaran aktif), kelola Pengaturan aplikasi (logo/TTD/kop surat/dll), dan kelola User (buat/edit user & role). |

## Teknologi

- **Runtime**: Node.js + `tsx` (jalankan TypeScript langsung, tanpa
  build step terpisah)
- **Web framework**: Express 5
- **View engine**: EJS (server-rendered HTML)
- **ORM**: Prisma 7 (`@prisma/client` + `@prisma/adapter-better-sqlite3`)
- **Database**: SQLite (file lokal `dev.db`, tidak perlu database
  server)
- **Autentikasi**: session cookie (`express-session` + `connect-sqlite3`,
  disimpan di `sessions.db`) dan password di-hash dengan `bcrypt`
- **Excel import/export**: `exceljs`
- **Upload file** (logo/TTD/kop surat/import): `multer`

## Kenapa SQLite (bukan MySQL/MariaDB)?

Tidak perlu install MySQL/MariaDB (atau database server apa pun) untuk
menjalankan aplikasi ini. SQLite bukan proses server terpisah — dia
**embedded**, cukup satu file (`dev.db`) yang diakses langsung oleh
proses Node lewat native binding `@prisma/adapter-better-sqlite3` yang
sudah ter-install otomatis via `npm install`. Tidak ada service
tambahan yang perlu dijalankan/dimonitor, tidak ada user/password DB
terpisah untuk dikelola.

**Cukup kuat untuk skala satu MTs?** Ya. Perkiraan kasar untuk 3
jenjang (VII/VIII/IX), ±300–900 siswa aktif per tahun, dan riwayat
10+ tahun ajaran: baris terbanyak ada di tabel transaksi pembayaran
SPP bulanan, sekitar 900 siswa × 12 bulan × 10 tahun ≈ **~108.000
baris** — jauh di bawah kapasitas praktis SQLite yang biasa menangani
jutaan-puluhan juta baris tanpa masalah performa. Ukuran file `dev.db`
realistisnya tetap di kisaran puluhan-ratusan MB, bukan GB, meski
dipakai bertahun-tahun.

Kekhawatiran umum soal SQLite adalah **concurrent write** dari banyak
proses berbeda ke file yang sama. Ini tidak relevan di arsitektur
aplikasi ini: semua request dari komputer manapun (LAN atau nanti
internet) masuk ke **satu proses Express**, dan `better-sqlite3`
bersifat sinkron sehingga penulisan otomatis serial per proses —
selama hanya **satu instance server** yang berjalan, tidak ada risiko
konflik/corruption walau banyak staf input bersamaan.

### Kalau nanti di-deploy ke server & diakses online (bukan cuma LAN)

Selama aplikasi tetap berjalan sebagai **satu proses Node** (satu
VPS/server, tidak di-scale jadi banyak instance/container paralel
yang berbagi file `dev.db` yang sama), SQLite **tetap valid** dan
tidak perlu diganti — alasan performa/kapasitas di atas tidak berubah
hanya karena diakses lewat internet. Yang perlu ditambah justru bukan
soal database, tapi soal keamanan & keandalan akses publik:

- **HTTPS wajib** — taruh di belakang reverse proxy (Nginx/Caddy) dan
  pasang sertifikat TLS (mis. Let's Encrypt/Caddy otomatis), jangan
  ekspos port Node langsung ke internet.
- **`SESSION_SECRET` harus diganti** dari nilai default di kode
  (`ganti-secret-ini-di-env-production`) dengan string acak yang kuat,
  dan pertimbangkan set cookie session ke `secure: true` (butuh HTTPS
  aktif) di `src/index.ts`.
- **Batasi akses** kalau memang tidak perlu benar-benar publik (mis.
  firewall/VPN/IP allowlist), karena aplikasi ini menyimpan data
  pribadi siswa & wali.
- **Backup jadi lebih penting** — karena server bisa diakses dari
  luar, jadwalkan backup rutin file `dev.db` ke lokasi terpisah (lihat
  [Backup & Reset Database](#backup--reset-database)), idealnya
  otomatis (cron) dan tersimpan offsite, bukan cuma sesekali manual.
- **Jangan jalankan lebih dari satu instance/proses** yang menunjuk ke
  file `dev.db` yang sama (mis. hindari mode cluster/PM2 dengan banyak
  worker, atau banyak container replika) — itu satu-satunya pola yang
  benar-benar bermasalah untuk SQLite. Kalau butuh scale ke banyak
  instance paralel di kemudian hari, itu titik yang wajar untuk pindah
  ke database server (mis. Postgres/MySQL terkelola) — Prisma
  membuat perpindahan ini relatif terkontain (tinggal ganti
  datasource/adapter), tapi ini baru relevan kalau skala kebutuhan
  jauh melebihi satu MTs.

## Instalasi & Setup Pertama Kali

Prasyarat: Node.js (disarankan versi 22 LTS ke atas) sudah terpasang
di komputer server. Internet hanya dibutuhkan **sekali** saat
`npm install` (untuk unduh dependency) — setelah itu aplikasi berjalan
sepenuhnya offline karena database-nya file SQLite lokal.

```bash
# 1. Install dependency
npm install

# 2. Siapkan file .env
cp .env.example .env
# lalu edit .env: minimal ganti SESSION_SECRET, dan isi
# SEED_ADMIN_USERNAME/SEED_ADMIN_PASSWORD kalau tidak mau pakai default

# 3. Generate Prisma Client (wajib setelah clone baru, karena folder
#    generated/prisma tidak ikut di-commit)
npx prisma generate

# 4. Bangun schema database dari migration yang sudah ada
npx prisma migrate deploy

# 5. Isi data awal (jenjang VII/VIII/IX, 1 tahun ajaran contoh + tarif,
#    dan 1 user ADMIN)
npm run seed
```

Setelah seed selesai, akan muncul di terminal kredensial admin yang
dibuat (default `admin` / `admin123` kalau env `SEED_ADMIN_*` tidak
diisi). **Segera login dan ganti password admin** lewat menu
**Kelola User** (tidak ada halaman "ganti password saya sendiri" —
ADMIN mengedit akunnya sendiri lewat menu Kelola User yang sama
dengan mengedit user lain).

> **Memulai dari database bersih di laptop operasional** (mis. data
> uji coba selama development ingin dibuang sebelum dipakai sekolah
> beneran): hapus file `dev.db` (dan `sessions.db` kalau mau semua
> orang logout) di root project, lalu ulangi langkah 4–5 di atas.
> Ini murni operasi file lokal, tidak butuh internet.

## Menjalankan Aplikasi

```bash
# Mode development (auto-restart saat file berubah)
npm run dev

# Mode produksi/operasional biasa
npm start
```

Server berjalan di `http://localhost:3000` (port bisa diubah lewat
env `PORT`). Untuk diakses dari komputer/HP lain di jaringan yang
sama, gunakan `http://<IP-komputer-server-ini>:3000` — pastikan
firewall komputer server mengizinkan koneksi masuk ke port tersebut.

## Panduan Penggunaan

### 1. Tahun Ajaran & Tarif

Menu **Tahun Ajaran** (ADMIN untuk tambah/edit/set aktif). Setiap
tahun ajaran punya satu **tarif SPP bulanan** (mis. Rp115.000). Hanya
boleh ada **satu tahun ajaran aktif** pada satu waktu — status aktif
ini yang dipakai di seluruh sistem (form pembayaran, laporan
tunggakan, surat tagihan) untuk menentukan "tahun berjalan".

Ganti tahun ajaran aktif setiap pergantian tahun ajaran baru lewat
tombol **Set Aktif** di daftar Tahun Ajaran.

### 2. Kelas & Siswa

- **Kelas** dibuat per tahun ajaran (mis. "IX A" di tahun 2026/2027),
  terhubung ke Jenjang (VII/VIII/IX) dan opsional nama wali kelas.
- **Siswa** punya biodata (NIS/NISN, nama, jenis kelamin, data wali)
  dan status (AKTIF/LULUS/PINDAH/KELUAR). Penempatan siswa ke kelas
  dilakukan **per tahun ajaran** lewat field `SiswaKelas`, termasuk
  `Bulan Mulai` (1=Juli s.d. 12=Juni) untuk siswa yang masuk di
  tengah tahun ajaran — bulan-bulan sebelum siswa masuk otomatis
  tidak ditagih SPP.
- Di halaman detail siswa bisa: kelola **DSP** (tagihan uang gedung),
  atur **keringanan SPP** (potongan/gratis), pindah kelas antar tahun
  ajaran, dan isi **tunggakan awal** (saldo bawaan sebelum sistem ini
  dipakai).
- Menu **Export** di daftar siswa mengunduh data siswa dalam format
  CSV.

### 3. Pembayaran SPP/DSP/Tunggakan Awal

Menu **Pembayaran** → **Catat Pembayaran Baru** (ADMIN/STAFF): cari
siswa, sistem menampilkan sisa tagihan berjalan untuk SPP, DSP, dan
Tunggakan Awal siswa tersebut. Petugas mengisi nominal yang benar-
benar dibayar untuk masing-masing jenis (boleh sebagian/kurang dari
tagihan penuh, boleh juga menyicil di transaksi berikutnya — lihat
[Model Perhitungan SPP](#model-perhitungan-spp-ledger)). Satu kali
submit bisa mencatat beberapa jenis pembayaran sekaligus dalam satu
kwitansi.

Setelah tersimpan, kwitansi bisa langsung dicetak (`Cetak` di halaman
detail transaksi). Kalau ada kesalahan input, ADMIN bisa:
- **Batalkan** — transaksi ditandai batal, tidak dihapus dari riwayat.
- **Batalkan & Catat Ulang** — otomatis membatalkan transaksi lama
  lalu membuka form pembayaran baru untuk siswa yang sama.

Menu **Export** di daftar pembayaran mengunduh riwayat transaksi
dalam format CSV.

### 4. Laporan Tunggakan & Keringanan

Menu **Laporan → Tunggakan**: rekap siswa yang masih punya sisa
tagihan (SPP + tunggakan awal + DSP), bisa difilter per
jenjang/kelas, dan ada ringkasan per kelas. Bisa di-export ke CSV
untuk ditindaklanjuti (mis. dikirim ke bendahara/wali kelas).

Menu **Laporan → Keringanan SPP**: daftar siswa yang mendapat
potongan/gratis SPP beserta kategorinya, dengan ringkasan jumlah per
kategori.

### 5. Surat Tagihan

Menu **Surat Tagihan**: pilih siswa (bisa banyak sekaligus, difilter
per kelas/jenjang, dicari nama) dan periode bulan penagihan, lalu
**Generate** — sistem membuat nomor surat otomatis (format bisa
dikustomisasi lewat Pengaturan) dan menampilkan halaman cetak siap
print untuk semua siswa terpilih sekaligus. Setiap surat yang dibuat
tercatat di **Riwayat Surat** (bisa difilter per periode bulan).

### 6. Import Data dari Excel

Menu **Import Data** (ADMIN/STAFF) — dipakai terutama untuk migrasi
data dari sistem lama atau input data massal awal:

1. Unduh **Template** (`.xlsx`) — berisi 6 sheet: `TahunAjaran`,
   `Kelas`, `Siswa`, `TunggakanAwal`, `DspTagihan`,
   `RiwayatPembayaran`. Setiap sheet punya baris "Contoh" dan dropdown
   validasi untuk kolom yang perlu nilai baku (Tahun Ajaran, Jenjang,
   Jenis Kelamin, Status, dll).
2. Isi sheet yang relevan (boleh sebagian saja, sheet lain dikosongkan/
   dihapus barisnya).
3. Upload lewat **Preview** — sistem memvalidasi setiap baris tanpa
   menulis apa pun ke database, menampilkan jumlah baris valid/
   dilewati/error per sheet, plus **peringatan non-blocking** (mis.
   nominal SPP di baris `RiwayatPembayaran` berbeda dari tarif bulanan
   — baris tetap bisa diproses, tidak dianggap error, karena nominal
   yang tidak pas satu bulan penuh memang wajar untuk data migrasi/
   pembayaran parsial).
4. Kalau hasil preview sudah sesuai, klik **Konfirmasi** untuk benar-
   benar menulis data ke database. Hasil akhir (jumlah baris berhasil
   per sheet) ditampilkan di halaman terakhir.

Catatan penting untuk sheet `RiwayatPembayaran`:
- Baris dengan `No Kwitansi` yang sama digabung jadi satu transaksi
  dengan beberapa detail pembayaran (mis. SPP + DSP dalam satu
  kwitansi lama).
- Kolom **Bulan SPP** bersifat **opsional** — kosongkan kalau nominal
  pembayaran tidak mewakili tepat satu bulan SPP (mis. pembayaran
  gabungan/cicilan dari sistem lama); saldo akan tetap terhitung
  otomatis ke ledger SPP siswa tersebut. Isi kalau memang mewakili
  satu bulan spesifik (label historis, akan muncul di kwitansi sebagai
  "SPP Bulan X").

### 7. Pengaturan Aplikasi

Menu **Pengaturan** (ADMIN): nama aplikasi & deskripsi (tampil di
judul tab & topbar), identitas sekolah/yayasan untuk kop surat &
kwitansi, kontak bendahara, batas tanggal jatuh tempo bayar per bulan,
nominal DSP standar untuk siswa baru, serta upload **logo**, **tanda
tangan digital** penandatangan surat, dan **kop surat** (gambar utuh,
menggantikan kop teks kalau diisi). File yang diunggah (JPG/PNG/WEBP,
maks 2MB) disimpan di `public/uploads/`.

### 8. Kelola User

Menu **Kelola User** (ADMIN saja): tambah user baru, edit
nama/username/role/status aktif, dan reset password user (termasuk
akun sendiri — lihat catatan di [Instalasi](#instalasi--setup-pertama-kali)).
User yang dinonaktifkan (`aktif = false`) tidak bisa login lagi tanpa
perlu dihapus datanya.

## Model Perhitungan SPP (Ledger)

Sejak redesign terbaru, status pembayaran SPP **tidak lagi**
dihitung dari checklist "bulan mana yang sudah dibayar", melainkan
dari **saldo/ledger berbasis nominal** — mirip cara Tunggakan Awal dan
DSP dihitung:

```
totalBulanBerlaku = 12 - bulanMulai + 1
sppRate           = sppOverride siswa (kalau ada keringanan) atau tarif SPP tahun berjalan
totalTagihan       = totalBulanBerlaku × sppRate
totalDibayar        = jumlah SEMUA pembayaran SPP siswa itu di tahun ajaran ini (dijumlahkan)
sisa                = totalTagihan − totalDibayar
```

Implikasinya:
- Pembayaran boleh **kurang** dari satu bulan SPP (mis. bayar
  Rp90.000 dari tarif Rp115.000) — tercatat apa adanya, tidak
  dianggap "lunas satu bulan" secara keliru. Jumlah bulan yang
  dianggap lunas dihitung dari `⌊totalDibayar ÷ sppRate⌋` (FIFO —
  bulan-bulan paling awal yang dianggap lunas duluan).
- Pembayaran boleh **menyicil** — beberapa kali transaksi kecil akan
  terus terakumulasi ke saldo yang sama sampai satu bulan penuh
  terpenuhi.
- Pembayaran tidak bisa melebihi sisa tagihan tahun ajaran berjalan
  (tidak nyicil otomatis ke tahun ajaran berikutnya).
- Field "Bulan SPP" pada catatan pembayaran sekarang murni **label
  historis/opsional** (dipakai di teks kwitansi kalau diisi), bukan
  lagi dasar perhitungan status lunas/belum.

## Struktur Data (ringkas)

Lihat `prisma/schema.prisma` untuk definisi lengkap. Model utama:

| Model                        | Fungsi                                                              |
|-------------------------------|----------------------------------------------------------------------|
| `User`                        | Akun login (ADMIN/STAFF/VIEWER)                                     |
| `TahunAjaran` / `Tarif`       | Tahun ajaran + tarif SPP per tahun                                   |
| `Jenjang` / `Kelas`           | Jenjang (VII/VIII/IX) & kelas per tahun ajaran                       |
| `Siswa` / `SiswaKelas`        | Biodata siswa & penempatan kelas per tahun ajaran (+ keringanan SPP) |
| `TunggakanAwal`               | Saldo tunggakan bawaan per siswa per tahun ajaran                    |
| `DspTagihan`                  | Tagihan DSP per siswa                                                |
| `TransaksiPembayaran(Detail)` | Kwitansi pembayaran (bisa multi-jenis dalam satu transaksi)          |
| `Pengaturan`                  | Konfigurasi identitas sekolah, branding, dsb (single row)            |
| `SuratTagihanLog`             | Riwayat surat tagihan yang pernah digenerate                         |

## Backup & Reset Database

Karena database-nya satu file SQLite, backup cukup dengan **copy
file**:

```bash
# Backup (sebaiknya rutin, mis. harian/mingguan, ke lokasi lain/USB)
cp dev.db backup/dev-$(date +%Y%m%d).db

# Restore
cp backup/dev-20260101.db dev.db
```

Untuk mulai dari kosong lagi (mis. setelah masa uji coba selesai):
hapus `dev.db` (dan `sessions.db` kalau ingin semua sesi login
ter-reset), lalu jalankan ulang `npx prisma migrate deploy` dan
`npm run seed` (lihat [Instalasi](#instalasi--setup-pertama-kali)).

> `dev.db` dan `sessions.db` saat ini belum masuk `.gitignore` —
> kalau proyek ini disimpan di Git, pastikan tidak ikut ter-commit
> data siswa yang sebenarnya.

## Struktur Proyek

```
src/
  index.ts              # entry point Express app
  routes/                # satu file per area fitur (siswa, pembayaran, laporan, dst.)
  lib/                    # logika inti: tagihan.ts (ledger SPP), importParser.ts, surat.ts, dll.
  middleware/             # auth (requireLogin/requireRole), upload file
views/                    # template EJS per halaman
prisma/
  schema.prisma           # definisi model database
  migrations/              # riwayat migration
  seed.ts                  # data awal (jenjang, tahun ajaran contoh, admin)
public/                    # aset statis (CSS, file upload logo/TTD/kop surat)
data/tmp-imports/          # file sementara saat proses preview import (auto-dibersihkan)
```
