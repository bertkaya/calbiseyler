/**
 * Keyless YouTube search through public Piped instances. Best-effort fallback so a playlist can be turned
 * into real video links without any API key or account. Instances come and go: set PIPED_API_URLS
 * (comma separated) to override, and we try them in order.
 */
import { fetchJson, type MusicProvider, type ProviderTrackRef, type TrackQuery } from "./types";

const DEFAULT_INSTANCES = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks"];

interface PipedItem { url?: string; title?: string; uploaderName?: string; duration?: number; type?: string }

function instances(): string[] {
  const env = process.env.PIPED_API_URLS?.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return env?.length ? env : DEFAULT_INSTANCES;
}

export function parsePipedItems(items: PipedItem[]): ProviderTrackRef[] {
  const out: ProviderTrackRef[] = [];
  for (const i of items) {
    const id = /[?&]v=([\w-]{11})/.exec(i.url ?? "")?.[1];
    if (!id || !i.title || (i.type && i.type !== "stream")) continue;
    out.push({
      provider: "youtube",
      id,
      url: `https://music.youtube.com/watch?v=${id}`,
      title: i.title,
      artist: (i.uploaderName ?? "").replace(/ - Topic$/i, "").replace(/VEVO$/i, "").trim(),
      durationSec: i.duration && i.duration > 0 ? i.duration : undefined,
    });
  }
  return out;
}

export const pipedProvider: MusicProvider = {
  id: "youtube",
  name: "YouTube",
  capabilities: { search: true, createPlaylist: false, readPlaylist: false, preview: false, requiresUserAuthForSearch: false },
  isConfigured: () => true,
  async search(q: TrackQuery): Promise<ProviderTrackRef[]> {
    const query = `${q.artist.split(/\s*&\s*/)[0]} ${q.title}`.replace(/["()]/g, "");
    let lastErr: unknown;
    for (const base of instances()) {
      try {
        const r = await fetchJson<{ items?: PipedItem[] }>(`${base}/search?${new URLSearchParams({ q: query, filter: "music_songs" })}`, { timeoutMs: 5000 }, "youtube");
        const refs = parsePipedItems(r.items ?? []);
        if (refs.length) return refs.slice(0, 5);
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
    return [];
  },
  searchUrl: (q: TrackQuery) => `https://music.youtube.com/search?q=${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};
