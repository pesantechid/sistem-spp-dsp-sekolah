import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma.ts";

export async function getPengaturan() {
  const p = await prisma.pengaturan.findUnique({ where: { id: 1 } });
  if (p) return p;
  return {
    id: 1,
    namaYayasan: null as string | null,
    namaSekolah: "",
    alamatSekolah: null as string | null,
    teleponSekolah: null as string | null,
    kodeSuratPrefix: null as string | null,
    namaPenandatangan: null as string | null,
    jabatanPenandatangan: "Kepala Sekolah",
    nipPenandatangan: null as string | null,
    kontakBendahara: null as string | null,
    batasTanggalBayar: 10,
    dspStandar: 0,
    namaAplikasi: null as string | null,
    deskripsiAplikasi: null as string | null,
    logoPath: null as string | null,
    ttdPath: null as string | null,
    kopSuratPath: null as string | null,
  };
}

export async function pengaturanMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.locals.pengaturanGlobal = await getPengaturan();
  next();
}
