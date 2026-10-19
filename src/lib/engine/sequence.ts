/**
 * Smart Flow Sequencing (Akış Sıralaması: Isınma → Zirve → Kapanış)
 * Re-orders an existing set of tracks along an energy/BPM curve without dropping tracks.
 */
import type { FlowShape, MusicTrack, PlaylistBrief, TrackRole } from "../types";
import { norm } from "../catalog";
import { bpmOf, danceOf, energyOf, popularityOf } from "./features";
import { optimizeOrder } from "./order";
import { transitionScore } from "./transition";
import { clamp } from "./util";

export type SequenceMode = "arc" | "gradual_rise" | "bpm_smooth" | "wind_down";

export interface FlowPhaseSummary {
  phase: "warmup" | "peak" | "cooldown";
  label: { tr: string; en: string };
  trackCount: number;
  durationSec: number;
  avgEnergy: number; // 1..10
  avgBpm: number;
}

export function sequenceModeToFlow(mode: SequenceMode, currentFlow: FlowShape): FlowShape {
  switch (mode) {
    case "arc":
      return "party_curve";
    case "gradual_rise":
      return "gradual_rise";
    case "wind_down":
      return "wind_down";
    case "bpm_smooth":
      return currentFlow;
  }
}

/**
 * Computes a 3-act DJ arc target energy (0..1) for Warm-up -> Peak -> Cooldown:
 * - Warm-up (0.00 .. 0.30): gentle rise from 0.25 to 0.68
 * - Peak    (0.30 .. 0.75): high energy plateau/crest 0.75 to 1.00
 * - Cooldown(0.75 .. 1.00): smooth landing from 0.72 down to 0.30
 */
export function arcTargetAt(t: number): number {
  const x = clamp(t, 0, 1);
  if (x <= 0.3) {
    const u = x / 0.3;
    return 0.25 + 0.43 * Math.pow(u, 1.15);
  }
  if (x <= 0.75) {
    const u = (x - 0.3) / 0.45;
    // Crest around t = 0.60 (u = 0.67)
    return 0.72 + 0.28 * Math.sin(Math.min(1, u / 0.85) * (Math.PI * 0.75));
  }
  const u = (x - 0.75) / 0.25;
  return 0.72 - 0.42 * Math.pow(u, 1.1);
}

/**
 * Re-sequences a playlist's existing tracks according to the chosen SequenceMode
 * while keeping locked tracks anchored near their preferred positions or roles.
 */
export function resequenceTracks(
  tracks: MusicTrack[],
  brief: PlaylistBrief,
  mode: SequenceMode,
): { ordered: MusicTrack[]; flow: FlowShape; peakPosition: number } {
  const n = tracks.length;
  const nextFlow = sequenceModeToFlow(mode, brief.flow);
  const nextPeak = mode === "arc" ? 0.65 : mode === "gradual_rise" ? 0.88 : mode === "wind_down" ? 0.15 : brief.peakPosition;

  if (n <= 2) {
    return { ordered: tracks.slice(), flow: nextFlow, peakPosition: nextPeak };
  }

  if (mode === "bpm_smooth") {
    return {
      ordered: orderBySmoothBpm(tracks),
      flow: nextFlow,
      peakPosition: nextPeak,
    };
  }

  if (mode === "arc") {
    return {
      ordered: orderByThreeActArc(tracks, { ...brief, flow: "party_curve", peakPosition: 0.65 }),
      flow: "party_curve",
      peakPosition: 0.65,
    };
  }

  const updatedBrief: PlaylistBrief = {
    ...brief,
    flow: nextFlow,
    peakPosition: nextPeak,
    mode: "sequential",
  };
  return {
    ordered: optimizeOrder(tracks, updatedBrief),
    flow: nextFlow,
    peakPosition: nextPeak,
  };
}

/**
 * Explicit 3-act sequencing (Isınma → Zirve → Kapanış):
 * Partitions tracks into Warm-up (~30%), Peak (~45%), and Cooldown (~25%)
 * based on energy, danceability, BPM, and anthem/singalong character, then
 * smooths transitions within and across phase boundaries.
 */
function orderByThreeActArc(tracks: MusicTrack[], brief: PlaylistBrief): MusicTrack[] {
  const n = tracks.length;
  const warmupCount = Math.max(1, Math.round(n * 0.3));
  const cooldownCount = Math.max(1, Math.round(n * 0.25));
  const peakCount = Math.max(1, n - warmupCount - cooldownCount);

  const scored = tracks.map((track) => {
    const e = energyOf(track);
    const d = danceOf(track);
    const pop = popularityOf(track);
    const anthemBoost = track.tags.includes("anthem") || track.tags.includes("singalong") ? 0.08 : 0;
    const slowPenalty = track.tags.includes("slow") ? -0.08 : 0;
    const intensity = e * 0.62 + d * 0.23 + pop * 0.07 + anthemBoost + slowPenalty;
    return { track, intensity, e, bpm: bpmOf(track) };
  });

  // Sort ascending by intensity
  const asc = scored.slice().sort((a, b) => a.intensity - b.intensity || a.bpm - b.bpm);
  const highest = asc.slice(asc.length - peakCount);
  const lower = asc.slice(0, asc.length - peakCount);

  // Split lower tracks between warmup (moderately rising) and cooldown (melodic/slower landing)
  const warmupPool: MusicTrack[] = [];
  const cooldownPool: MusicTrack[] = [];
  lower.forEach((item, idx) => {
    if (warmupPool.length < warmupCount && (idx % 2 === 0 || cooldownPool.length >= cooldownCount)) {
      warmupPool.push(item.track);
    } else {
      cooldownPool.push(item.track);
    }
  });

  // Warm-up rises in energy & BPM
  warmupPool.sort((a, b) => energyOf(a) - energyOf(b) || bpmOf(a) - bpmOf(b));
  // Peak crests near the middle-late part of the peak phase
  const peakSorted = highest.map((x) => x.track).sort((a, b) => energyOf(a) - energyOf(b) || danceOf(a) - danceOf(b));
  const peakArc: MusicTrack[] = [];
  peakSorted.forEach((t, i) => {
    if (i % 2 === 0) peakArc.push(t);
    else peakArc.unshift(t);
  });
  // Ensure the peak's highest-energy track sits slightly after the midpoint of the peak block
  peakArc.sort((a, b) => energyOf(a) - energyOf(b));
  const topPeak = peakArc.splice(Math.max(0, peakArc.length - Math.ceil(peakArc.length * 0.6)));
  const tailPeak = peakArc.reverse();
  const arrangedPeak = [...topPeak, ...tailPeak];

  // Cooldown descends smoothly from medium-low energy down to a memorable finale
  cooldownPool.sort((a, b) => energyOf(b) - energyOf(a) || bpmOf(b) - bpmOf(a));

  const combined = [...warmupPool, ...arrangedPeak, ...cooldownPool];
  // Run transition & artist-spacing polish pass within phase windows
  return smoothLocalTransitions(combined, brief);
}

function smoothLocalTransitions(tracks: MusicTrack[], _brief: PlaylistBrief): MusicTrack[] {
  const out = tracks.slice();
  const n = out.length;
  // Local 2-opt swaps within a narrow radius (max distance 2) to avoid artist collisions and harsh BPM jumps
  // without breaking the macro Warmup -> Peak -> Cooldown energy arc.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 2; i++) {
      const prev = out[i - 1];
      const a = out[i];
      const b = out[i + 1];
      const next = out[i + 2];
      const energyGap = Math.abs(energyOf(a) - energyOf(b));
      if (energyGap > 0.14) continue; // preserve macro energy ordering
      const sameArtistAdj = norm(prev.artist) === norm(a.artist) || norm(b.artist) === norm(next.artist);
      const curScore = transitionScore(prev, a) + transitionScore(a, b) + transitionScore(b, next) - (sameArtistAdj ? 0.35 : 0);
      const swapArtistAdj = norm(prev.artist) === norm(b.artist) || norm(a.artist) === norm(next.artist);
      const swapScore = transitionScore(prev, b) + transitionScore(b, a) + transitionScore(a, next) - (swapArtistAdj ? 0.35 : 0);
      if (swapScore > curScore + 0.02) {
        out[i] = b;
        out[i + 1] = a;
      }
    }
  }
  return out;
}

/**
 * Orders tracks to create a smooth tempo (BPM) & transition progression.
 */
function orderBySmoothBpm(tracks: MusicTrack[]): MusicTrack[] {
  if (tracks.length <= 2) return tracks.slice();
  const remaining = tracks.slice().sort((a, b) => bpmOf(a) - bpmOf(b) || energyOf(a) - energyOf(b));
  const result: MusicTrack[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = result[result.length - 1];
    const lastBpm = bpmOf(last);
    let bestIdx = 0;
    let bestVal = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const bpmDiff = Math.abs(bpmOf(cand) - lastBpm);
      const trans = transitionScore(last, cand);
      const sameArtistPenalty = norm(cand.artist) === norm(last.artist) ? 0.4 : 0;
      // Prefer gentle upward or steady BPM progression + high transition score
      const score = trans * 0.65 - (bpmDiff / 60) * 0.35 - sameArtistPenalty;
      if (score > bestVal) {
        bestVal = score;
        bestIdx = i;
      }
    }
    result.push(remaining.splice(bestIdx, 1)[0]);
  }
  return result;
}

/**
 * Summarizes the playlist into 3 intuitive phases:
 * Isınma (Warm-up), Zirve (Peak), and Kapanış (Cooldown).
 */
export function summarizeFlowPhases(tracks: MusicTrack[], _roles?: TrackRole[]): FlowPhaseSummary[] {
  const n = tracks.length;
  if (n === 0) return [];

  const warmEnd = Math.max(1, Math.round(n * 0.3));
  const coolStart = Math.min(n - 1, Math.max(warmEnd + 1, n - Math.max(1, Math.round(n * 0.25))));

  const slices: { phase: FlowPhaseSummary["phase"]; label: { tr: string; en: string }; list: MusicTrack[] }[] = [
    { phase: "warmup", label: { tr: "Isınma", en: "Warm-up" }, list: tracks.slice(0, warmEnd) },
    { phase: "peak", label: { tr: "Zirve", en: "Peak" }, list: tracks.slice(warmEnd, coolStart) },
    { phase: "cooldown", label: { tr: "Kapanış", en: "Cooldown" }, list: tracks.slice(coolStart) },
  ];

  return slices
    .filter((s) => s.list.length > 0)
    .map((s) => {
      const count = s.list.length;
      const durationSec = s.list.reduce((acc, t) => acc + t.durationSec, 0);
      const avgEnergy = Math.round((s.list.reduce((acc, t) => acc + energyOf(t) * 10, 0) / count) * 10) / 10;
      const avgBpm = Math.round(s.list.reduce((acc, t) => acc + bpmOf(t), 0) / count);
      return {
        phase: s.phase,
        label: s.label,
        trackCount: count,
        durationSec,
        avgEnergy,
        avgBpm,
      };
    });
}
