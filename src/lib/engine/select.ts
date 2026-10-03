/**
 * Selection: diversity + quotas + duration fit. Produces the set of tracks
 * (roughly in slot order); order.ts then optimizes the final sequence.
 */
import type { PlaylistBrief } from "../types";
import { norm } from "../catalog";
import { artistMatches } from "../catalog";
import type { ScoredTrack } from "./scoring";
import { transitionScore } from "./transition";
import { energyOf } from "./features";
import { energyAt } from "./flow";
import { clamp, mean } from "./util";

export function durationTolerance(brief: PlaylistBrief): number {
  const T = brief.durationMin * 60;
  return brief.durationStrict ? 60 : Math.max(150, T * 0.025);
}

export function artistCap(brief: PlaylistBrief, n: number): number {
  switch (brief.artistRepetition) {
    case "low": return Math.max(1, Math.ceil(n / 40));
    case "medium": return Math.max(2, Math.ceil(n / 18));
    case "high": return Math.max(3, Math.ceil(n / 7));
  }
}

interface State {
  picked: ScoredTrack[];
  artistCount: Map<string, number>;
  genreCount: number[];
  trCount: number;
  discCount: number;
}

export function selectTracks(scored: ScoredTrack[], brief: PlaylistBrief): ScoredTrack[] {
  const T = brief.durationMin * 60;
  const tol = durationTolerance(brief);
  if (!scored.length) return [];
  const top = scored.slice(0, 60);
  const avgDur = mean(top.map((s) => s.track.durationSec)) || 230;
  const n = Math.max(3, Math.round(T / avgDur));
  const cap = artistCap(brief, n);
  const focusCap = Math.max(cap + 1, Math.ceil(n * 0.3));
  const k = brief.genres.length;
  const genreTarget = k > 1 ? n / k : 0;
  const trTarget =
    brief.turkishShare !== null && brief.turkishShare > 0 && brief.turkishShare < 1 ? Math.round(brief.turkishShare * n) : null;
  const discTarget = Math.round((brief.discovery / 100) * n);

  const st: State = { picked: [], artistCount: new Map(), genreCount: Array(k).fill(0), trCount: 0, discCount: 0 };
  const available = new Set(scored);
  const isFocus = (s: ScoredTrack) => brief.focusArtists.some((a) => artistMatches(s.track.artist, a));
  const capFor = (s: ScoredTrack) => (isFocus(s) ? focusCap : cap);

  const add = (s: ScoredTrack) => {
    st.picked.push(s);
    available.delete(s);
    const a = norm(s.track.artist);
    st.artistCount.set(a, (st.artistCount.get(a) ?? 0) + 1);
    if (s.genreSlot >= 0) st.genreCount[s.genreSlot]++;
    if (s.track.language === "tr") st.trCount++;
    if (!s.familiar) st.discCount++;
  };
  const remove = (s: ScoredTrack) => {
    st.picked.splice(st.picked.indexOf(s), 1);
    available.add(s);
    const a = norm(s.track.artist);
    st.artistCount.set(a, (st.artistCount.get(a) ?? 1) - 1);
    if (s.genreSlot >= 0) st.genreCount[s.genreSlot]--;
    if (s.track.language === "tr") st.trCount--;
    if (!s.familiar) st.discCount--;
  };

  const slotValue = (s: ScoredTrack, targetE: number | null, prev?: ScoredTrack): number => {
    const a = norm(s.track.artist);
    const count = st.artistCount.get(a) ?? 0;
    if (!s.included && count >= capFor(s)) return -Infinity;
    let v = s.value - count * 0.05;
    if (targetE !== null) v += clamp(1 - Math.abs(energyOf(s.track) * 10 - targetE) / 4, -0.5, 1) * 0.6;
    if (genreTarget && s.genreSlot >= 0) v += st.genreCount[s.genreSlot] < genreTarget ? 0.15 : -0.1;
    if (trTarget !== null) {
      const isTr = s.track.language === "tr";
      const trDeficit = st.trCount < trTarget;
      const otherDeficit = st.picked.length - st.trCount < n - trTarget;
      v += isTr ? (trDeficit ? 0.12 : -0.12) : otherDeficit ? 0.12 : -0.12;
    }
    if (!s.familiar) v += st.discCount < discTarget ? 0.1 : -0.08;
    if (prev) v += transitionScore(prev.track, s.track) * 0.15;
    return v;
  };

  // 1) Must-includes take the slots whose target energy suits them best.
  const slotTargets = Array.from({ length: n }, (_, i) => energyAt(brief, (i + 0.5) / n));
  const slots: (ScoredTrack | null)[] = Array(n).fill(null);
  for (const s of scored.filter((x) => x.included)) {
    let best = -1, bestD = Infinity;
    slots.forEach((occ, i) => {
      const d = Math.abs(energyOf(s.track) * 10 - slotTargets[i]);
      if (!occ && d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) slots[best] = s;
    else slots.push(s);
    add(s);
  }

  // 2) Greedy slot filling.
  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    const prev = i > 0 ? slots[i - 1] ?? undefined : undefined;
    let best: ScoredTrack | null = null, bv = -Infinity;
    for (const s of available) {
      const v = slotValue(s, slotTargets[i], prev);
      if (v > bv) { bv = v; best = s; }
    }
    if (!best) break;
    slots[i] = best;
    add(best);
  }
  st.picked = slots.filter((x): x is ScoredTrack => !!x);

  // 3) Duration fit.
  const total = () => st.picked.reduce((s, x) => s + x.track.durationSec, 0);
  const meanTarget = mean(slotTargets);
  for (let iter = 0; iter < 400; iter++) {
    const diff = total() - T;
    if (Math.abs(diff) <= tol) break;
    if (diff < 0) {
      const need = -diff;
      let best: ScoredTrack | null = null, bv = -Infinity;
      for (const s of available) {
        let v = slotValue(s, meanTarget);
        if (v === -Infinity) continue;
        if (need < avgDur * 1.5) v -= Math.abs(s.track.durationSec - need) / 600;
        if (v > bv) { bv = v; best = s; }
      }
      if (!best) break;
      add(best);
    } else {
      let worst: ScoredTrack | null = null, wv = Infinity;
      for (const s of st.picked) {
        if (s.included) continue;
        let v = s.value;
        if (diff < avgDur * 1.5) v += Math.abs(s.track.durationSec - diff) / 600;
        if (v < wv) { wv = v; worst = s; }
      }
      if (!worst) break;
      remove(worst);
    }
  }

  // 4) Swap refinement to land closer to the target (tighter when strict).
  const goal = brief.durationStrict ? 30 : tol / 2;
  for (let round = 0; round < 12; round++) {
    const diff = total() - T;
    if (Math.abs(diff) <= goal) break;
    let bestPair: [ScoredTrack, ScoredTrack] | null = null, bestGain = 0;
    for (const s of st.picked) {
      if (s.included) continue;
      for (const c of available) {
        const nd = Math.abs(diff - s.track.durationSec + c.track.durationSec);
        const gain = Math.abs(diff) - nd;
        if (gain <= 5 || c.value < s.value - 0.15) continue;
        const a = norm(c.track.artist);
        if (norm(s.track.artist) !== a && (st.artistCount.get(a) ?? 0) >= capFor(c)) continue;
        const score = gain / 60 + (c.value - s.value);
        if (score > bestGain) { bestGain = score; bestPair = [s, c]; }
      }
    }
    if (!bestPair) break;
    const idx = st.picked.indexOf(bestPair[0]);
    remove(bestPair[0]);
    add(bestPair[1]);
    // keep slot position for the newcomer
    st.picked.splice(st.picked.indexOf(bestPair[1]), 1);
    st.picked.splice(idx, 0, bestPair[1]);
  }
  return st.picked;
}
