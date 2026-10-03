/**
 * Taste Model — transparent, pausable, resettable.
 * "Your taste profile learns from your feedback and playlist edits."
 * Raw scores accumulate; signals are squashed to -1..1 with tanh.
 */
import type { MusicTrack } from "../types";
import type { TasteSignals } from "../engine/context";
import { norm } from "../catalog";
import { energyOf } from "../engine/features";

export type FeedbackKind = "like" | "love" | "dislike" | "never" | "replace" | "remove" | "include" | "keep";

export interface TasteProfileData {
  artist: Record<string, number>;
  genre: Record<string, number>;
  track: Record<string, number>;
  tag: Record<string, number>;
  never: string[];
  energyBias: number;
  discoveryBias: number;
  events: number;
  /** norm(artist) → first time (ms) it appeared in one of the user's playlists. */
  artistsSeen: Record<string, number>;
  displayNames: Record<string, string>;
}

export function emptyTaste(): TasteProfileData {
  return { artist: {}, genre: {}, track: {}, tag: {}, never: [], energyBias: 0, discoveryBias: 0, events: 0, artistsSeen: {}, displayNames: {} };
}

const W: Record<FeedbackKind, { track: number; artist: number; genre: number; tag: number }> = {
  love: { track: 3, artist: 1.5, genre: 0.5, tag: 0.3 },
  like: { track: 1.5, artist: 0.7, genre: 0.25, tag: 0.15 },
  include: { track: 1, artist: 0.8, genre: 0.2, tag: 0 },
  keep: { track: 0.3, artist: 0.2, genre: 0.05, tag: 0 },
  dislike: { track: -2, artist: -0.6, genre: -0.2, tag: -0.15 },
  remove: { track: -1, artist: -0.3, genre: -0.1, tag: -0.05 },
  replace: { track: -0.5, artist: -0.1, genre: 0, tag: 0 },
  never: { track: -4, artist: -1, genre: -0.2, tag: -0.1 },
};

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = Math.round(((m[k] ?? 0) + v) * 100) / 100;
};

/** Feedback Processor: fold one event into the profile (returns a new object). */
export function applyFeedback(p: TasteProfileData, kind: FeedbackKind, track: MusicTrack, context?: { targetEnergy?: number }): TasteProfileData {
  const next: TasteProfileData = structuredClone(p);
  const w = W[kind];
  const a = norm(track.artist);
  add(next.track, track.id, w.track);
  add(next.artist, a, w.artist);
  next.displayNames[a] = track.artist;
  for (const g of track.genres) add(next.genre, g, w.genre);
  for (const t of track.tags) add(next.tag, t, w.tag);
  if (kind === "never" && !next.never.includes(track.id)) next.never.push(track.id);
  // Direction learning: repeatedly rejecting tracks calmer than the slot asked for → user wants more energy.
  if ((kind === "dislike" || kind === "never" || kind === "replace") && context?.targetEnergy !== undefined) {
    const diff = context.targetEnergy - energyOf(track) * 10;
    if (Math.abs(diff) > 0.8) next.energyBias = clampBias(next.energyBias + Math.sign(diff) * 0.08);
  }
  next.events++;
  return next;
}

const clampBias = (x: number) => Math.max(-1.5, Math.min(1.5, Math.round(x * 100) / 100));

export function noteSeenArtists(p: TasteProfileData, tracks: MusicTrack[], now = Date.now()): TasteProfileData {
  const next = { ...p, artistsSeen: { ...p.artistsSeen }, displayNames: { ...p.displayNames } };
  for (const t of tracks) {
    const a = norm(t.artist);
    if (!next.artistsSeen[a]) next.artistsSeen[a] = now;
    next.displayNames[a] = t.artist;
  }
  return next;
}

const squash = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.tanh(v / 3)]));

export function toSignals(p: TasteProfileData | null): TasteSignals | null {
  if (!p || p.events === 0) return p?.never.length ? { artist: {}, genre: {}, track: {}, tag: {}, never: p.never, energyBias: 0 } : null;
  return { artist: squash(p.artist), genre: squash(p.genre), track: squash(p.track), tag: squash(p.tag), never: p.never, energyBias: p.energyBias };
}

/** Human-readable summary for the transparent profile page. */
export function describeTaste(p: TasteProfileData) {
  const top = (m: Record<string, number>, n: number, sign = 1) =>
    Object.entries(m).filter(([, v]) => v * sign > 0).sort((x, y) => (y[1] - x[1]) * sign).slice(0, n);
  return {
    events: p.events,
    lovedArtists: top(p.artist, 8).map(([k, v]) => ({ name: p.displayNames[k] ?? k, score: Math.tanh(v / 3) })),
    avoidedArtists: top(p.artist, 6, -1).map(([k, v]) => ({ name: p.displayNames[k] ?? k, score: Math.tanh(v / 3) })),
    genres: top(p.genre, 6).map(([k, v]) => ({ genre: k, score: Math.tanh(v / 3) })),
    neverCount: p.never.length,
    energyBias: p.energyBias,
    discoveryBias: p.discoveryBias,
  };
}

/** Music Journal → light signals (rule based; no LLM needed). */
export function journalSignals(text: string): { energyBias: number; discoveryBias: number; positive: boolean; negative: boolean } {
  const t = text.toLocaleLowerCase("tr");
  let energyBias = 0, discoveryBias = 0;
  if (/(yavaş|yavas|sakin kaldı|slow|sıkıcı|sikici|boring|uyuttu)/.test(t)) energyBias += 0.2;
  if (/(fazla hızlı|fazla hareketli|yorucu|çok gürültülü|too loud|exhausting|too fast)/.test(t)) energyBias -= 0.2;
  if (/(hep aynı|tekrar|bildik|predictable|same old)/.test(t)) discoveryBias += 5;
  if (/(tanımadığım|tanimadigim|bilmediğim|yabancı geldi|too obscure|didn't know)/.test(t)) discoveryBias -= 5;
  const positive = /(çok iyi|harika|süper|super|mükemmel|great|amazing|loved|bayıldı|iyi çalıştı|iyi calisti|worked)/.test(t);
  const negative = /(kötü|berbat|olmadı|bad|didn't work|sevmedi)/.test(t);
  return { energyBias, discoveryBias, positive, negative };
}
