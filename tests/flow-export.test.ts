import { describe, expect, it } from "vitest";
import { allSeedTracks } from "@/lib/catalog";
import { defaultBrief } from "@/lib/engine/brief";
import { arcTargetAt, resequenceTracks, summarizeFlowPhases } from "@/lib/engine/sequence";
import {
  buildYouTubeMusicSearchUrl,
  buildYouTubeQueueUrl,
  extractYouTubeVideoId,
  formatCSV,
  formatM3U8,
  formatShareText,
  type ExportTrackItem,
} from "@/lib/export";
import { createPlaylist, resequencePlaylist } from "@/lib/server/playlists";

describe("catalog release year verification", () => {
  it("keeps canonical release years for audited Turkish and international classics", () => {
    const tracks = allSeedTracks();
    const findYear = (artistSub: string, titleSub: string) =>
      tracks.find(
        (t) =>
          t.artist.toLowerCase().includes(artistSub.toLowerCase()) &&
          t.title.toLowerCase().includes(titleSub.toLowerCase()),
      )?.year;

    expect(findYear("Duman", "Senden Daha Güzel")).toBe(2009);
    expect(findYear("maNga", "Bir Kadın Çizeceksin")).toBe(2004);
    expect(findYear("Mor ve Ötesi", "Cambaz")).toBe(2004);
    expect(findYear("Tarkan", "Kuzu Kuzu")).toBe(2001);
    expect(findYear("Tarkan", "Kış Güneşi")).toBe(1994);
    expect(findYear("Tarkan", "Öp")).toBe(2010);
    expect(findYear("Ceza", "Suspus")).toBe(2015);
    expect(findYear("Ezhel", "Geceler")).toBe(2017);
    expect(findYear("Queen", "Bohemian Rhapsody")).toBe(1975);
    expect(findYear("Queen", "Don't Stop Me Now")).toBe(1978);
    expect(findYear("ABBA", "Dancing Queen")).toBe(1976);
  });
});

describe("smart flow sequencing (Isınma → Zirve → Kapanış)", () => {
  const sampleTracks = allSeedTracks().slice(0, 16);

  it("arcTargetAt rises during warm-up, crests in peak, and cools down at the end", () => {
    const start = arcTargetAt(0.05);
    const warmEnd = arcTargetAt(0.28);
    const peakMid = arcTargetAt(0.58);
    const finale = arcTargetAt(0.95);

    expect(warmEnd).toBeGreaterThan(start);
    expect(peakMid).toBeGreaterThan(warmEnd);
    expect(peakMid).toBeGreaterThan(finale);
  });

  it("resequenceTracks('arc') preserves all tracks and creates a Peak phase with higher energy than Warm-up and Cooldown", () => {
    const brief = defaultBrief();
    const { ordered, flow, peakPosition } = resequenceTracks(sampleTracks, brief, "arc");

    expect(ordered).toHaveLength(sampleTracks.length);
    expect(new Set(ordered.map((t) => t.id)).size).toBe(sampleTracks.length);
    expect(flow).toBe("party_curve");
    expect(peakPosition).toBeCloseTo(0.65, 2);

    const phases = summarizeFlowPhases(ordered);
    expect(phases).toHaveLength(3);
    const [warmup, peak, cooldown] = phases;
    expect(warmup.phase).toBe("warmup");
    expect(peak.phase).toBe("peak");
    expect(cooldown.phase).toBe("cooldown");
    expect(warmup.trackCount + peak.trackCount + cooldown.trackCount).toBe(sampleTracks.length);
    expect(peak.avgEnergy).toBeGreaterThan(warmup.avgEnergy);
    expect(peak.avgEnergy).toBeGreaterThan(cooldown.avgEnergy);
  });

  it("resequenceTracks('bpm_smooth') minimizes abrupt tempo jumps while keeping all tracks", () => {
    const brief = defaultBrief();
    const { ordered } = resequenceTracks(sampleTracks, brief, "bpm_smooth");

    expect(ordered).toHaveLength(sampleTracks.length);
    expect(new Set(ordered.map((t) => t.id)).size).toBe(sampleTracks.length);

    const avgBpmDelta = (list: typeof sampleTracks) => {
      let sum = 0;
      for (let i = 1; i < list.length; i++) {
        sum += Math.abs((list[i].features.bpm ?? 115) - (list[i - 1].features.bpm ?? 115));
      }
      return sum / (list.length - 1);
    };

    // Alternating high/low BPM scramble vs smoothed order
    const byBpm = sampleTracks.slice().sort((a, b) => (a.features.bpm ?? 115) - (b.features.bpm ?? 115));
    const scrambled = byBpm.map((_, i) => (i % 2 === 0 ? byBpm[i / 2] : byBpm[byBpm.length - 1 - Math.floor(i / 2)]));
    expect(avgBpmDelta(ordered)).toBeLessThan(avgBpmDelta(scrambled));
  });

  it("resequencePlaylist updates stored playlist ordering and returns a localized sommelier summary", async () => {
    const { resetDbForTests } = await import("@/lib/db");
    const repo = await import("@/lib/server/repo");
    resetDbForTests();
    const uid = "u_flow_test";
    await repo.ensureUser(uid);
    const created = await createPlaylist(uid, {
      prompt: "45 dakikalık Türkçe pop ve alternatif parti listesi",
      skipQuestions: true,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const beforeIds = created.playlist.items.map((i) => i.trackId);
    const res = await resequencePlaylist(uid, created.playlist.id, "arc");

    expect(res.playlist.items).toHaveLength(beforeIds.length);
    expect(new Set(res.playlist.items.map((i) => i.trackId))).toEqual(new Set(beforeIds));
    expect(res.playlist.brief.flow).toBe("party_curve");
    expect(res.message).toContain("Isınma → Zirve → Kapanış");
  });
});

describe("instant OAuth-free export (.m3u8, .csv, YouTube Queue, Share Text)", () => {
  const tracks = allSeedTracks().slice(0, 3);
  const items: ExportTrackItem[] = [
    { position: 0, role: "opener", track: tracks[0], url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" },
    { position: 1, role: "peak", track: tracks[1] },
    { position: 2, role: "finale", track: tracks[2], url: "https://youtu.be/9bZkp7q19f0" },
  ];

  it("formatM3U8 produces UTF-8 extended M3U8 with metadata and fallback search URLs", () => {
    const m3u8 = formatM3U8("Gece Sürüşü", items);
    expect(m3u8).toContain("#EXTM3U");
    expect(m3u8).toContain("#EXTENC:UTF-8");
    expect(m3u8).toContain("#PLAYLIST:Gece Sürüşü");
    expect(m3u8).toContain(`#EXTINF:${tracks[0].durationSec},${tracks[0].artist} - ${tracks[0].title}`);
    expect(m3u8).toContain("#EXTREM:role=opener;");
    expect(m3u8).toContain("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(m3u8).toContain(buildYouTubeMusicSearchUrl(tracks[1].artist, tracks[1].title));
  });

  it("formatCSV includes BPM, Energy, Role, and SearchURL columns", () => {
    const csv = formatCSV(items);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Position,Title,Artist,Year,Duration,BPM,Energy,Role,ISRC,URL,SearchURL");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(`"${tracks[0].title.replace(/"/g, '""')}"`);
    expect(lines[1]).toContain('"opener"');
    expect(lines[2]).toContain("https://music.youtube.com/search?q=");
  });

  it("formatShareText formats human-friendly clipboard text in Turkish and English", () => {
    const trText = formatShareText("Gece Sürüşü", items, "tr");
    expect(trText).toContain("Gece Sürüşü (3 şarkı");
    expect(trText).toContain("01. ");
    expect(trText).toContain("[Açılış · ");

    const enText = formatShareText("Night Drive", items, "en");
    expect(enText).toContain("Night Drive (3 tracks");
    expect(enText).toContain("[Opener · ");
  });

  it("extractYouTubeVideoId and buildYouTubeQueueUrl create an anonymous OAuth-free YouTube queue link", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/9bZkp7q19f0")).toBe("9bZkp7q19f0");
    expect(extractYouTubeVideoId("https://open.spotify.com/track/123")).toBeNull();

    const queueUrl = buildYouTubeQueueUrl([
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      undefined,
      "https://youtu.be/9bZkp7q19f0",
      "dQw4w9WgXcQ", // duplicate should be ignored
    ]);
    expect(queueUrl).toBe("https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ,9bZkp7q19f0");
    expect(buildYouTubeQueueUrl([null, undefined, "https://open.spotify.com/track/123"])).toBeNull();
  });
});
