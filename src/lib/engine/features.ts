/**
 * Feature accessors with graceful degradation: when a provider gives no
 * value we fall back to genre/tag-based priors instead of failing.
 */
import type { GenreId, MusicTrack } from "../types";
import { clamp } from "./util";

const GENRE_ENERGY_PRIOR: Partial<Record<GenreId, number>> = {
  "tr-dance": 0.8, dance: 0.8, "disco-funk": 0.75, latin: 0.75, "tr-rap": 0.7, "rnb-hiphop": 0.65,
  rock: 0.75, "tr-rock": 0.7, "anatolian-rock": 0.55, "tr-pop": 0.6, pop: 0.65, indie: 0.6, "tr-alt": 0.5,
  arabesk: 0.4, fantezi: 0.5, tsm: 0.35, thm: 0.35, jazz: 0.35, lounge: 0.35, electronic: 0.6,
};

export const CURRENT_YEAR = new Date().getFullYear();

export function energyOf(t: MusicTrack): number {
  if (t.features.energy !== undefined) return t.features.energy;
  let e = GENRE_ENERGY_PRIOR[t.genres[0]] ?? 0.55;
  if (t.tags.includes("slow")) e -= 0.2;
  if (t.tags.includes("anthem")) e += 0.1;
  return clamp(e);
}

export function danceOf(t: MusicTrack): number {
  return t.features.danceability ?? clamp(energyOf(t) * 0.9);
}

export function valenceOf(t: MusicTrack): number {
  if (t.features.valence !== undefined) return t.features.valence;
  return t.tags.includes("sad") ? 0.3 : 0.55;
}

export function acousticOf(t: MusicTrack): number {
  return t.features.acousticness ?? (["tsm", "thm", "jazz"].includes(t.genres[0]) ? 0.7 : 0.3);
}

export function popularityOf(t: MusicTrack): number {
  return t.features.popularity ?? (t.tags.includes("classic") || t.tags.includes("anthem") ? 0.75 : 0.5);
}

/** 0 = brand new, 1 = 30+ years old / golden classic. */
export function nostalgiaOf(t: MusicTrack, now = CURRENT_YEAR): number {
  if (!t.year) return t.tags.includes("classic") ? 0.7 : 0.4;
  const age = now - t.year;
  let n = clamp((age - 4) / 26);
  if (t.tags.includes("classic")) n = clamp(n + 0.1);
  return n;
}

export function hasFeature(t: MusicTrack, k: keyof MusicTrack["features"]): boolean {
  return t.features[k] !== undefined;
}
