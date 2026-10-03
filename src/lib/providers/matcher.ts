/**
 * Platform Matcher: maps engine tracks to provider tracks.
 * Never silently substitutes — a weak match is reported as "alternative"
 * and must be confirmed by the user.
 */
import type { MusicTrack } from "../types";
import { norm } from "../catalog";
import { cacheMatch, getCachedMatch } from "../server/repo";
import type { MusicProvider, ProviderAuth, ProviderTrackRef } from "./types";

export type MatchStatus = "available" | "alternative" | "unavailable" | "unknown";

export interface TrackMatch {
  trackId: string;
  status: MatchStatus;
  confidence: number;
  ref?: ProviderTrackRef;
  note?: string;
}

const VERSION_WORDS = /\b(live|canli|remix|acoustic|akustik|cover|karaoke|instrumental|edit|version|versiyon|remaster(ed)?|mix)\b/;

function baseTitle(s: string): string {
  return norm(s.replace(/\(.*?\)|\[.*?\]/g, "").split(" - ")[0]);
}

function sim(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
  const inter = [...ta].filter((x) => tb.has(x)).length;
  return inter / Math.max(ta.size, tb.size);
}

export function scoreCandidate(t: MusicTrack, c: ProviderTrackRef): { score: number; note?: string } {
  if (t.isrc && c.isrc && t.isrc === c.isrc) return { score: 1 };
  const titleS = sim(baseTitle(t.title), baseTitle(c.title));
  const artistS = Math.max(...t.artist.split(/\s*&\s*/).map((a) => sim(norm(a), norm(c.artist))), sim(norm(t.artist), norm(c.artist)));
  let score = titleS * 0.55 + artistS * 0.35;
  if (c.durationSec && t.durationSec) {
    const d = Math.abs(c.durationSec - t.durationSec);
    score += d <= 8 ? 0.1 : d <= 25 ? 0.05 : d > 90 ? -0.1 : 0;
  } else score += 0.05;
  let note: string | undefined;
  const cv = norm(c.title).match(VERSION_WORDS)?.[0];
  const tv = norm(t.title).match(VERSION_WORDS)?.[0];
  if (cv && cv !== tv && !/remaster/.test(cv)) {
    score -= 0.12;
    note = cv;
  }
  return { score: Math.max(0, Math.min(1, score)), note };
}

export async function matchTrack(t: MusicTrack, p: MusicProvider, auth?: ProviderAuth): Promise<TrackMatch> {
  const cached = getCachedMatch<TrackMatch>(t.id, p.id);
  if (cached) return cached;
  try {
    const cands = await p.search({ title: t.title, artist: t.artist, durationSec: t.durationSec, isrc: t.isrc }, auth);
    let best: { c: ProviderTrackRef; score: number; note?: string } | null = null;
    for (const c of cands) {
      const s = scoreCandidate(t, c);
      if (!best || s.score > best.score) best = { c, ...s };
    }
    let m: TrackMatch;
    if (best && best.score >= 0.82) m = { trackId: t.id, status: "available", confidence: best.score, ref: best.c };
    else if (best && best.score >= 0.6) m = { trackId: t.id, status: "alternative", confidence: best.score, ref: best.c, note: best.note ?? "different version" };
    else m = { trackId: t.id, status: "unavailable", confidence: best?.score ?? 0 };
    cacheMatch(t.id, p.id, m);
    return m;
  } catch (e) {
    return { trackId: t.id, status: "unknown", confidence: 0, note: (e as Error).message };
  }
}

/** Match many tracks with bounded concurrency (rate-limit friendly). */
export async function matchTracks(tracks: MusicTrack[], p: MusicProvider, auth?: ProviderAuth, concurrency = 4): Promise<TrackMatch[]> {
  const out: TrackMatch[] = new Array(tracks.length);
  let i = 0;
  const worker = async () => {
    while (i < tracks.length) {
      const idx = i++;
      out[idx] = await matchTrack(tracks[idx], p, auth);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tracks.length) }, worker));
  return out;
}

export function summarize(matches: TrackMatch[]) {
  return {
    total: matches.length,
    available: matches.filter((m) => m.status === "available").length,
    alternative: matches.filter((m) => m.status === "alternative").length,
    unavailable: matches.filter((m) => m.status === "unavailable").length,
    unknown: matches.filter((m) => m.status === "unknown").length,
  };
}
