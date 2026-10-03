import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeEntities, isoDuration, parseVideoTitle, youtubeProvider, youtubeQuotaEstimate, googleAuthorizeUrl } from "../src/lib/providers/youtube";
import { scoreCandidate } from "../src/lib/providers/matcher";
import { allSeedTracks } from "../src/lib/catalog";

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });

describe("YouTube parsing", () => {
  it("parses Topic channels, 'Artist - Title (Official Video)' and entities", () => {
    expect(parseVideoTitle("Şımarık", "Tarkan - Topic")).toEqual({ artist: "Tarkan", title: "Şımarık", official: true });
    expect(parseVideoTitle("Tarkan - Şımarık (Official Video)", "TarkanVEVO")).toMatchObject({ artist: "Tarkan", title: "Şımarık" });
    expect(parseVideoTitle("Sezen Aksu - Hadi Bakalım [Resmi Video]", "Sezen Aksu")).toMatchObject({ title: "Hadi Bakalım" });
    expect(decodeEntities("Don&#39;t Stop Me Now")).toBe("Don't Stop Me Now");
  });
  it("parses ISO-8601 durations", () => {
    expect(isoDuration("PT3M56S")).toBe(236);
    expect(isoDuration("PT1H2M3S")).toBe(3723);
    expect(isoDuration("bad")).toBeUndefined();
  });
  it("a parsed official video matches the catalog track", () => {
    const t = allSeedTracks().find((x) => x.title === "Şımarık")!;
    const p = parseVideoTitle("Tarkan - Şımarık (Official Video)", "TarkanVEVO");
    expect(scoreCandidate(t, { provider: "youtube", id: "v", url: "", title: p.title, artist: p.artist, durationSec: 240 }).score).toBeGreaterThanOrEqual(0.82);
  });
  it("estimates quota", () => {
    expect(youtubeQuotaEstimate(40, 0)).toBe(40 * 101 + 50 + 40 * 50);
  });
});

describe("YouTube API calls (mocked)", () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec"; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it("authorize URL requests offline access with PKCE", () => {
    const u = new URL(googleAuthorizeUrl("st", "ch"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("auth/youtube");
  });

  it("search prefers official audio and attaches durations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/search?")) return ok({ items: [
        { id: { videoId: "fan" }, snippet: { title: "Tarkan Şımarık cover", channelTitle: "Fan" } },
        { id: { videoId: "topic" }, snippet: { title: "Şımarık", channelTitle: "Tarkan - Topic" } },
      ] });
      if (url.includes("/videos?")) return ok({ items: [{ id: "topic", contentDetails: { duration: "PT3M56S" } }, { id: "fan", contentDetails: { duration: "PT2M10S" } }] });
      return new Response("", { status: 404 });
    }));
    const refs = await youtubeProvider.search({ title: "Şımarık", artist: "Tarkan" }, { accessToken: "t" });
    expect(refs[0]).toMatchObject({ id: "topic", artist: "Tarkan", durationSec: 236, url: "https://music.youtube.com/watch?v=topic" });
  });

  it("creates a private playlist and inserts items in order", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/playlists?")) { expect(JSON.parse(String(init?.body)).status.privacyStatus).toBe("private"); return ok({ id: "PL1" }); }
      if (url.includes("/playlistItems?")) { calls.push(JSON.parse(String(init?.body)).snippet.resourceId.videoId); return ok({}); }
      return new Response("", { status: 404 });
    }));
    const r = await youtubeProvider.createPlaylist!({ accessToken: "t" }, "Test", "d", [
      { provider: "youtube", id: "a", url: "", title: "", artist: "" },
      { provider: "youtube", id: "b", url: "", title: "", artist: "" },
    ]);
    expect(r.url).toBe("https://music.youtube.com/playlist?list=PL1");
    expect(calls).toEqual(["a", "b"]);
  });
});

describe("piped fallback", () => {
  it("parses video ids and drops non-videos", async () => {
    const { parsePipedItems } = await import("../src/lib/providers/piped");
    const refs = parsePipedItems([
      { url: "/watch?v=JJPlzNajdUs", type: "stream", title: "Sımarık", uploaderName: "Tarkan - Topic", duration: 245 },
      { url: "/channel/UCxyz", type: "channel", title: "Tarkan" },
      { url: "/playlist?list=PL1", type: "playlist", title: "x" },
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ id: "JJPlzNajdUs", artist: "Tarkan", durationSec: 245 });
  });
});
