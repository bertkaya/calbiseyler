import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { HttpError, buildContext } from "@/lib/server/playlists";
import { getPlaylist, getTracks } from "@/lib/server/repo";
import { provider } from "@/lib/providers/registry";
import { matchTrack, matchTracks, summarize } from "@/lib/providers/matcher";
import { authFor } from "@/lib/server/connections";
import { findReplacement } from "@/lib/engine/replace";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const { provider: pid } = await body(req, z.object({ provider: z.enum(["spotify", "apple", "deezer", "youtube"]) }));
  const p = await getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  const prov = provider(pid)!;
  const tracks = await getTracks(p.tracks.map((t) => t.trackId));
  const auth = (await authFor(userId, pid)) ?? undefined;
  // Search needs either an app credential or (YouTube without API key) the user's account.
  const canSearch = prov.capabilities.search && prov.isConfigured() && (!prov.capabilities.requiresUserAuthForSearch || !!auth);
  if (!canSearch) {
    // Fail-safe: no API → deep links only, never a crash.
    return json({
      provider: pid,
      configured: false,
      needsConnect: prov.isConfigured() && prov.capabilities.requiresUserAuthForSearch && !auth,
      matches: tracks.map((t) => ({ trackId: t.id, status: "unknown", confidence: 0, searchUrl: prov.searchUrl(t) })),
      summary: { total: tracks.length, available: 0, alternative: 0, unavailable: 0, unknown: tracks.length },
      suggestions: [],
    });
  }
  // Apple catalog search uses the developer token, not the user token.
  const searchAuth = pid === "apple" ? undefined : auth;
  const matches = await matchTracks(tracks, prov, searchAuth);

  // For missing tracks, propose (never auto-apply) a same-role alternative that exists on the platform.
  const ctx = await buildContext(userId, p.brief);
  const suggestions = [];
  for (let i = 0; i < matches.length && suggestions.length < 8; i++) {
    if (matches[i].status !== "unavailable") continue;
    const r = findReplacement(p.brief, tracks, i, p.tracks[i].role, ctx, "unavailable");
    if (!r) continue;
    for (const cand of [r.track, ...r.alternatives].slice(0, 3)) {
      const m = await matchTrack(cand, prov, searchAuth);
      if (m.status === "available") {
        suggestions.push({ position: i, trackId: tracks[i].id, alternative: cand, message: r.track.id === cand.id ? r.message : r.message.replace(r.track.title, cand.title).replace(r.track.artist, cand.artist) });
        break;
      }
    }
  }
  return json({
    provider: pid,
    configured: true,
    matches: matches.map((m, i) => ({ ...m, searchUrl: prov.searchUrl(tracks[i]) })),
    summary: summarize(matches),
    suggestions,
  });
});
