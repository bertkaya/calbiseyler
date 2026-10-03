/**
 * Apple Music adapter.
 *  - Catalog search works with a developer token (ES256 JWT signed with the
 *    MusicKit .p8 key) → public-mode availability checks.
 *  - Creating a library playlist needs a Music User Token obtained in the
 *    browser via MusicKit JS. PLACEHOLDER: the MusicKit JS connect UI is
 *    Phase 2; the server method below is ready for it.
 * Env: APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY (PEM, \n escaped), APPLE_MUSIC_STOREFRONT (default "tr")
 */
import crypto from "node:crypto";
import type { MusicProvider, ProviderAuth, ProviderTrackRef, TrackQuery } from "./types";
import { ProviderError, fetchJson } from "./types";

const API = "https://api.music.apple.com/v1";
let cached: { token: string; exp: number } | null = null;

export function appleDeveloperToken(): string | null {
  const team = process.env.APPLE_MUSIC_TEAM_ID, kid = process.env.APPLE_MUSIC_KEY_ID, pem = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!team || !kid || !pem) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 3600) return cached.token;
  const exp = now + 60 * 60 * 24 * 30; // Apple allows up to 6 months
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "ES256", kid })}.${b64({ iss: team, iat: now, exp })}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: pem.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { token: `${unsigned}.${sig}`, exp };
  return cached.token;
}

interface AmSong {
  id: string;
  attributes: { name: string; artistName: string; albumName?: string; durationInMillis?: number; url: string; isrc?: string; previews?: { url: string }[]; contentRating?: string };
}

export const appleProvider: MusicProvider = {
  id: "apple",
  name: "Apple Music",
  capabilities: { search: true, createPlaylist: true, readPlaylist: false, preview: true, requiresUserAuthForSearch: false },
  isConfigured: () => !!appleDeveloperToken(),
  async search(q: TrackQuery): Promise<ProviderTrackRef[]> {
    const token = appleDeveloperToken();
    if (!token) throw new ProviderError("apple", "not configured");
    const sf = process.env.APPLE_MUSIC_STOREFRONT || "tr";
    const url = q.isrc
      ? `${API}/catalog/${sf}/songs?filter[isrc]=${encodeURIComponent(q.isrc)}`
      : `${API}/catalog/${sf}/search?${new URLSearchParams({ term: `${q.title} ${q.artist}`, types: "songs", limit: "6" })}`;
    const res = await fetchJson<{ data?: AmSong[]; results?: { songs?: { data: AmSong[] } } }>(url, { headers: { Authorization: `Bearer ${token}` } }, "apple");
    const songs = res.data ?? res.results?.songs?.data ?? [];
    return songs.map((s) => ({
      provider: "apple" as const,
      id: s.id,
      url: s.attributes.url,
      title: s.attributes.name,
      artist: s.attributes.artistName,
      album: s.attributes.albumName,
      durationSec: s.attributes.durationInMillis ? Math.round(s.attributes.durationInMillis / 1000) : undefined,
      isrc: s.attributes.isrc,
      previewUrl: s.attributes.previews?.[0]?.url ?? null,
      explicit: s.attributes.contentRating === "explicit",
    }));
  },
  async createPlaylist(auth: ProviderAuth, name, description, refs) {
    const token = appleDeveloperToken();
    if (!token) throw new ProviderError("apple", "not configured");
    const res = await fetchJson<{ data: { id: string }[] }>(
      `${API}/me/library/playlists`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Music-User-Token": auth.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: { name, description }, relationships: { tracks: { data: refs.map((r) => ({ id: r.id, type: "songs" })) } } }),
      },
      "apple",
    );
    const id = res.data[0]?.id ?? "";
    return { id, url: "https://music.apple.com/library/playlists" };
  },
  searchUrl: (q) => `https://music.apple.com/search?term=${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};
