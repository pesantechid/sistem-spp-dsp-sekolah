import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import { flashMiddleware } from "./lib/flash.ts";
import { pengaturanMiddleware } from "./lib/pengaturan.ts";
import authRouter from "./routes/auth.routes.ts";
import dashboardRouter from "./routes/dashboard.routes.ts";
import usersRouter from "./routes/users.routes.ts";
import tahunAjaranRouter from "./routes/tahun-ajaran.routes.ts";
import kelasRouter from "./routes/kelas.routes.ts";
import siswaRouter from "./routes/siswa.routes.ts";
import pembayaranRouter from "./routes/pembayaran.routes.ts";
import laporanRouter from "./routes/laporan.routes.ts";
import suratRouter from "./routes/surat.routes.ts";
import pengaturanRouter from "./routes/pengaturan.routes.ts";
import importRouter from "./routes/import.routes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLiteStore = SQLiteStoreFactory(session);

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "..") }) as unknown as session.Store,
    secret: process.env.SESSION_SECRET || "ganti-secret-ini-di-env-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 hari
    },
  })
);

app.use(flashMiddleware);
app.use(pengaturanMiddleware);

app.use("/", authRouter);
app.use("/", dashboardRouter);
app.use("/users", usersRouter);
app.use("/tahun-ajaran", tahunAjaranRouter);
app.use("/kelas", kelasRouter);
app.use("/siswa", siswaRouter);
app.use("/pembayaran", pembayaranRouter);
app.use("/laporan", laporanRouter);
app.use("/surat", suratRouter);
app.use("/pengaturan", pengaturanRouter);
app.use("/import", importRouter);

app.use((req, res) => {
  res.status(404).render("error", { title: "Tidak Ditemukan", message: "Halaman tidak ditemukan." });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di http://localhost:${PORT} (LAN: http://<ip-komputer-ini>:${PORT})`);
});
