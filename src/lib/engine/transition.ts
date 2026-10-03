/**
 * Transition Optimizer primitives: how well does B follow A?
 * Used for sequential ordering (all features) and shuffle cohesion
 * (tempo/key ignored — shuffle makes beat-matching meaningless).
 */
import type { MusicTrack } from "../types";
import { genreSetSimilarity } from "../catalog/genres";
import { energyOf, valenceOf } from "./features";
import { clamp } from "./util";

function bpmScore(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  const ratios = [b / a, (b * 2) / a, b / (a * 2)];
  const pct = Math.min(...ratios.map((r) => Math.abs(1 - r)));
  if (pct <= 0.04) return 1;
  if (pct <= 0.08) return 0.8;
  if (pct <= 0.15) return 0.5;
  return clamp(0.5 - (pct - 0.15) * 2);
}

/** Camelot wheel compatibility ("8A" → "8A"/"7A"/"9A"/"8B" are smooth). */
function keyScore(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const pa = /^(\d{1,2})([AB])$/.exec(a), pb = /^(\d{1,2})([AB])$/.exec(b);
  if (!pa || !pb) return null;
  const na = +pa[1], nb = +pb[1];
  const diff = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  if (pa[2] === pb[2]) return diff === 0 ? 1 : diff === 1 ? 0.85 : diff === 2 ? 0.5 : 0.25;
  return diff === 0 ? 0.8 : 0.3;
}

export function transitionScore(a: MusicTrack, b: MusicTrack): number {
  const parts: [number, number][] = [];
  const bpm = bpmScore(a.features.bpm, b.features.bpm);
  if (bpm !== null) parts.push([bpm, 1.5]);
  const key = keyScore(a.features.key, b.features.key);
  if (key !== null) parts.push([key, 0.8]);
  const ea = energyOf(a), eb = energyOf(b);
  let e = 1 - Math.abs(ea - eb) * 1.6;
  if (eb < ea - 0.25) e -= 0.15; // abrupt drops kill a room faster than abrupt rises
  parts.push([clamp(e), 2]);
  parts.push([genreSetSimilarity(a.genres, b.genres), 1.8]);
  if (a.year && b.year) parts.push([Math.exp(-(((a.year - b.year) / 12) ** 2)), 0.8]);
  parts.push([1 - Math.abs(valenceOf(a) - valenceOf(b)), 0.7]);
  parts.push([a.language === b.language ? 1 : 0.7, 0.5]);
  return parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0);
}

/** Order-independent closeness used by the shuffle engine. */
export function cohesion(a: MusicTrack, b: MusicTrack): number {
  const parts: [number, number][] = [
    [clamp(1 - Math.abs(energyOf(a) - energyOf(b)) * 1.4), 2],
    [genreSetSimilarity(a.genres, b.genres), 2],
    [1 - Math.abs(valenceOf(a) - valenceOf(b)), 1],
    [a.language === b.language ? 1 : 0.65, 0.8],
  ];
  if (a.year && b.year) parts.push([Math.exp(-(((a.year - b.year) / 15) ** 2)), 1]);
  return parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0);
}

/** "Shuffle'a basınca 3 şarkı sonra playlist saçmalamasın" — expected cohesion of random neighbours. */
export function shuffleFriendliness(tracks: MusicTrack[]): number {
  if (tracks.length < 2) return 1;
  const vals: number[] = [];
  for (let i = 0; i < tracks.length; i++)
    for (let j = i + 1; j < tracks.length; j++) vals.push(cohesion(tracks[i], tracks[j]));
  vals.sort((x, y) => x - y);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const p10 = vals[Math.floor(vals.length * 0.1)];
  // Calibrate: 0.55 cohesion feels random, 0.9 feels seamless.
  return clamp(((0.7 * avg + 0.3 * p10) - 0.5) / 0.4);
}
