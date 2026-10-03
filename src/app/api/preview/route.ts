import { json, route } from "@/lib/server/http";
import { deezerProvider } from "@/lib/providers/deezer";
import { getTrack } from "@/lib/server/repo";
import { matchTrack } from "@/lib/providers/matcher";

export const runtime = "nodejs";

/** 30-second preview via Deezer's public API (public mode listening). */
export const GET = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("trackId") ?? "";
  const t = getTrack(id);
  if (!t || !deezerProvider.isConfigured()) return json({ previewUrl: null });
  const m = await matchTrack(t, deezerProvider);
  return json({ previewUrl: m.status === "available" || m.status === "alternative" ? m.ref?.previewUrl ?? null : null, url: m.ref?.url ?? null });
});
