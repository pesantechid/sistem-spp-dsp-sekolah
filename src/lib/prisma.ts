import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
const dbPath = path.isAbsolute(dbUrl) ? dbUrl : path.join(__dirname, "..", "..", dbUrl);

const adapter = new PrismaBetterSqlite3({ url: dbPath });

export const prisma = new PrismaClient({ adapter });
