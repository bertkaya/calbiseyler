/**
 * SQLite persistence via Node's built-in `node:sqlite` (Node >= 22.13).
 * Zero native dependencies. Every query lives in ./repo.ts so swapping to
 * Postgres later touches only this folder.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

const g = globalThis as unknown as { __sommelierDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__sommelierDb) return g.__sommelierDb;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "sommelier.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  conn.exec(SCHEMA);
  g.__sommelierDb = conn;
  return conn;
}

/** Test helper: use a fresh in-memory database. */
export function resetDbForTests(): void {
  g.__sommelierDb?.close();
  g.__sommelierDb = undefined;
  process.env.DATABASE_PATH = ":memory:";
}
