import type { MusicTrack, PlaylistDNA, PlaylistStats } from "../types";
import type { TasteSignals } from "./context";
import { acousticOf, danceOf, energyOf, nostalgiaOf, popularityOf, valenceOf } from "./features";
import { familiarity } from "./scoring";
import { shuffleFriendliness, transitionScore } from "./transition";
import { mean } from "./util";

const pct = (x: number) => Math.round(x * 100);

export function computeDNA(tracks: MusicTrack[], taste?: TasteSignals | null): PlaylistDNA {
  if (!tracks.length) return { nostalgia: 0, energy: 0, dance: 0, mainstream: 0, discovery: 0, turkish: 0, happiness: 0, acoustic: 0 };
  return {
    nostalgia: pct(mean(tracks.map((t) => nostalgiaOf(t)))),
    energy: pct(mean(tracks.map(energyOf))),
    dance: pct(mean(tracks.map(danceOf))),
    mainstream: pct(mean(tracks.map(popularityOf))),
    discovery: pct(tracks.filter((t) => familiarity(t, taste) < 0.55).length / tracks.length),
    turkish: pct(tracks.filter((t) => t.language === "tr").length / tracks.length),
    happiness: pct(mean(tracks.map(valenceOf))),
    acoustic: pct(mean(tracks.map(acousticOf))),
  };
}

export function transitionsOf(tracks: MusicTrack[]): (number | null)[] {
  return tracks.map((t, i) => (i === 0 ? null : transitionScore(tracks[i - 1], t)));
}

export function computeStats(tracks: MusicTrack[]): PlaylistStats {
  const trans = transitionsOf(tracks).filter((x): x is number => x !== null);
  return {
    totalSec: tracks.reduce((s, t) => s + t.durationSec, 0),
    trackCount: tracks.length,
    avgTransition: Math.round(mean(trans) * 100) / 100,
    shuffleFriendly: Math.round(shuffleFriendliness(tracks) * 100) / 100,
    energyAvg: Math.round(mean(tracks.map(energyOf)) * 100) / 10,
    estimatedShare: tracks.length ? tracks.filter((t) => t.estimated).length / tracks.length : 0,
  };
}
