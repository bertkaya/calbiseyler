import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { camelotFromName, camelotFromOpenKey, camelotFromPitch } from "../src/lib/enrich/keys";
import { toFeatures, reccoFeatures } from "../src/lib/enrich/reccobeats";
import { getSongBpm } from "../src/lib/enrich/getsongbpm";
import { enrichTracks, mergeFeatures } from "../src/lib/enrich/enrich";
import { resetDbForTests } from "../src/lib/db";
import { translate, pickLang } from "../src/lib/ui-i18n";
import type { MusicTrack } from "../src/lib/types";

describe("Camelot keys", () => {
  it("maps pitch class + mode", () => {
    expect(camelotFromPitch(0, 1)).toBe("8B"); // C major
    expect(camelotFromPitch(9, 0)).toBe("8A"); // A minor
    expect(camelotFromPitch(7, 1)).toBe("9B"); // G major
    expect(camelotFromPitch(4, 0)).toBe("9A"); // E minor
    expect(camelotFromPitch(-1, 1)).toBeUndefined();
  });
  it("parses names and Open Key", () => {
    expect(camelotFromName("Am")).toBe("8A");
    expect(camelotFromName("F#m")).toBe("11A");
    expect(camelotFromName("D♭")).toBe("3B");
    expect(camelotFromOpenKey("1d")).toBe("8B");
    expect(camelotFromOpenKey("1m")).toBe("8A");
  });
});

describe("ReccoBeats parsing", () => {
  it("normalises features", () => {
    const f = toFeatures({ energy: 0.81, danceability: 0.7, valence: 0.9, tempo: 127.6, key: 9, mode: 0, loudness: -6 }, 74);
    expect(f).toMatchObject({ energy: 0.81, bpm: 128, key: "8A", popularity: 0.74 });
    expect(f.loudness).toBeCloseTo(0.9, 2);
  });
});

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });

describe("enrichment pipeline (mocked network)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    resetDbForTests();
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";
    delete process.env.RECCOBEATS_DISABLED;
    process.env.DEEZER_DISABLED = "1";
  });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it("Spotify ID → ReccoBeats features replace estimates", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("accounts.spotify.com")) return ok({ access_token: "tok", expires_in: 3600 });
      if (url.includes("api.spotify.com/v1/search")) {
        return ok({ tracks: { items: [{ id: "sp1", uri: "spotify:track:sp1", name: "Yeni Şarkı", duration_ms: 200000, explicit: false, external_urls: { spotify: "https://open.spotify.com/track/sp1" }, external_ids: { isrc: "TR123" }, artists: [{ name: "Test Sanatçı" }], album: { name: "A", release_date: "2021-05-01" } }] } });
      }
      if (url.includes("/audio-features")) return ok({ content: [{ href: "https://open.spotify.com/track/sp1", energy: 0.66, danceability: 0.71, valence: 0.5, tempo: 101, key: 0, mode: 1 }] });
      if (url.includes("/track?ids=")) return ok({ content: [{ href: "https://open.spotify.com/track/sp1", popularity: 55 }] });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t: MusicTrack = { id: "ai:test", title: "Yeni Şarkı", artist: "Test Sanatçı", durationSec: 200, language: "tr", genres: ["tr-pop"], tags: [], explicit: false, source: "ai", estimated: true, features: { energy: 0.2 } };
    const { tracks, report } = await enrichTracks([t]);
    expect(report.measured).toBe(1);
    expect(tracks[0]).toMatchObject({ spotifyId: "sp1", isrc: "TR123", estimated: false, featureSource: "reccobeats" });
    expect(tracks[0].features).toMatchObject({ energy: 0.66, bpm: 101, key: "8B", popularity: 0.55 });
  });

  it("is fail-safe when every source is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const t: MusicTrack = { id: "ai:x", title: "X", artist: "Y", durationSec: 200, language: "en", genres: ["pop"], tags: [], explicit: false, source: "ai", estimated: true, features: { energy: 0.4 } };
    const { tracks } = await enrichTracks([t]);
    expect(tracks[0].features.energy).toBe(0.4);
    expect(tracks[0].estimated).toBe(true);
    expect(await reccoFeatures(["a"])).toBeInstanceOf(Map);
  });

  it("GetSongBPM fallback parses tempo and open key", async () => {
    process.env.GETSONGBPM_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => ok({ search: [{ title: "Şımarık", tempo: "128", open_key: "6m", artist: { name: "Tarkan" } }] })));
    expect(await getSongBpm("Şımarık", "Tarkan")).toMatchObject({ bpm: 128, key: "1A" });
  });

  it("measured values win field by field", () => {
    expect(mergeFeatures({ energy: 0.3, bpm: 90 }, { energy: 0.8, bpm: undefined })).toEqual({ energy: 0.8, bpm: 90 });
  });
});

describe("UI i18n", () => {
  it("TR and EN dictionaries are complete and interpolate", () => {
    expect(translate("tr", "home.title")).toBe("Ne dinliyoruz?");
    expect(translate("en", "home.title")).toBe("What are we listening to?");
    expect(translate("tr", "me.discovered", { n: 14 })).toContain("14");
  });
  it("picks language from cookie, then Accept-Language", () => {
    expect(pickLang("en", "tr-TR")).toBe("en");
    expect(pickLang(undefined, "tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(pickLang(undefined, "en-US,en;q=0.9")).toBe("en");
  });
});
