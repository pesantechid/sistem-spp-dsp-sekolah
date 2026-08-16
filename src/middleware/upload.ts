import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "public", "uploads");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  },
});

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error("Format file tidak didukung. Gunakan JPG, PNG, atau WEBP."));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

export const uploadLogo = upload.single("logo");
export const uploadTtd = upload.single("ttd");
export const uploadKopSurat = upload.single("kopSurat");
