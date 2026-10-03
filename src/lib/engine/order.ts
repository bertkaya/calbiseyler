/**
 * Final ordering via simulated annealing over a cost that balances the
 * energy curve, A→B transitions, artist spacing and opener/finale roles.
 */
import type { MusicTrack, PlaylistBrief } from "../types";
import { artistMatches, norm } from "../catalog";
import { transitionScore } from "./transition";
import { energyOf, popularityOf } from "./features";
import { energyAt } from "./flow";
import { rng } from "./util";

export function optimizeOrder(input: MusicTrack[], brief: PlaylistBrief): MusicTrack[] {
  const n = input.length;
  if (n <= 2) return input;
  const rand = rng(brief.seed * 7919 + n);
  const T = input.map((a) => input.map((b) => (a === b ? 0 : transitionScore(a, b))));
  const E = input.map((t) => energyOf(t) * 10);
  const D = input.map((t) => t.durationSec);
  const total = D.reduce((a, b) => a + b, 0);
  const artists = input.map((t) => norm(t.artist));
  const focus = input.map((t) => brief.focusArtists.some((a) => artistMatches(t.artist, a)));
  const pop = input.map(popularityOf);
  const finaleFit = input.map((t) => (t.tags.includes("anthem") ? 1 : t.tags.includes("singalong") ? 0.85 : popularityOf(t) * 0.8));
  const shuffle = brief.mode === "shuffle";
  const wF = shuffle ? 0.25 : 1;
  const wT = shuffle ? 0.25 : 1;
  const curve = Array.from({ length: 201 }, (_, i) => energyAt(brief, i / 200));
  const target = (t: number) => curve[Math.min(200, Math.max(0, Math.round(t * 200)))];

  const cost = (ord: number[]): number => {
    let flow = 0, trans = 0, art = 0, acc = 0;
    for (let i = 0; i < n; i++) {
      const id = ord[i];
      const mid = (acc + D[id] / 2) / total;
      acc += D[id];
      const d = E[id] - target(mid);
      flow += d * d;
      if (i > 0) trans += 1 - T[ord[i - 1]][id];
      for (let k = 1; k <= 3 && i + k < n; k++) {
        if (artists[ord[i + k]] === artists[id]) art += (focus[id] ? 0.4 : 1) / k;
      }
    }
    const first = ord[0], last = ord[n - 1];
    const roles = (1 - pop[first]) * 0.1 + Math.max(0, Math.abs(E[first] - target(0)) - 1) * 0.06 + (1 - finaleFit[last]) * 0.12;
    return (wF * flow) / n / 4 + (wT * trans * 3) / (n - 1) + art * 0.12 + roles;
  };

  // Initial order: rank-match track energies to slot target energies.
  const slotT = Array.from({ length: n }, (_, i) => ({ i, e: target((i + 0.5) / n) })).sort((a, b) => a.e - b.e);
  const byE = input.map((_, i) => i).sort((a, b) => E[a] - E[b]);
  let ord = Array(n) as number[];
  slotT.forEach((s, r) => (ord[s.i] = byE[r]));

  let cur = cost(ord);
  let best = ord.slice(), bestCost = cur;
  const iters = Math.min(40000, 2500 + n * n * 8);
  const t0 = 0.05, t1 = 0.0005;
  for (let it = 0; it < iters; it++) {
    const temp = t0 * Math.pow(t1 / t0, it / iters);
    const cand = ord.slice();
    const i = Math.floor(rand() * n);
    let j = Math.floor(rand() * n);
    if (i === j) j = (j + 1) % n;
    const [a, b] = i < j ? [i, j] : [j, i];
    if (rand() < 0.7) {
      [cand[a], cand[b]] = [cand[b], cand[a]];
    } else {
      const hi = Math.min(b, a + 6);
      cand.splice(a, hi - a + 1, ...cand.slice(a, hi + 1).reverse());
    }
    const c = cost(cand);
    if (c < cur || rand() < Math.exp((cur - c) / temp)) {
      ord = cand;
      cur = c;
      if (c < bestCost) { bestCost = c; best = cand.slice(); }
    }
  }
  return best.map((i) => input[i]);
}
