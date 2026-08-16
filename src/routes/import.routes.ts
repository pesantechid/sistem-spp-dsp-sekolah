import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Router } from "express";
import { setFlash } from "../lib/flash.ts";
import { requireRole } from "../middleware/auth.ts";
import { uploadImportFile } from "../middleware/uploadImport.ts";
import { buildImportTemplate } from "../lib/importTemplate.ts";
import { parseAndValidate, commitImport, SHEET_LABELS, type ParsedImport } from "../lib/importParser.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "..", "data", "tmp-imports");

function ensureTmpDir() {
  fs.mkdirSync(tmpDir, { recursive: true });
}

function sweepOldFiles() {
  ensureTmpDir();
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 jam
  for (const name of fs.readdirSync(tmpDir)) {
    const filePath = path.join(tmpDir, name);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) fs.unlink(filePath, () => {});
  }
}

function summarize(parsed: ParsedImport) {
  return (Object.keys(parsed) as (keyof ParsedImport)[]).map((key) => {
    const rows = parsed[key];
    return {
      key,
      label: SHEET_LABELS[key],
      rows,
      valid: rows.filter((r) => r.status === "valid").length,
      skip: rows.filter((r) => r.status === "skip").length,
      error: rows.filter((r) => r.status === "error").length,
      warn: rows.filter((r) => r.status === "valid" && r.warning).length,
    };
  });
}

const router = Router();

router.get("/", requireRole("ADMIN", "STAFF"), (_req, res) => {
  sweepOldFiles();
  res.render("import/index", { title: "Import Data" });
});

router.get("/template", requireRole("ADMIN", "STAFF"), async (_req, res) => {
  const buffer = await buildImportTemplate();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="template-import-data.xlsx"');
  res.send(buffer);
});

router.post("/preview", requireRole("ADMIN", "STAFF"), (req, res) => {
  uploadImportFile(req, res, async (err) => {
    if (err) {
      setFlash(req, "error", err.message || "Gagal mengunggah file.");
      return res.redirect("/import");
    }
    if (!req.file) {
      setFlash(req, "error", "Pilih file template terlebih dahulu.");
      return res.redirect("/import");
    }

    let parsed: ParsedImport;
    try {
      parsed = await parseAndValidate(req.file.buffer);
    } catch {
      setFlash(req, "error", "File tidak dapat dibaca. Pastikan menggunakan template yang benar.");
      return res.redirect("/import");
    }

    ensureTmpDir();
    const token = crypto.randomUUID();
    fs.writeFileSync(path.join(tmpDir, `${token}.xlsx`), req.file.buffer);

    res.render("import/preview", { title: "Preview Import", token, sheets: summarize(parsed) });
  });
});

router.post("/confirm", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) {
    setFlash(req, "error", "Sesi import tidak valid, silakan upload ulang.");
    return res.redirect("/import");
  }

  const filePath = path.join(tmpDir, `${token}.xlsx`);
  if (!fs.existsSync(filePath)) {
    setFlash(req, "error", "File sementara sudah tidak ada (mungkin kedaluwarsa), silakan upload ulang.");
    return res.redirect("/import");
  }

  const buffer = fs.readFileSync(filePath);
  const parsed = await parseAndValidate(buffer);
  const summary = await commitImport(parsed, req.session.userId!);
  fs.unlink(filePath, () => {});

  res.render("import/result", {
    title: "Hasil Import",
    summary: (Object.keys(summary) as (keyof ParsedImport)[]).map((key) => ({
      key,
      label: SHEET_LABELS[key],
      ...summary[key],
    })),
  });
});

export default router;
