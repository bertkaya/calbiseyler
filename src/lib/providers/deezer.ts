/**
 * Deezer public API — no key needed for search. Gives 30s previews (public
 * mode listening), canonical links, and `bpm` on the track endpoint.
 */
import type { MusicProvider, ProviderTrackRef, TrackQuery } from "./types";
import { fetchJson } from "./types";

interface DzTrack {
  id: number;
  title: string;
  duration: number;
  link: string;
  preview: string;
  explicit_lyrics: boolean;
  artist: { name: string };
  album?: { title: string };
  isrc?: string;
  bpm?: number;
}

export const deezerProvider: MusicProvider = {
  id: "deezer",
  name: "Deezer",
  capabilities: { search: true, createPlaylist: false, readPlaylist: false, preview: true, requiresUserAuthForSearch: false },
  isConfigured: () => process.env.DEEZER_DISABLED !== "1",
  async search(q: TrackQuery): Promise<ProviderTrackRef[]> {
    const clean = (s: string) => s.replace(/\(.*?\)/g, "").replace(/"/g, "").trim();
    const url = `https://api.deezer.com/search?${new URLSearchParams({ q: `artist:"${clean(q.artist.split(/\s*&\s*/)[0])}" track:"${clean(q.title)}"`, limit: "6" })}`;
    const res = await fetchJson<{ data?: DzTrack[] }>(url, { timeoutMs: 6000 }, "deezer");
    return (res.data ?? []).map((t) => ({
      provider: "deezer" as const,
      id: String(t.id),
      url: t.link,
      title: t.title,
      artist: t.artist.name,
      album: t.album?.title,
      durationSec: t.duration,
      previewUrl: t.preview || null,
      explicit: t.explicit_lyrics,
    }));
  },
  searchUrl: (q) => `https://www.deezer.com/search/${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};

/** Track detail carries BPM (often 0 = unknown) and ISRC. */
export async function deezerTrackDetail(id: string): Promise<{ bpm?: number; isrc?: string } | null> {
  const t = await fetchJson<{ bpm?: number; isrc?: string; error?: unknown }>(`https://api.deezer.com/track/${encodeURIComponent(id)}`, { timeoutMs: 6000 }, "deezer").catch(() => null);
  if (!t || t.error) return null;
  return { bpm: t.bpm && t.bpm > 30 ? Math.round(t.bpm) : undefined, isrc: t.isrc };
}
