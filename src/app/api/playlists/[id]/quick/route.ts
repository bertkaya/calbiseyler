import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { HttpError } from "@/lib/server/playlists";
import { getPlaylist, getTracks, logSession } from "@/lib/server/repo";
import { enforceLimit } from "@/lib/server/ratelimit";
import { authFor } from "@/lib/server/connections";
import { matchTracks } from "@/lib/providers/matcher";
import { youtubeProvider } from "@/lib/providers/youtube";
import { pipedProvider } from "@/lib/providers/piped";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** YouTube's watch_videos queue accepts at most 50 ids per link. */
const CHUNK = 50;

/**
 * "Ready playlist" without an account: find each track's video and return playable queue links.
 * Search source: the user's YouTube account → YOUTUBE_API_KEY → keyless Piped fallback.
 */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  await enforceLimit("quick", 10, 3600, userId);
  const { id } = await params;
  const p = await getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  const tracks = await getTracks(p.tracks.map((t) => t.trackId));
  const auth = (await authFor(userId, "youtube")) ?? undefined;
  const useYoutubeApi = !!auth || !youtubeProvider.capabilities.requiresUserAuthForSearch;
  const source = auth ? "account" : useYoutubeApi ? "api" : "free";
  const matches = await matchTracks(tracks, useYoutubeApi ? youtubeProvider : pipedProvider, auth);
  const byId = new Map(matches.map((m) => [m.trackId, m]));

  // Keep the playlist order; only confident matches go in the queue (never silently substitute).
  const ids: string[] = [];
  const missing: { trackId: string; title: string; artist: string; searchUrl: string }[] = [];
  for (const t of tracks) {
    const m = byId.get(t.id);
    if (m?.status === "available" && m.ref) ids.push(m.ref.id);
    else missing.push({ trackId: t.id, title: t.title, artist: t.artist, searchUrl: youtubeProvider.searchUrl(t) });
  }
  if (!ids.length) throw new HttpError(422, "I couldn't find these tracks on YouTube right now. Try again in a minute, or connect YouTube.");
  const links: { url: string; from: number; to: number }[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    links.push({ url: `https://www.youtube.com/watch_videos?video_ids=${part.join(",")}`, from: i + 1, to: i + part.length });
  }
  await logSession(id, "quick", source, `${ids.length}/${tracks.length}`, null);
  return json({ source, found: ids.length, total: tracks.length, links, missing });
});
