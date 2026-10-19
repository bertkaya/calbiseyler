import { HttpError } from "@/lib/server/playlists";
import { json, route } from "@/lib/server/http";
import { purgeInactive } from "@/lib/server/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily retention job (vercel.json cron). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  return json({ purged: await purgeInactive(Number(process.env.RETENTION_DAYS || 90)) });
});
