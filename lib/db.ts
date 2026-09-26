import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  slug TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  rel TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  label TEXT,
  job_id TEXT,
  parent_id INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(product, rel)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  params TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  log TEXT NOT NULL DEFAULT '',
  error TEXT,
  thread_id TEXT,
  output_image_id INTEGER,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS lab_creations (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  name TEXT NOT NULL,
  "values" TEXT NOT NULL,
  colors TEXT NOT NULL DEFAULT '{}',
  custom_name INTEGER NOT NULL DEFAULT 0,
  product TEXT,
  thumbnail BLOB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lab_creations_tool ON lab_creations(tool, updated_at);
`;

export type ImageRow = {
  id: number;
  product: string;
  rel: string;
  kind: string;
  status: "pending" | "approved" | "rejected";
  label: string | null;
  job_id: string | null;
  parent_id: number | null;
  created_at: string;
};

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export type JobRow = {
  id: string;
  product: string;
  type: string;
  label: string;
  params: string;
  prompt: string;
  status: JobStatus;
  log: string;
  error: string | null;
  thread_id: string | null;
  output_image_id: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** Columns added after a table was created: databases made before get them here. */
function addColumn(d: Database.Database, table: string, column: string, type: string) {
  const has = (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!has) d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

const g = globalThis as unknown as { __studioDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__studioDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "app.db"));
    d.pragma("journal_mode = WAL");
    d.exec(SCHEMA);
    addColumn(d, "lab_creations", "custom_name", "INTEGER NOT NULL DEFAULT 0");
    addColumn(d, "lab_creations", "product", "TEXT");
    g.__studioDb = d;
  }
  return g.__studioDb;
}

export const now = () => new Date().toISOString();
