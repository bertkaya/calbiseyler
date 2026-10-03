import type { MusicTrack } from "../types";
import { SEED_TRACKS, slugify } from "./seed";

export { slugify };

const SEED_BY_ID = new Map(SEED_TRACKS.map((t) => [t.id, t]));

/** Turkish-insensitive normaliser used for fuzzy matching everywhere. */
export function norm(s: string): string {
  return slugify(s).replace(/-/g, " ").trim();
}

export function seedTrack(id: string): MusicTrack | undefined {
  return SEED_BY_ID.get(id);
}

export function allSeedTracks(): MusicTrack[] {
  return SEED_TRACKS;
}

/** Unique artist names in the seed catalog (individual names split on "&"). */
export const CATALOG_ARTISTS: string[] = Array.from(
  new Set(SEED_TRACKS.flatMap((t) => [t.artist, ...t.artist.split(/\s*&\s*/)])),
).sort((a, b) => b.length - a.length);

export function artistMatches(trackArtist: string, wanted: string): boolean {
  const a = norm(trackArtist);
  const w = norm(wanted);
  if (!w) return false;
  if (a === w) return true;
  return a.split(/\s*(?:and|&|feat|ft)\s*/).some((part) => part.trim() === w) || ` ${a} `.includes(` ${w} `);
}

/** Simple ranked text search over a track list. */
export function searchTracks(query: string, tracks: MusicTrack[], limit = 12): MusicTrack[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored: [number, MusicTrack][] = [];
  for (const t of tracks) {
    const hay = `${norm(t.title)} ${norm(t.artist)}`;
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += w.length;
    if (norm(t.title).startsWith(q)) s += 10;
    if (norm(t.artist).startsWith(q)) s += 6;
    if (s > 0) scored.push([s + (t.features.popularity ?? 0.5), t]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}
