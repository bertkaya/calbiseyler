/**
 * YouTube Music. There is no official YouTube Music API; unofficial clients
 * (ytmusicapi) carry ToS risk and are intentionally NOT used.
 * MVP: deep links. PLACEHOLDER (Phase 2): YouTube Data API v3 playlist
 * creation via Google OAuth — note the 10k units/day quota (search = 100 units).
 */
import type { MusicProvider, TrackQuery } from "./types";
import { ProviderError } from "./types";

export const youtubeProvider: MusicProvider = {
  id: "youtube",
  name: "YouTube Music",
  capabilities: { search: false, createPlaylist: false, readPlaylist: false, preview: false, requiresUserAuthForSearch: true },
  isConfigured: () => false,
  async search() {
    throw new ProviderError("youtube", "search not available in MVP (no official API)");
  },
  searchUrl: (q: TrackQuery) => `https://music.youtube.com/search?q=${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};
