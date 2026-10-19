/**
 * Instant Playlist Export & OAuth-free Playback Utilities (.m3u8, .csv, YouTube Queue, Share Text)
 */
import type { MusicTrack, TrackRole } from "./types";
import { ROLE_LABEL } from "./engine/roles";
import { bpmOf, energyOf } from "./engine/features";
import { formatDuration, formatTrackTime } from "./engine/util";

export interface ExportTrackItem {
  position: number;
  role: TrackRole;
  track: MusicTrack;
  url?: string;
}

const csvCell = (s: string | number | undefined | null) =>
  `"${String(s ?? "").replace(/"/g, '""')}"`;

/** Builds an OAuth-free YouTube Music search URL for any track. */
export function buildYouTubeMusicSearchUrl(artist: string, title: string): string {
  return `https://music.youtube.com/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`;
}

/** Extracts an 11-char YouTube video ID from a watch URL, youtu.be URL, or raw ID. */
export function extractYouTubeVideoId(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    if (u.hostname === "youtu.be") {
      const seg = u.pathname.replace(/^\//, "").split("/")[0];
      if (seg && /^[A-Za-z0-9_-]{11}$/.test(seg)) return seg;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/**
 * Builds an instant OAuth-free YouTube anonymous queue link (`watch_videos?video_ids=...`)
 * from matched YouTube URLs or video IDs (up to 50 tracks).
 */
export function buildYouTubeQueueUrl(urlsOrIds: (string | undefined | null)[]): string | null {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of urlsOrIds) {
    const id = extractYouTubeVideoId(item);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= 50) break;
    }
  }
  if (ids.length === 0) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`;
}

/**
 * Formats an extended UTF-8 M3U8 playlist (`.m3u8` / `.m3u`).
 * Includes #EXTM3U, #EXTENC:UTF-8, #PLAYLIST, #EXTINF, and falls back to an
 * instant YouTube Music search URL when a direct stream/watch URL is not cached.
 */
export function formatM3U8(title: string, items: ExportTrackItem[]): string {
  const lines: string[] = [
    "#EXTM3U",
    "#EXTENC:UTF-8",
    `#PLAYLIST:${title}`,
  ];
  for (const it of items) {
    const dur = Math.max(1, Math.round(it.track.durationSec || 0));
    const bpm = Math.round(bpmOf(it.track));
    const energy = (energyOf(it.track) * 10).toFixed(1);
    const targetUrl = it.url || buildYouTubeMusicSearchUrl(it.track.artist, it.track.title);
    lines.push(`#EXTINF:${dur},${it.track.artist} - ${it.track.title}`);
    lines.push(`#EXTREM:role=${it.role};bpm=${bpm};energy=${energy};year=${it.track.year ?? ""}`);
    lines.push(targetUrl);
  }
  return lines.join("\n");
}

/**
 * Formats a Soundiiz / TuneMyMusic / spreadsheet-ready CSV export.
 */
export function formatCSV(items: ExportTrackItem[]): string {
  const header = "Position,Title,Artist,Year,Duration,BPM,Energy,Role,ISRC,URL,SearchURL";
  const rows = items.map((it, i) => {
    const bpm = Math.round(bpmOf(it.track));
    const energy = (energyOf(it.track) * 10).toFixed(1);
    const searchUrl = buildYouTubeMusicSearchUrl(it.track.artist, it.track.title);
    return [
      i + 1,
      it.track.title,
      it.track.artist,
      it.track.year ?? "",
      it.track.durationSec,
      bpm,
      energy,
      it.role,
      it.track.isrc ?? "",
      it.url || "",
      searchUrl,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header, ...rows].join("\n");
}

/**
 * Formats a human-readable shareable playlist text (for one-click clipboard copy or .txt export).
 */
export function formatShareText(
  title: string,
  items: ExportTrackItem[],
  lang: "tr" | "en" = "tr",
): string {
  const totalSec = items.reduce((acc, it) => acc + (it.track.durationSec || 0), 0);
  const header = `${title} (${items.length} ${lang === "en" ? "tracks" : "şarkı"} · ${formatDuration(totalSec)})`;
  const rows = items.map((it, i) => {
    const num = String(i + 1).padStart(2, "0");
    const role = ROLE_LABEL[it.role]?.[lang] ?? it.role;
    const bpm = Math.round(bpmOf(it.track));
    const year = it.track.year ? ` (${it.track.year})` : "";
    return `${num}. ${it.track.artist} - ${it.track.title}${year} [${role} · ${bpm} BPM · ${formatTrackTime(it.track.durationSec)}]`;
  });
  return [header, "", ...rows].join("\n");
}
