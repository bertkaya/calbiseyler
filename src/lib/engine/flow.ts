/**
 * Playlist Engineer: the energy story. energyAt(t) returns the target energy
 * (1..10) at relative time t ∈ [0,1].
 */
import type { FlowShape, PlaylistBrief } from "../types";
import { clamp, clamp10 } from "./util";

/** Normalised shape 0..1 (0 = calmest, 1 = peak). */
export function shapeAt(shape: FlowShape, t: number, peak: number): number {
  switch (shape) {
    case "flat":
      return 0.5;
    case "gradual_rise":
      return 0.1 + 0.9 * Math.pow(t, 0.9);
    case "wind_down":
      return 1 - 0.9 * Math.pow(t, 0.9);
    case "party_curve": {
      const p = clamp(peak, 0.4, 0.92);
      if (t <= p) return 0.15 + 0.85 * Math.pow(t / p, 1.4);
      return 1 - 0.3 * Math.pow((t - p) / (1 - p), 1.6);
    }
    case "peak_early": {
      const p = Math.min(peak, 0.35);
      if (t <= p) return 0.4 + 0.6 * Math.pow(t / p, 0.8);
      return 1 - 0.6 * Math.pow((t - p) / (1 - p), 0.9);
    }
    case "peak_late": {
      const p = Math.max(peak, 0.72);
      if (t <= p) return 0.1 + 0.9 * Math.pow(t / p, 1.8);
      return 1 - 0.15 * ((t - p) / (1 - p));
    }
    case "rollercoaster":
      return clamp(0.45 + 0.1 * t + 0.38 * Math.sin(2 * Math.PI * 2.5 * t - Math.PI / 2));
    case "custom":
      return 0.5;
  }
}

function customAt(curve: number[], t: number): number {
  if (!curve.length) return 6;
  if (curve.length === 1) return curve[0];
  const x = t * (curve.length - 1);
  const i = Math.min(Math.floor(x), curve.length - 2);
  const f = x - i;
  return curve[i] * (1 - f) + curve[i + 1] * f;
}

export function amplitude(brief: PlaylistBrief): number {
  let amp = brief.flow === "flat" ? 0 : 4;
  if (brief.mode === "shuffle") amp *= 0.35;
  return amp;
}

/** Target energy 1..10 at relative time t. */
export function energyAt(brief: PlaylistBrief, t: number): number {
  let e: number;
  if (brief.flow === "custom" && brief.customCurve?.length) {
    e = customAt(brief.customCurve, t);
  } else {
    const amp = amplitude(brief);
    // Center the curve on the requested energy so the average stays where the user asked.
    const meanShape = shapeMean(brief);
    e = brief.energy + amp * (shapeAt(brief.flow, t, brief.peakPosition) - meanShape);
  }
  const minute = t * brief.durationMin;
  for (const s of brief.segments) {
    const ramp = 3; // minutes of soft edge
    const w =
      minute < s.startMin - ramp || minute > s.endMin + ramp
        ? 0
        : minute < s.startMin
          ? 1 - (s.startMin - minute) / ramp
          : minute > s.endMin
            ? 1 - (minute - s.endMin) / ramp
            : 1;
    e += s.delta * w;
  }
  return clamp10(e);
}

const meanCache = new Map<string, number>();
function shapeMean(brief: PlaylistBrief): number {
  const k = `${brief.flow}:${brief.peakPosition.toFixed(2)}`;
  let m = meanCache.get(k);
  if (m === undefined) {
    let s = 0;
    for (let i = 0; i < 50; i++) s += shapeAt(brief.flow, (i + 0.5) / 50, brief.peakPosition);
    m = s / 50;
    meanCache.set(k, m);
  }
  return m;
}

/** Sampled curve for charts (n points). */
export function sampleCurve(brief: PlaylistBrief, n = 48): number[] {
  return Array.from({ length: n }, (_, i) => Math.round(energyAt(brief, i / (n - 1)) * 10) / 10);
}

/** Relative position (0..1) where the target curve peaks. */
export function peakTime(brief: PlaylistBrief): number {
  let best = 0, bt = 0;
  for (let i = 0; i <= 60; i++) {
    const e = energyAt(brief, i / 60);
    if (e > best + 1e-6) { best = e; bt = i / 60; }
  }
  return bt;
}
