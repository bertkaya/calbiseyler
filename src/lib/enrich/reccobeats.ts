/**
 * ReccoBeats — free, keyless Spotify-style audio features by Spotify ID.
 * Docs: https://reccobeats.com/docs/apis/get-track-audio-features
 * Responses are parsed defensively (field names verified at runtime).
 */
import { fetchJson } from "../providers/types";
import type { TrackFeatures } from "../types";
import { camelotFromPitch } from "./keys";

const API = process.env.RECCOBEATS_API_URL || "https://api.reccobeats.com/v1";

interface RbFeatures {
  id?: string;
  href?: string;
  acousticness?: number;
  danceability?: number;
  energy?: number;
  instrumentalness?: number;
  key?: number;
  mode?: number;
  loudness?: number;
  tempo?: number;
  valence?: number;
}
interface RbTrack { id?: string; href?: string; popularity?: number; isrc?: string }

export function reccoEnabled(): boolean {
  return process.env.RECCOBEATS_DISABLED !== "1";
}

const spotifyIdOf = (href?: string) => (href ? /track\/([A-Za-z0-9]+)/.exec(href)?.[1] : undefined);
const list = <T>(r: unknown): T[] => {
  const o = r as { content?: T[]; data?: T[] } | T[];
  return Array.isArray(o) ? o : o?.content ?? o?.data ?? [];
};

export function toFeatures(f: RbFeatures, popularity?: number): TrackFeatures {
  const c = (x?: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : undefined);
  return {
    energy: c(f.energy),
    danceability: c(f.danceability),
    valence: c(f.valence),
    acousticness: c(f.acousticness),
    instrumentalness: c(f.instrumentalness),
    loudness: typeof f.loudness === "number" ? c((f.loudness + 60) / 60) : undefined,
    bpm: typeof f.tempo === "number" && f.tempo > 30 ? Math.round(f.tempo) : undefined,
    key: typeof f.key === "number" && f.key >= 0 ? camelotFromPitch(f.key, f.mode ?? 1) : undefined,
    popularity: typeof popularity === "number" ? c(popularity / 100) : undefined,
  };
}

/** Spotify IDs → features (batched, max 40 per request). */
export async function reccoFeatures(spotifyIds: string[]): Promise<Map<string, TrackFeatures>> {
  const out = new Map<string, TrackFeatures>();
  if (!reccoEnabled()) return out;
  for (let i = 0; i < spotifyIds.length; i += 40) {
    const ids = spotifyIds.slice(i, i + 40);
    const q = encodeURIComponent(ids.join(","));
    const [feat, tracks] = await Promise.all([
      fetchJson<unknown>(`${API}/audio-features?ids=${q}`, { timeoutMs: 8000 }, "spotify").catch(() => null),
      fetchJson<unknown>(`${API}/track?ids=${q}`, { timeoutMs: 8000 }, "spotify").catch(() => null),
    ]);
    const pop = new Map<string, number>();
    for (const t of list<RbTrack>(tracks)) {
      const sid = spotifyIdOf(t.href);
      if (sid && typeof t.popularity === "number") pop.set(sid, t.popularity);
    }
    const feats = list<RbFeatures>(feat);
    feats.forEach((f, idx) => {
      const sid = spotifyIdOf(f.href) ?? (feats.length === ids.length ? ids[idx] : undefined);
      if (sid) out.set(sid, toFeatures(f, pop.get(sid)));
    });
  }
  return out;
}
