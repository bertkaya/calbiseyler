import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { HttpError, hydrate } from "@/lib/server/playlists";
import { getCachedMatch, getPlaylist } from "@/lib/server/repo";
import type { TrackMatch } from "@/lib/providers/matcher";
import { slugify } from "@/lib/catalog";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const csvCell = (s: string | number | undefined | null) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export const GET = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const p = await getPlaylist(id);
  if (!p || (p.userId !== userId && !p.shareId)) throw new HttpError(404, "Playlist not found");
  const h = await hydrate(p);
  const format = new URL(req.url).searchParams.get("format") ?? "txt";
  // Prefer a free platform link (YouTube Music), fall back to Spotify if it was matched earlier.
  const links = new Map<string, string>();
  for (const it of h.items) {
    const m = (await getCachedMatch<TrackMatch>(it.trackId, "youtube", 30 * 864e5)) ?? (await getCachedMatch<TrackMatch>(it.trackId, "spotify"));
    if (m?.ref?.url && m.status !== "unavailable") links.set(it.trackId, m.ref.url);
  }
  const url = (trackId: string) => links.get(trackId) ?? "";
  let out = "", type = "text/plain", ext = "txt";
  switch (format) {
    case "m3u":
      type = "audio/x-mpegurl"; ext = "m3u";
      out = ["#EXTM3U", `#PLAYLIST:${p.title}`, ...h.items.flatMap((it) => [`#EXTINF:${it.track.durationSec},${it.track.artist} - ${it.track.title}`, url(it.trackId) || `# ${it.track.artist} - ${it.track.title}`])].join("\n");
      break;
    case "csv":
      type = "text/csv"; ext = "csv";
      out = ["Position,Title,Artist,Year,Duration,Role,ISRC,URL", ...h.items.map((it, i) => [i + 1, it.track.title, it.track.artist, it.track.year, it.track.durationSec, it.role, it.track.isrc, url(it.trackId)].map(csvCell).join(","))].join("\n");
      break;
    case "json":
      type = "application/json"; ext = "json";
      out = JSON.stringify({ title: p.title, brief: p.brief, dna: p.dna, stats: p.stats, tracks: h.items.map((it) => ({ position: it.position + 1, role: it.role, title: it.track.title, artist: it.track.artist, year: it.track.year, durationSec: it.track.durationSec, isrc: it.track.isrc, url: url(it.trackId) || undefined })) }, null, 2);
      break;
    default:
      out = [p.title, "", ...h.items.map((it, i) => `${String(i + 1).padStart(2, "0")}. ${it.track.artist} - ${it.track.title}`)].join("\n");
  }
  return new Response(out, { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${slugify(p.title) || "playlist"}.${ext}"` } });
});
