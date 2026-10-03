/**
 * Spotify Web API adapter — written against the February 2026 Dev Mode API:
 *  - POST /me/playlists               (POST /users/{id}/playlists was removed)
 *  - POST|GET /playlists/{id}/items   (/tracks was renamed)
 *  - GET /search limit ≤ 10
 *  - no audio-features / popularity (engine uses its own metadata)
 * Docs: https://developer.spotify.com/documentation/web-api
 */
import type { ImportedPlaylist, MusicProvider, ProviderAuth, ProviderTrackRef, TrackQuery } from "./types";
import { ProviderError, fetchJson } from "./types";

const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_SCOPES = ["playlist-modify-private", "playlist-modify-public", "playlist-read-private", "playlist-read-collaborative"];

const env = () => ({
  clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? `${process.env.APP_URL ?? "http://127.0.0.1:3000"}/api/auth/spotify/callback`,
});

interface SpTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify: string };
  external_ids?: { isrc?: string };
  artists: { name: string }[];
  album?: { name: string };
  preview_url?: string | null;
}

function toRef(t: SpTrack): ProviderTrackRef {
  return {
    provider: "spotify",
    id: t.id,
    uri: t.uri,
    url: t.external_urls.spotify,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album?.name,
    durationSec: Math.round(t.duration_ms / 1000),
    isrc: t.external_ids?.isrc,
    previewUrl: t.preview_url ?? null,
    explicit: t.explicit,
  };
}

// ── OAuth (Authorization Code + PKCE) ─────────────────────────
export function authorizeUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = env();
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });
  return `${ACCOUNTS}/authorize?${p}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret } = env();
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  else body.set("client_id", clientId);
  return fetchJson<TokenResponse>(`${ACCOUNTS}/api/token`, { method: "POST", headers, body }, "spotify");
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env().redirectUri, code_verifier: verifier }));
}

export function refreshToken(refresh: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }));
}

export async function me(auth: ProviderAuth): Promise<{ id: string; display_name: string | null }> {
  return fetchJson(`${API}/me`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }, "spotify");
}

/** App-level token for public-mode catalog search (needs client secret). */
let appToken: { token: string; exp: number } | null = null;
async function clientCredentials(): Promise<string | null> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) return null;
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.token;
  const t = await tokenRequest(new URLSearchParams({ grant_type: "client_credentials" }));
  appToken = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

function cleanForSearch(s: string): string {
  return s.replace(/\(.*?\)|\[.*?\]/g, "").replace(/["]/g, "").replace(/\s+/g, " ").trim();
}

export function parsePlaylistId(idOrUrl: string): string | null {
  const m = /playlist[/:]([A-Za-z0-9]{10,})/.exec(idOrUrl);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,}$/.test(idOrUrl.trim()) ? idOrUrl.trim() : null;
}

export const spotifyProvider: MusicProvider = {
  id: "spotify",
  name: "Spotify",
  capabilities: { search: true, createPlaylist: true, readPlaylist: true, preview: false, requiresUserAuthForSearch: false },
  isConfigured: () => !!env().clientId,

  async search(q: TrackQuery, auth?: ProviderAuth): Promise<ProviderTrackRef[]> {
    const token = auth?.accessToken ?? (await clientCredentials());
    if (!token) throw new ProviderError("spotify", "not configured");
    const query = q.isrc ? `isrc:${q.isrc}` : `track:${cleanForSearch(q.title)} artist:${cleanForSearch(q.artist.split(/\s*&\s*/)[0])}`;
    const url = `${API}/search?${new URLSearchParams({ q: query, type: "track", limit: "8" })}`;
    const res = await fetchJson<{ tracks: { items: SpTrack[] } }>(url, { headers: { Authorization: `Bearer ${token}` } }, "spotify");
    let items = res.tracks?.items ?? [];
    if (!items.length && !q.isrc) {
      const loose = await fetchJson<{ tracks: { items: SpTrack[] } }>(
        `${API}/search?${new URLSearchParams({ q: `${cleanForSearch(q.title)} ${cleanForSearch(q.artist)}`, type: "track", limit: "8" })}`,
        { headers: { Authorization: `Bearer ${token}` } },
        "spotify",
      );
      items = loose.tracks?.items ?? [];
    }
    return items.map(toRef);
  },

  async createPlaylist(auth, name, description, refs) {
    const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
    const pl = await fetchJson<{ id: string; external_urls: { spotify: string } }>(
      `${API}/me/playlists`,
      { method: "POST", headers, body: JSON.stringify({ name: name.slice(0, 100), description: description.slice(0, 300), public: false }) },
      "spotify",
    );
    const uris = refs.map((r) => r.uri).filter((u): u is string => !!u);
    for (let i = 0; i < uris.length; i += 100) {
      await fetchJson(`${API}/playlists/${pl.id}/items`, { method: "POST", headers, body: JSON.stringify({ uris: uris.slice(i, i + 100) }) }, "spotify");
    }
    return { id: pl.id, url: pl.external_urls.spotify };
  },

  async readPlaylist(auth, idOrUrl): Promise<ImportedPlaylist> {
    const id = parsePlaylistId(idOrUrl);
    if (!id) throw new ProviderError("spotify", "invalid playlist link");
    const token = auth?.accessToken ?? (await clientCredentials());
    if (!token) throw new ProviderError("spotify", "connect Spotify to import playlists");
    const headers = { Authorization: `Bearer ${token}` };
    const meta = await fetchJson<{ name: string }>(`${API}/playlists/${id}?fields=name`, { headers }, "spotify");
    const tracks: TrackQuery[] = [];
    let next: string | null = `${API}/playlists/${id}/items?limit=50`;
    while (next && tracks.length < 500) {
      type Item = { item?: SpTrack | null; track?: SpTrack | null };
      const page: { items: Item[]; next: string | null } = await fetchJson(next, { headers }, "spotify");
      for (const it of page.items) {
        const t = it.item ?? it.track; // Feb 2026 renamed `track` → `item`; accept both
        if (t?.name) tracks.push({ title: t.name, artist: t.artists.map((a) => a.name).join(" & "), durationSec: Math.round(t.duration_ms / 1000), isrc: t.external_ids?.isrc });
      }
      next = page.next;
    }
    return { name: meta.name, tracks };
  },

  searchUrl: (q) => `https://open.spotify.com/search/${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};
