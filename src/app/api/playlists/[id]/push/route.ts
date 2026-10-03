import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { HttpError } from "@/lib/server/playlists";
import { getPlaylist, getTracks, logSession } from "@/lib/server/repo";
import { spotifyProvider } from "@/lib/providers/spotify";
import { appleProvider } from "@/lib/providers/apple";
import { youtubeProvider } from "@/lib/providers/youtube";
import { matchTracks } from "@/lib/providers/matcher";
import { authFor } from "@/lib/server/connections";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  provider: z.enum(["spotify", "apple", "youtube"]),
  /** Track ids whose "alternative version" match the user approved. */
  acceptAlternatives: z.array(z.string()).max(500).default([]),
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const b = await body(req, Body);
  const p = getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  const prov = b.provider === "spotify" ? spotifyProvider : b.provider === "apple" ? appleProvider : youtubeProvider;
  if (!prov.isConfigured()) throw new HttpError(503, `${prov.name} is not configured`);
  const auth = await authFor(userId, b.provider);
  if (!auth) {
    return json(
      { error: "not_connected", provider: b.provider, connectUrl: b.provider === "spotify" ? `/api/auth/spotify/login?return=/playlist/${id}` : b.provider === "youtube" ? `/api/auth/google/login?return=/playlist/${id}` : null },
      { status: 401 },
    );
  }
  const tracks = getTracks(p.tracks.map((t) => t.trackId));
  // Apple catalog search uses the developer token; the user token is only needed to write.
  const matches = await matchTracks(tracks, prov, b.provider === "apple" ? undefined : auth);
  const refs = matches.filter((m) => m.ref && (m.status === "available" || (m.status === "alternative" && b.acceptAlternatives.includes(m.trackId)))).map((m) => m.ref!);
  if (!refs.length) throw new HttpError(422, `No tracks could be matched on ${prov.name}`);
  const description = `${p.interpretation.replace(/^Anladım\.\s*|^Got it\.\s*/, "")} — AI Music Sommelier`;
  const created = await prov.createPlaylist!(auth, p.title, description, refs);
  logSession(id, "push", b.provider, created.url, null);
  return json({ provider: b.provider, url: created.url, added: refs.length, skipped: tracks.length - refs.length });
});
