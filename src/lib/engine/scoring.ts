/**
 * Music Curator scoring: how well does a track fit the brief, independent of
 * its position? Missing data → component skipped (graceful degradation).
 */
import type { Mood, MusicTrack, PlaylistBrief } from "../types";
import { artistMatches, norm } from "../catalog";
import { genrePairSimilarity, genreSetSimilarity } from "../catalog/genres";
import type { EngineContext, TasteSignals } from "./context";
import { acousticOf, danceOf, energyOf, nostalgiaOf, popularityOf, valenceOf } from "./features";
import { pullWeight } from "./brief";
import { clamp, mean } from "./util";

export interface ScoredTrack {
  track: MusicTrack;
  fit: number;
  /** fit + taste + reference + focus + keep bonuses. */
  value: number;
  familiar: boolean;
  /** Index of the brief genre this track counts toward (for quotas), or -1. */
  genreSlot: number;
  included: boolean;
}

/** Hard filters. Must-include tracks bypass everything except explicit exclusion. */
export function passesFilters(t: MusicTrack, brief: PlaylistBrief, taste?: TasteSignals | null): boolean {
  const ex = brief.exclude;
  if (ex.trackIds.includes(t.id)) return false;
  if (ex.artists.some((a) => artistMatches(t.artist, a))) return false;
  if (isIncluded(t, brief)) return true;
  if (taste?.never.includes(t.id)) return false;
  if (ex.genres.length && t.genres.some((g, i) => ex.genres.includes(g) && (i === 0 || t.genres.length === 1))) return false;
  if (ex.tags.length && t.tags.some((g) => ex.tags.includes(g))) return false;
  if (!brief.explicit && t.explicit) return false;
  if (brief.turkishShare === 1 && brief.languageStrict && t.language !== "tr") return false;
  if (brief.turkishShare === 0 && brief.languageStrict && t.language === "tr") return false;
  if (brief.eraStrict && t.year) {
    if (brief.eraFrom && t.year < brief.eraFrom) return false;
    if (brief.eraTo && t.year > brief.eraTo) return false;
  }
  return true;
}

export function isIncluded(t: MusicTrack, brief: PlaylistBrief): boolean {
  return brief.include.trackIds.includes(t.id);
}

function moodScore(t: MusicTrack, mood: Mood): number {
  const e = energyOf(t), v = valenceOf(t), a = acousticOf(t), d = danceOf(t);
  switch (mood) {
    case "happy": return v;
    case "sad": return clamp(1 - v + (t.tags.includes("sad") ? 0.2 : 0));
    case "chill": return clamp(1 - Math.abs(e - 0.35) * 1.5 + a * 0.2);
    case "romantic": return clamp((t.tags.includes("romantic") ? 0.6 : 0.2) + (1 - Math.abs(e - 0.4)) * 0.4);
    case "energetic": return e;
    case "nostalgic": return nostalgiaOf(t);
    case "melancholic": return clamp((1 - v) * 0.7 + (1 - Math.abs(e - 0.4)) * 0.3);
    case "party": return clamp(d * 0.5 + e * 0.4 + (t.tags.includes("singalong") ? 0.1 : 0));
    case "focus": return clamp((t.features.instrumentalness ?? 0.1) * 0.6 + (1 - Math.abs(e - 0.4)) * 0.4);
    case "roadtrip": return clamp(e * 0.4 + v * 0.4 + (t.tags.includes("singalong") ? 0.2 : 0));
  }
}

function eraScore(t: MusicTrack, brief: PlaylistBrief): number | null {
  if (!brief.eraFrom && !brief.eraTo) return null;
  if (!t.year) return 0.5;
  const from = brief.eraFrom ?? -Infinity;
  const to = brief.eraTo ?? Infinity;
  if (t.year >= from && t.year <= to) return 1;
  const dist = t.year < from ? from - t.year : t.year - to;
  return Math.exp(-((dist / 5) ** 2));
}

export function familiarity(t: MusicTrack, taste?: TasteSignals | null): number {
  const known = taste ? Math.max(taste.track[t.id] ?? 0, (taste.artist[norm(t.artist)] ?? 0) * 0.7) : 0;
  return clamp(popularityOf(t) * 0.8 + Math.max(0, known) * 0.4);
}

/** Pure brief fit in 0..1. */
export function fitScore(t: MusicTrack, brief: PlaylistBrief): number {
  const parts: [number, number][] = []; // [score, weight]

  if (brief.genres.length) parts.push([genreSetSimilarity(t.genres, brief.genres), 3]);

  const era = eraScore(t, brief);
  if (era !== null) parts.push([era, brief.eraStrict ? 2 : brief.nostalgia >= 8 ? 3 : 2]);

  if (brief.turkishShare !== null && brief.turkishShare !== 0.5) {
    const s = t.language === "tr" ? brief.turkishShare : 1 - brief.turkishShare;
    parts.push([s, 2.5]);
  }

  if (brief.moods.length) parts.push([mean(brief.moods.map((m) => moodScore(t, m))), 2]);

  const near = (x: number, target10: number) => 1 - Math.abs(x - target10 / 10);
  parts.push([near(energyOf(t), brief.energy), 1.2 * pullWeight(brief, "energy", brief.energy)]);
  parts.push([near(danceOf(t), brief.danceability), 1 * pullWeight(brief, "danceability", brief.danceability)]);
  parts.push([near(valenceOf(t), brief.valence), 1 * pullWeight(brief, "valence", brief.valence)]);
  parts.push([near(popularityOf(t), brief.popularity), 1.5 * pullWeight(brief, "popularity", brief.popularity)]);
  parts.push([near(nostalgiaOf(t), brief.nostalgia), 1.5 * pullWeight(brief, "nostalgia", brief.nostalgia)]);

  let fit = parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0);

  // Soft preferences
  if (brief.singalong) fit += t.tags.includes("singalong") ? 0.08 : -0.04;
  for (const tag of brief.avoidTags) if (t.tags.includes(tag)) fit -= 0.18;
  for (const g of brief.avoidGenres) if (t.genres.includes(g)) fit -= t.genres[0] === g ? 0.22 : 0.1;
  if (brief.activity === "wedding" && t.tags.includes("wedding")) fit += 0.05;
  if (brief.activity === "beach" && t.tags.includes("summer")) fit += 0.05;
  if (brief.activity === "work" && t.tags.includes("instrumental")) fit += 0.05;
  if (!brief.moods.includes("sad") && !brief.moods.includes("melancholic") && brief.valence >= 6 && t.tags.includes("sad")) fit -= 0.06;
  return clamp(fit);
}

function referenceSimilarity(t: MusicTrack, refs: MusicTrack[]): number {
  if (!refs.length) return 0;
  const e = mean(refs.map(energyOf)), v = mean(refs.map(valenceOf)), d = mean(refs.map(danceOf));
  const years = refs.map((r) => r.year).filter(Boolean) as number[];
  const y = years.length ? mean(years) : null;
  const genreSim = mean(refs.slice(0, 40).map((r) => genreSetSimilarity(t.genres, r.genres)));
  const lang = mean(refs.map((r) => (r.language === t.language ? 1 : 0)));
  const feat = 1 - (Math.abs(energyOf(t) - e) + Math.abs(valenceOf(t) - v) + Math.abs(danceOf(t) - d)) / 3;
  const era = y && t.year ? Math.exp(-(((t.year - y) / 12) ** 2)) : 0.5;
  return clamp(genreSim * 0.35 + feat * 0.3 + era * 0.15 + lang * 0.2);
}

export function scoreTrack(t: MusicTrack, brief: PlaylistBrief, ctx: EngineContext): ScoredTrack {
  const fit = fitScore(t, brief);
  let value = fit;
  const taste = ctx.taste;
  if (taste) {
    value += clamp(taste.artist[norm(t.artist)] ?? 0, -1, 1) * 0.15;
    value += clamp(taste.track[t.id] ?? 0, -1, 1) * 0.2;
    value += mean(t.genres.map((g) => taste.genre[g] ?? 0)) * 0.08;
    value += mean(t.tags.map((g) => taste.tag[g] ?? 0)) * 0.06;
  }
  if (ctx.referenceTracks?.length) value += referenceSimilarity(t, ctx.referenceTracks) * 0.35 - 0.12;
  if (brief.focusArtists.some((a) => artistMatches(t.artist, a))) value += 0.3;
  if (brief.include.artists.some((a) => artistMatches(t.artist, a))) value += 0.2;
  if (ctx.keepTrackIds?.has(t.id)) value += ctx.keepBonus ?? 0.2;

  let genreSlot = -1;
  if (brief.genres.length > 1) {
    let best = 0.79;
    brief.genres.forEach((g, i) => {
      const s = Math.max(...t.genres.map((tg, j) => genrePairSimilarity(tg, g) - j * 0.05));
      if (s > best) { best = s; genreSlot = i; }
    });
  }
  return { track: t, fit, value, familiar: familiarity(t, taste) >= 0.55, genreSlot, included: isIncluded(t, brief) };
}
