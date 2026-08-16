import type { Response } from "express";

function escapeCsvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

export function sendCsv(res: Response, filename: string, rows: unknown[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + toCsv(rows));
}
