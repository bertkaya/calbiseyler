import type { GenreId } from "../types";

/**
 * Genre metadata + a hand-tuned similarity graph. Similarity is used by the
 * curator (brief fit), the transition optimizer and the shuffle engine.
 */
export interface GenreInfo {
  id: GenreId;
  label: string;
  family: "turkish-pop" | "turkish-trad" | "turkish-rock" | "global-pop" | "global-rock" | "groove" | "chill";
  defaultLanguage: string;
}

export const GENRES: Record<GenreId, GenreInfo> = {
  "tr-pop": { id: "tr-pop", label: "Turkish Pop", family: "turkish-pop", defaultLanguage: "tr" },
  "tr-dance": { id: "tr-dance", label: "Turkish Dance-Pop", family: "turkish-pop", defaultLanguage: "tr" },
  "tr-rock": { id: "tr-rock", label: "Turkish Rock", family: "turkish-rock", defaultLanguage: "tr" },
  "anatolian-rock": { id: "anatolian-rock", label: "Anatolian Rock", family: "turkish-rock", defaultLanguage: "tr" },
  "tr-alt": { id: "tr-alt", label: "Turkish Alternative / Indie", family: "turkish-rock", defaultLanguage: "tr" },
  "tr-rap": { id: "tr-rap", label: "Turkish Rap", family: "groove", defaultLanguage: "tr" },
  arabesk: { id: "arabesk", label: "Arabesk", family: "turkish-trad", defaultLanguage: "tr" },
  fantezi: { id: "fantezi", label: "Fantezi", family: "turkish-trad", defaultLanguage: "tr" },
  tsm: { id: "tsm", label: "Turkish Classical (TSM)", family: "turkish-trad", defaultLanguage: "tr" },
  thm: { id: "thm", label: "Turkish Folk (THM)", family: "turkish-trad", defaultLanguage: "tr" },
  pop: { id: "pop", label: "Pop", family: "global-pop", defaultLanguage: "en" },
  dance: { id: "dance", label: "Dance", family: "global-pop", defaultLanguage: "en" },
  "disco-funk": { id: "disco-funk", label: "Disco & Funk", family: "groove", defaultLanguage: "en" },
  rock: { id: "rock", label: "Rock", family: "global-rock", defaultLanguage: "en" },
  "rnb-hiphop": { id: "rnb-hiphop", label: "R&B / Hip-Hop", family: "groove", defaultLanguage: "en" },
  indie: { id: "indie", label: "Indie", family: "global-rock", defaultLanguage: "en" },
  latin: { id: "latin", label: "Latin", family: "global-pop", defaultLanguage: "es" },
  jazz: { id: "jazz", label: "Jazz", family: "chill", defaultLanguage: "en" },
  lounge: { id: "lounge", label: "Lounge / Chill", family: "chill", defaultLanguage: "en" },
  electronic: { id: "electronic", label: "Electronic", family: "chill", defaultLanguage: "en" },
};

export const GENRE_IDS = Object.keys(GENRES) as GenreId[];

/** Explicit pairwise similarities (symmetric). Unlisted pairs fall back to family logic. */
const EDGES: [GenreId, GenreId, number][] = [
  ["tr-pop", "tr-dance", 0.9],
  ["tr-pop", "tr-alt", 0.6],
  ["tr-pop", "tr-rock", 0.55],
  ["tr-pop", "fantezi", 0.6],
  ["tr-pop", "arabesk", 0.4],
  ["tr-pop", "tsm", 0.45],
  ["tr-pop", "thm", 0.4],
  ["tr-pop", "pop", 0.65],
  ["tr-pop", "tr-rap", 0.45],
  ["tr-dance", "dance", 0.7],
  ["tr-dance", "pop", 0.6],
  ["tr-dance", "fantezi", 0.5],
  ["tr-dance", "latin", 0.55],
  ["tr-dance", "disco-funk", 0.5],
  ["tr-rock", "anatolian-rock", 0.75],
  ["tr-rock", "tr-alt", 0.8],
  ["tr-rock", "rock", 0.7],
  ["anatolian-rock", "thm", 0.65],
  ["anatolian-rock", "rock", 0.55],
  ["tr-alt", "indie", 0.65],
  ["tr-alt", "thm", 0.4],
  ["tr-rap", "rnb-hiphop", 0.75],
  ["arabesk", "fantezi", 0.85],
  ["arabesk", "tsm", 0.55],
  ["arabesk", "thm", 0.5],
  ["fantezi", "tsm", 0.55],
  ["fantezi", "thm", 0.45],
  ["tsm", "thm", 0.6],
  ["tsm", "jazz", 0.3],
  ["pop", "dance", 0.8],
  ["pop", "disco-funk", 0.65],
  ["pop", "rock", 0.5],
  ["pop", "rnb-hiphop", 0.55],
  ["pop", "indie", 0.6],
  ["pop", "latin", 0.6],
  ["dance", "electronic", 0.7],
  ["dance", "disco-funk", 0.7],
  ["dance", "latin", 0.6],
  ["disco-funk", "rnb-hiphop", 0.6],
  ["disco-funk", "jazz", 0.4],
  ["rock", "indie", 0.75],
  ["indie", "electronic", 0.45],
  ["indie", "lounge", 0.4],
  ["jazz", "lounge", 0.75],
  ["lounge", "electronic", 0.7],
  ["rnb-hiphop", "electronic", 0.4],
];

const SIM = new Map<string, number>();
for (const [a, b, s] of EDGES) {
  SIM.set(`${a}|${b}`, s);
  SIM.set(`${b}|${a}`, s);
}

export function genrePairSimilarity(a: GenreId, b: GenreId): number {
  if (a === b) return 1;
  const s = SIM.get(`${a}|${b}`);
  if (s !== undefined) return s;
  const fa = GENRES[a]?.family;
  const fb = GENRES[b]?.family;
  if (fa && fa === fb) return 0.5;
  return 0.15;
}

/** Best-match similarity between two genre sets. */
export function genreSetSimilarity(a: GenreId[], b: GenreId[]): number {
  if (!a.length || !b.length) return 0.5;
  let best = 0;
  for (const x of a) for (const y of b) best = Math.max(best, genrePairSimilarity(x, y));
  return best;
}
