/**
 * Role-preserving replacement: "find a song that serves the same purpose in
 * this spot", not "find a similar song".
 */
import type { MusicTrack, PlaylistBrief, PlaylistTrack, TrackRole } from "../types";
import { artistMatches, norm } from "../catalog";
import { genreSetSimilarity } from "../catalog/genres";
import type { EngineContext } from "./context";
import { passesFilters, scoreTrack } from "./scoring";
import { transitionScore } from "./transition";
import { energyOf, valenceOf } from "./features";
import { energyAt } from "./flow";
import { artistCap } from "./select";
import { clamp } from "./util";

export type ReplaceReason = "replace" | "dislike" | "remove" | "never" | "unavailable";

export interface ReplaceResult {
  track: MusicTrack;
  message: string;
  alternatives: MusicTrack[];
}

export function findReplacement(
  brief: PlaylistBrief,
  current: MusicTrack[],
  index: number,
  role: TrackRole,
  ctx: EngineContext,
  reason: ReplaceReason = "replace",
): ReplaceResult | null {
  const old = current[index];
  const prev = current[index - 1];
  const next = current[index + 1];
  const total = current.reduce((s, t) => s + t.durationSec, 0);
  const before = current.slice(0, index).reduce((s, t) => s + t.durationSec, 0);
  const mid = total ? (before + old.durationSec / 2) / total : 0.5;
  let targetE = energyAt(brief, mid);

  // Learn from *why* it was rejected: a disliked slow song → nudge toward more energy.
  const oldE = energyOf(old) * 10;
  let direction = 0;
  if (reason === "dislike" || reason === "never") {
    if (oldE < targetE - 0.5 || old.tags.includes("slow")) direction = 1;
    else if (oldE > targetE + 1.5) direction = -1;
    targetE += direction * 1.2;
  }

  const inList = new Set(current.map((t) => t.id));
  const cap = artistCap(brief, current.length);
  const artistCount = new Map<string, number>();
  for (const t of current) artistCount.set(norm(t.artist), (artistCount.get(norm(t.artist)) ?? 0) + 1);

  const ranked: [number, MusicTrack][] = [];
  for (const c of ctx.pool) {
    if (inList.has(c.id) || c.id === old.id) continue;
    if (!passesFilters(c, brief, ctx.taste)) continue;
    const a = norm(c.artist);
    const sameArtist = artistMatches(c.artist, old.artist);
    if (reason !== "replace" && sameArtist) continue;
    if (!sameArtist && (artistCount.get(a) ?? 0) >= cap && !brief.focusArtists.some((f) => artistMatches(c.artist, f))) continue;
    const s = scoreTrack(c, brief, ctx);
    let v = s.value;
    v += clamp(1 - Math.abs(energyOf(c) * 10 - targetE) / 3, -0.6, 1) * 0.8;
    if (prev) v += transitionScore(prev, c) * 0.35;
    if (next) v += transitionScore(c, next) * 0.35;
    if (role === "singalong" || role === "finale" || role === "peak") v += c.tags.includes("singalong") || c.tags.includes("anthem") ? 0.15 : 0;
    if (role === "opener" || role === "finale") v += (c.features.popularity ?? 0.5) * 0.1;
    const likeness = genreSetSimilarity(c.genres, old.genres) * 0.6 + (old.year && c.year ? Math.exp(-(((old.year - c.year) / 8) ** 2)) * 0.4 : 0.2);
    v += likeness * (reason === "replace" || reason === "unavailable" ? 0.35 : 0.15);
    v -= Math.abs(c.durationSec - old.durationSec) / 900; // keep total duration stable
    if (reason === "dislike" && Math.abs(valenceOf(c) - valenceOf(old)) < 0.05 && sameArtist) v -= 0.2;
    ranked.push([v, c]);
  }
  ranked.sort((x, y) => y[0] - x[0]);
  if (!ranked.length) return null;
  const pick = ranked[0][1];
  return { track: pick, message: replaceMessage(brief, old, pick, role, direction, reason), alternatives: ranked.slice(1, 4).map((r) => r[1]) };
}

function replaceMessage(b: PlaylistBrief, old: MusicTrack, pick: MusicTrack, role: TrackRole, direction: number, reason: ReplaceReason): string {
  const roleTr: Record<TrackRole, string> = {
    opener: "açılış", warmup: "ısınma", builder: "yükseliş", singalong: "eşlik", bridge: "köprü",
    peak: "zirve", reset: "nefes", cooldown: "soğuma", finale: "final",
  };
  if (b.lang === "en") {
    const dir = direction > 0 ? "a bit more energetic, less slow " : direction < 0 ? "a little calmer " : "";
    if (reason === "dislike" || reason === "never") return `Got it. I found ${dir}an alternative that keeps the ${role} spot: "${pick.title}" — ${pick.artist}.`;
    if (reason === "unavailable") return `"${old.title}" isn't available there. I suggest "${pick.title}" — ${pick.artist}, which plays the same ${role} role.`;
    return `Swapped "${old.title}" for "${pick.title}" — ${pick.artist}, keeping the ${role} role.`;
  }
  const dir = direction > 0 ? "daha az slow ve daha yüksek enerjili " : direction < 0 ? "biraz daha sakin " : "";
  if (reason === "dislike" || reason === "never") return `Tamam. ${roleTr[role]} rolünü koruyan ${dir}bir alternatif buldum: "${pick.title}" — ${pick.artist}.`;
  if (reason === "unavailable") return `"${old.title}" bu platformda bulunamadı. Aynı ${roleTr[role]} rolüne hizmet eden bir alternatif önerdim: "${pick.title}" — ${pick.artist}.`;
  return `"${old.title}" yerine aynı ${roleTr[role]} rolünü üstlenen "${pick.title}" — ${pick.artist} geldi.`;
}

/** Recompute transitions after an in-place change. */
export function relink(tracks: PlaylistTrack[], objs: MusicTrack[]): PlaylistTrack[] {
  return tracks.map((t, i) => ({
    ...t,
    position: i,
    transitionIn: i === 0 ? null : Math.round(transitionScore(objs[i - 1], objs[i]) * 100) / 100,
  }));
}
