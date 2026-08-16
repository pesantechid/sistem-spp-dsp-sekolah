import multer from "multer";

const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype) && !file.originalname.toLowerCase().endsWith(".xlsx")) {
    return cb(new Error("Format file tidak didukung. Gunakan file .xlsx hasil template."));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadImportFile = upload.single("file");
