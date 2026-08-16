import { prisma } from "../src/lib/prisma.ts";
import { hashPassword } from "../src/lib/auth.ts";

async function main() {
  const jenjangList = [
    { nama: "VII", urutan: 1 },
    { nama: "VIII", urutan: 2 },
    { nama: "IX", urutan: 3 },
  ];
  for (const j of jenjangList) {
    await prisma.jenjang.upsert({
      where: { nama: j.nama },
      update: {},
      create: j,
    });
  }
  console.log("Jenjang VII/VIII/IX siap.");

  const label = "2026/2027";
  const tahunAjaran = await prisma.tahunAjaran.upsert({
    where: { label },
    update: {},
    create: {
      label,
      tanggalMulai: new Date("2026-07-01"),
      tanggalSelesai: new Date("2027-06-30"),
      isAktif: true,
    },
  });
  console.log(`Tahun ajaran ${label} siap (id=${tahunAjaran.id}).`);

  await prisma.tarif.upsert({
    where: { tahunAjaranId: tahunAjaran.id },
    update: {},
    create: {
      tahunAjaranId: tahunAjaran.id,
      sppBulanan: 115000,
    },
  });
  console.log("Tarif SPP Rp115.000/bulan siap.");

  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
    await prisma.user.create({
      data: {
        nama: "Administrator",
        username: adminUsername,
        passwordHash: await hashPassword(adminPassword),
        role: "ADMIN",
      },
    });
    console.log(`User admin dibuat -> username: ${adminUsername} / password: ${adminPassword}`);
    console.log("PENTING: segera ganti password ini setelah login pertama kali.");
  } else {
    console.log("User admin sudah ada, dilewati.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
