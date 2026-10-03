import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { HttpError } from "@/lib/server/playlists";
import { getPlaylist, getTracks, logSession } from "@/lib/server/repo";
import { spotifyProvider } from "@/lib/providers/spotify";
import { matchTracks } from "@/lib/providers/matcher";
import { spotifyAuth } from "@/lib/server/connections";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  provider: z.literal("spotify"),
  /** Track ids whose "alternative version" match the user approved. */
  acceptAlternatives: z.array(z.string()).max(500).default([]),
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const b = await body(req, Body);
  const p = getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  const auth = await spotifyAuth(userId);
  if (!auth) return json({ error: "not_connected", connectUrl: `/api/auth/spotify/login?return=/playlist/${id}` }, { status: 401 });
  const tracks = getTracks(p.tracks.map((t) => t.trackId));
  const matches = await matchTracks(tracks, spotifyProvider, auth);
  const refs = matches.filter((m) => m.ref && (m.status === "available" || (m.status === "alternative" && b.acceptAlternatives.includes(m.trackId)))).map((m) => m.ref!);
  if (!refs.length) throw new HttpError(422, "No tracks could be matched on Spotify");
  const description = `${p.interpretation.replace(/^Anladım\.\s*|^Got it\.\s*/, "")} — AI Music Sommelier`;
  const created = await spotifyProvider.createPlaylist!(auth, p.title, description, refs);
  logSession(id, "push", "spotify", created.url, null);
  return json({ url: created.url, added: refs.length, skipped: tracks.length - refs.length });
});
