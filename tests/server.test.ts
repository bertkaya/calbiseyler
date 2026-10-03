import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { resetDbForTests } from "../src/lib/db";
import * as svc from "../src/lib/server/playlists";
import * as repo from "../src/lib/server/repo";
import { encrypt, decrypt, sign, unsign } from "../src/lib/server/crypto";
import { parseTextList } from "../src/lib/server/import-text";
import { scoreCandidate } from "../src/lib/providers/matcher";
import { allSeedTracks } from "../src/lib/catalog";

const USER = "u_test";

beforeEach(() => {
  resetDbForTests();
  repo.ensureUser(USER);
});

describe("service layer", () => {
  it("creates, edits, replaces, undoes", async () => {
    const out = await svc.createPlaylist(USER, { prompt: "2 saatlik 90'lar Türkçe pop, yüksek enerjili, parti için." });
    expect(out.status).toBe("created");
    if (out.status !== "created") return;
    const id = out.playlist.id;
    expect(out.playlist.items.length).toBeGreaterThan(20);

    const e = await svc.editWithText(USER, id, "İlk 30 dakika biraz daha sakin olsun");
    expect(e.playlist.brief.segments.length).toBe(1);
    expect(e.diff.kept).toBeGreaterThan(10);

    const before = e.playlist.items[3].trackId;
    const r = svc.replaceTrack(USER, id, 3, "dislike");
    expect(r.playlist.items[3].trackId).not.toBe(before);
    expect(r.playlist.brief.exclude.trackIds).toContain(before);

    const u = svc.undo(USER, id);
    expect(u.items[3].trackId).toBe(before);
  });

  it("asks a question only when needed and can skip", async () => {
    const q = await svc.createPlaylist(USER, { prompt: "2 saatlik Türkçe nostaljik playlist" });
    expect(q.status).toBe("needs_input");
    const c = await svc.createPlaylist(USER, { prompt: "2 saatlik Türkçe nostaljik playlist", skipQuestions: true });
    expect(c.status).toBe("created");
  });

  it("learns from feedback, respects pause and reset", async () => {
    const out = await svc.createPlaylist(USER, { prompt: "1 saat türkçe parti", skipQuestions: true });
    if (out.status !== "created") throw new Error();
    svc.giveFeedback(USER, out.playlist.id, 0, "love");
    expect(repo.getTaste(USER).events).toBeGreaterThan(0);
    repo.setLearningPaused(USER, true);
    const ev = repo.getTaste(USER).events;
    svc.giveFeedback(USER, out.playlist.id, 1, "like");
    expect(repo.getTaste(USER).events).toBe(ev);
    repo.resetTaste(USER);
    expect(repo.getTaste(USER).events).toBe(0);
  });

  it("never-play excludes a track from future playlists", async () => {
    const out = await svc.createPlaylist(USER, { prompt: "2 saat türkçe parti", skipQuestions: true });
    if (out.status !== "created") throw new Error();
    const banned = out.playlist.items[5].trackId;
    svc.giveFeedback(USER, out.playlist.id, 5, "never");
    const again = await svc.createPlaylist(USER, { prompt: "2 saat türkçe parti", skipQuestions: true });
    if (again.status !== "created") throw new Error();
    expect(again.playlist.items.map((i) => i.trackId)).not.toContain(banned);
  });

  it("imports a text list and builds DNA; reference playlists steer creation", async () => {
    const imp = await svc.importTracks(USER, "Mine", parseTextList("Tarkan - Şımarık\nMustafa Sandal - Araba\nKenan Doğulu - Çakkıdı\nUnknown Band - Some Song"));
    expect(imp.items.length).toBe(4);
    expect(imp.dna.turkish).toBeGreaterThanOrEqual(75);
    const out = await svc.createPlaylist(USER, { prompt: "bunun gibi ama daha hareketli", referencePlaylistIds: [imp.id], skipQuestions: true });
    expect(out.status).toBe("created");
  });

  it("delete all data removes everything", async () => {
    await svc.createPlaylist(USER, { prompt: "1 saat pop", skipQuestions: true });
    repo.deleteUserData(USER);
    expect(repo.listPlaylists(USER)).toHaveLength(0);
  });
});

describe("security helpers", () => {
  it("encrypts tokens and signs cookies", () => {
    const enc = encrypt("secret-token");
    expect(enc).not.toContain("secret-token");
    expect(decrypt(enc)).toBe("secret-token");
    expect(unsign(sign("u_1"))).toBe("u_1");
    expect(unsign(sign("u_1") + "x")).toBeNull();
    expect(unsign("u_2.forged")).toBeNull();
  });
});

describe("platform matcher scoring", () => {
  const t = allSeedTracks().find((x) => x.title === "Şımarık")!;
  it("exact match is available", () => {
    expect(scoreCandidate(t, { provider: "spotify", id: "1", url: "", title: "Şımarık", artist: "Tarkan", durationSec: 235 }).score).toBeGreaterThanOrEqual(0.82);
  });
  it("live version is flagged as alternative", () => {
    const s = scoreCandidate(t, { provider: "spotify", id: "2", url: "", title: "Şımarık (Live)", artist: "Tarkan", durationSec: 280 });
    expect(s.score).toBeLessThan(0.82);
    expect(s.note).toBe("live");
  });
  it("different song is unavailable", () => {
    expect(scoreCandidate(t, { provider: "spotify", id: "3", url: "", title: "Kuzu Kuzu", artist: "Tarkan", durationSec: 230 }).score).toBeLessThan(0.6);
  });
});
