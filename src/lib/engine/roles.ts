import type { MusicTrack, PlaylistBrief, TrackRole } from "../types";
import { genreSetSimilarity } from "../catalog/genres";
import { energyAt } from "./flow";
import { energyOf } from "./features";

/** Assign playlist roles from position on the target curve + track character. */
export function assignRoles(tracks: MusicTrack[], brief: PlaylistBrief): TrackRole[] {
  const n = tracks.length;
  if (!n) return [];
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  let acc = 0;
  const mids = tracks.map((t) => {
    const m = (acc + t.durationSec / 2) / total;
    acc += t.durationSec;
    return m;
  });
  const targets = mids.map((m) => energyAt(brief, m));
  const maxT = Math.max(...targets);
  const minT = Math.min(...targets);
  const range = Math.max(0.5, maxT - minT);

  return tracks.map((t, i): TrackRole => {
    if (i === 0) return "opener";
    if (i === n - 1) return "finale";
    const m = mids[i];
    const e = targets[i];
    const slope = energyAt(brief, Math.min(1, m + 0.03)) - energyAt(brief, Math.max(0, m - 0.03));
    const rel = (e - minT) / range;
    const prevPeakPassed = targets.slice(0, i).some((x) => x >= maxT - 0.3);
    if (rel >= 0.85 && energyOf(t) * 10 >= e - 1.5) return "peak";
    if (prevPeakPassed && slope < -0.05 && rel < 0.45) return "reset";
    if (prevPeakPassed && slope < -0.02) return "cooldown";
    if (genreSetSimilarity(tracks[i - 1].genres, t.genres) < 0.45 && i + 1 < n && genreSetSimilarity(t.genres, tracks[i + 1].genres) >= 0.45)
      return "bridge";
    if (t.tags.includes("singalong") && rel >= 0.4) return "singalong";
    if (m < 0.22 && slope >= 0) return "warmup";
    if (slope > 0.02) return "builder";
    return t.tags.includes("singalong") ? "singalong" : "warmup";
  });
}

export const ROLE_LABEL: Record<TrackRole, { tr: string; en: string }> = {
  opener: { tr: "Açılış", en: "Opener" },
  warmup: { tr: "Isınma", en: "Warm-up" },
  builder: { tr: "Yükseliş", en: "Builder" },
  singalong: { tr: "Eşlik", en: "Sing-along" },
  bridge: { tr: "Köprü", en: "Bridge" },
  peak: { tr: "Zirve", en: "Peak" },
  reset: { tr: "Nefes", en: "Reset" },
  cooldown: { tr: "Soğuma", en: "Cooldown" },
  finale: { tr: "Final", en: "Finale" },
};
