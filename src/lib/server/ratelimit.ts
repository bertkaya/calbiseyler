/**
 * Fixed-window rate limiter stored in the database, so it works across serverless instances.
 * Limits apply per user cookie (`max`) and per client IP (`max * 3`, since an IP may be shared).
 * Disable with RATE_LIMIT_DISABLED=1.
 */
import { headers } from "next/headers";
import { db } from "../db";
import { HttpError } from "./playlists";

export async function hit(key: string, windowSec: number): Promise<number> {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const res = await (await db()).execute({
    sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
          ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
            window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
          RETURNING count`,
    args: [key, now, cutoff, cutoff, now],
  });
  return Number(res.rows[0]?.count ?? 1);
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
  } catch {
    return "unknown";
  }
}

export async function enforceLimit(name: string, max: number, windowSec: number, userId: string): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  const [u, ip] = await Promise.all([hit(`${name}:u:${userId}`, windowSec), hit(`${name}:ip:${await clientIp()}`, windowSec)]);
  if (u > max || ip > max * 3) {
    throw new HttpError(429, "Too many requests — please slow down and try again in a little while.");
  }
}
