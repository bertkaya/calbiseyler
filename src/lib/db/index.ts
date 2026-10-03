/**
 * Persistence via libSQL (@libsql/client):
 *  - local dev:  DATABASE_URL unset → file:./data/sommelier.db (plain SQLite file)
 *  - Vercel:     DATABASE_URL=libsql://<db>.turso.io + DATABASE_AUTH_TOKEN (Turso free plan)
 *  - tests:      DATABASE_URL=":memory:"
 * Every query lives in ../server/repo.ts.
 */
import { createClient, type Client, type InStatement, type InArgs, type Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

const g = globalThis as unknown as { __sommelierDb?: Promise<Client> };

function resolveUrl(): string {
  const url = process.env.DATABASE_URL || process.env.DATABASE_PATH;
  if (url) return url === ":memory:" || /^(libsql|https?|wss?|file):/.test(url) ? url : `file:${url}`;
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is required on Vercel (the filesystem is not persistent). Use a free Turso database.");
  }
  const file = path.join(process.cwd(), "data", "sommelier.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

async function open(): Promise<Client> {
  const client = createClient({ url: resolveUrl(), authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  // Child rows are also deleted explicitly in repo.ts, so nothing depends on this pragma (Turso may ignore it).
  await client.execute("PRAGMA foreign_keys = ON").catch(() => {});
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  await client.batch(statements, "write");
  return client;
}

export function db(): Promise<Client> {
  g.__sommelierDb ??= open().catch((e) => {
    g.__sommelierDb = undefined; // let the next request retry
    throw e;
  });
  return g.__sommelierDb;
}

export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  return (await (await db()).execute({ sql, args })).rows as unknown as T[];
}

export async function get<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []): Promise<number> {
  return (await (await db()).execute({ sql, args })).rowsAffected;
}

/** Atomic multi-statement write. */
export async function tx(statements: InStatement[]): Promise<void> {
  await (await db()).batch(statements, "write");
}

/** Test helper: use a fresh in-memory database. */
export function resetDbForTests(): void {
  g.__sommelierDb?.then((c) => c.close()).catch(() => {});
  g.__sommelierDb = undefined;
  process.env.DATABASE_URL = ":memory:";
}
