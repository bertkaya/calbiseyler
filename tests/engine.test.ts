import { describe, expect, it } from "vitest";
import { allSeedTracks } from "../src/lib/catalog";
import { applyPatch, defaultBrief } from "../src/lib/engine/brief";
import { generatePlaylist } from "../src/lib/engine/generate";
import { energyAt } from "../src/lib/engine/flow";
import { transitionScore, shuffleFriendliness } from "../src/lib/engine/transition";
import { findReplacement } from "../src/lib/engine/replace";
import { understand } from "../src/lib/ai/intent";
import type { MusicTrack } from "../src/lib/types";

const pool = allSeedTracks();
const byTitle = (t: string) => pool.find((x) => x.title === t)!;

describe("catalog", () => {
  it("has unique ids and sane metadata", () => {
    const ids = new Set(pool.map((t) => t.id));
    expect(ids.size).toBe(pool.length);
    for (const t of pool) {
      expect(t.durationSec).toBeGreaterThan(60);
      expect(t.features.energy).toBeGreaterThanOrEqual(0);
      expect(t.features.energy).toBeLessThanOrEqual(1);
    }
  });
});

describe("transition score", () => {
  it("Şımarık → Çakkıdı is a great transition", () => {
    expect(transitionScore(byTitle("Şımarık"), byTitle("Çakkıdı"))).toBeGreaterThan(0.85);
  });
  it("party banger → Aşık Veysel is a poor one", () => {
    expect(transitionScore(byTitle("Şımarık"), byTitle("Uzun İnce Bir Yoldayım"))).toBeLessThan(0.5);
  });
  it("degrades gracefully without BPM/year", () => {
    const a: MusicTrack = { ...byTitle("Şımarık"), features: {}, year: undefined };
    const s = transitionScore(a, byTitle("Çakkıdı"));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("flow curves", () => {
  it("party curve rises toward its peak", () => {
    const b = { ...defaultBrief(), flow: "party_curve" as const, energy: 8, peakPosition: 0.75 };
    expect(energyAt(b, 0.75)).toBeGreaterThan(energyAt(b, 0.05) + 2);
  });
  it("segments shift a window", () => {
    const b = { ...defaultBrief(), flow: "flat" as const, energy: 7, durationMin: 120, segments: [{ startMin: 0, endMin: 30, delta: -2.5 }] };
    expect(energyAt(b, 0.1)).toBeCloseTo(4.5, 1);
    expect(energyAt(b, 0.8)).toBeCloseTo(7, 1);
  });
});

describe("generation pipeline", () => {
  it("hits the duration target (±tolerance) — never 94 min for 120", async () => {
    for (const prompt of ["2 saatlik eller havaya eski Türkçe şarkılar", "3 saatlik rakı sofrası türkçe", "2 saatlik road trip türkçe yabancı karışık"]) {
      const { brief } = await understand(prompt);
      const g = generatePlaylist(brief, { pool });
      expect(Math.abs(g.stats.totalSec - brief.durationMin * 60)).toBeLessThanOrEqual(Math.max(150, brief.durationMin * 60 * 0.025) + 1);
    }
  });

  it("strict duration lands within a minute", () => {
    const b = applyPatch(defaultBrief(), { durationMin: 90, durationStrict: true, turkishShare: 0.5 });
    const g = generatePlaylist(b, { pool });
    expect(Math.abs(g.stats.totalSec - 5400)).toBeLessThanOrEqual(60);
  });

  it("respects must-include and must-exclude", () => {
    const b = applyPatch(defaultBrief(), {
      durationMin: 60,
      include: { artists: ["Tarkan"], trackIds: [byTitle("Dancing Queen").id], trackNames: [], genres: [], tags: [] },
      exclude: { artists: ["Sezen Aksu"], trackIds: [], trackNames: [], genres: ["arabesk"], tags: ["slow"] },
    });
    const g = generatePlaylist(b, { pool });
    const tracks = g.trackObjects;
    expect(tracks.some((t) => t.artist === "Tarkan")).toBe(true);
    expect(tracks.some((t) => t.title === "Dancing Queen")).toBe(true);
    expect(tracks.some((t) => t.artist === "Sezen Aksu")).toBe(false);
    expect(tracks.some((t) => t.genres[0] === "arabesk")).toBe(false);
    expect(tracks.some((t) => t.tags.includes("slow"))).toBe(false);
  });

  it("filters explicit tracks when explicit is off", () => {
    const b = applyPatch(defaultBrief(), { durationMin: 120, explicit: false, genres: ["tr-rap", "rnb-hiphop"] });
    expect(generatePlaylist(b, { pool }).trackObjects.some((t) => t.explicit)).toBe(false);
  });

  it("limits artist repetition but honours 'X ağırlıklı'", async () => {
    const low = applyPatch(defaultBrief(), { durationMin: 120, turkishShare: 1, artistRepetition: "low" });
    const counts = (ts: MusicTrack[]) => ts.reduce<Record<string, number>>((m, t) => ((m[t.artist] = (m[t.artist] ?? 0) + 1), m), {});
    const g1 = generatePlaylist(low, { pool });
    expect(Math.max(...Object.values(counts(g1.trackObjects)))).toBeLessThanOrEqual(2);
    const { brief } = await understand("2 saatlik Tarkan ağırlıklı parti");
    const g2 = generatePlaylist(brief, { pool });
    expect(counts(g2.trackObjects)["Tarkan"]).toBeGreaterThanOrEqual(4);
  });

  it("no back-to-back same artist in a normal playlist", async () => {
    const { brief } = await understand("3 saatlik Türkçe parti");
    const ts = generatePlaylist(brief, { pool }).trackObjects;
    const adjacent = ts.filter((t, i) => i > 0 && ts[i - 1].artist === t.artist).length;
    expect(adjacent).toBeLessThanOrEqual(1);
  });

  it("shuffle mode produces a more cohesive set", () => {
    const base = applyPatch(defaultBrief(), { durationMin: 120, turkishShare: 0.5 });
    const seq = generatePlaylist(base, { pool });
    const shuf = generatePlaylist({ ...base, mode: "shuffle" }, { pool });
    expect(shuffleFriendliness(shuf.trackObjects)).toBeGreaterThanOrEqual(shuffleFriendliness(seq.trackObjects) - 0.02);
  });

  it("is deterministic for the same brief", async () => {
    const { brief } = await understand("2 saatlik 90'lar Türkçe pop");
    const a = generatePlaylist(brief, { pool }).tracks.map((t) => t.trackId);
    const b = generatePlaylist(brief, { pool }).tracks.map((t) => t.trackId);
    expect(a).toEqual(b);
  });

  it("offers to widen a strict era when the pool is thin (sommelier suggestion)", async () => {
    const { brief } = await understand("3 saatlik sadece 90'lar Türkçe pop eller havaya");
    const g = generatePlaylist(brief, { pool });
    expect(g.suggestions.map((s) => s.id)).toContain("widen-era");
  });

  it("edits keep most tracks (keep bonus)", async () => {
    const { brief } = await understand("2 saatlik Türkçe parti");
    const g1 = generatePlaylist(brief, { pool });
    const keep = new Set(g1.tracks.map((t) => t.trackId));
    const b2 = applyPatch(brief, { segments: [{ startMin: 0, endMin: 30, delta: -1.5 }] });
    const g2 = generatePlaylist(b2, { pool, keepTrackIds: keep, keepBonus: 0.25 });
    const kept = g2.tracks.filter((t) => keep.has(t.trackId)).length;
    expect(kept / g1.tracks.length).toBeGreaterThan(0.7);
  });
});

describe("role-preserving replacement", () => {
  it("replaces a peak track with a high-energy track, not a ballad", async () => {
    const { brief } = await understand("2 saatlik eller havaya Türkçe parti");
    const g = generatePlaylist(brief, { pool });
    const idx = g.tracks.findIndex((t) => t.role === "peak");
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = findReplacement(brief, g.trackObjects, idx, "peak", { pool }, "dislike")!;
    expect(r).toBeTruthy();
    expect(r.track.features.energy!).toBeGreaterThanOrEqual(0.7);
    expect(g.trackObjects.map((t) => t.id)).not.toContain(r.track.id);
  });
});
