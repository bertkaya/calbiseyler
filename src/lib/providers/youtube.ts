/**
 * YouTube Music via the official YouTube Data API v3 (playlists created
 * there show up in YouTube Music). Unofficial clients (ytmusicapi) carry ToS
 * risk and are intentionally NOT used.
 *
 * QUOTA (default 10,000 units/day per Google project):
 *   search.list = 100 · videos.list = 1 · playlists.insert = 50 · playlistItems.insert = 50
 *   → a 40-track playlist ≈ 40×100 (search, cached 30 days) + 50 + 40×50 ≈ 6,050 units.
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (optional),
 *      YOUTUBE_API_KEY (optional — lets public mode search without a connected account)
 * Docs: https://developers.google.com/youtube/v3/docs
 */
import type { MusicProvider, ProviderAuth, ProviderTrackRef, TrackQuery } from "./types";
import { ProviderError, fetchJson } from "./types";
import { appUrl } from "../server/app-url";

const API = "https://www.googleapis.com/youtube/v3";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube"];

const env = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  apiKey: process.env.YOUTUBE_API_KEY ?? "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `${appUrl()}/api/auth/google/callback`,
});

export const youtubeOAuthConfigured = () => !!env().clientId && !!env().clientSecret;
export const youtubeApiKeyConfigured = () => !!env().apiKey;

// ── OAuth (Authorization Code + PKCE, offline access for refresh tokens) ──
export function googleAuthorizeUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = env();
  return `${AUTH}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  })}`;
}

interface GoogleToken { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

export function googleExchangeCode(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = env();
  return fetchJson<GoogleToken>(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  }, "youtube");
}

export function googleRefresh(refresh: string) {
  const { clientId, clientSecret } = env();
  return fetchJson<GoogleToken>(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  }, "youtube");
}

export async function youtubeChannel(auth: ProviderAuth): Promise<{ id: string; title: string } | null> {
  const r = await fetchJson<{ items?: { id: string; snippet: { title: string } }[] }>(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }, "youtube");
  const c = r.items?.[0];
  return c ? { id: c.id, title: c.snippet.title } : null;
}

// ── Parsing helpers (exported for tests) ──
const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
export const decodeEntities = (s: string) => s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] ?? m);

/** ISO-8601 duration "PT3M56S" → seconds. */
export function isoDuration(d?: string): number | undefined {
  const m = d ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d) : null;
  if (!m) return undefined;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

const NOISE = /\s*[([](official( music)?( video| audio| lyric video)?|lyrics?|lyric video|video ?clip|klip|audio|hd|hq|4k|resmi( video)?|şarkı sözleri|sarki sozleri)[)\]]/gi;

/** "Tarkan - Şımarık (Official Video)" / Topic channel → {artist, title}. */
export function parseVideoTitle(rawTitle: string, channelTitle: string): { artist: string; title: string; official: boolean } {
  const title = decodeEntities(rawTitle).replace(NOISE, "").trim();
  const channel = decodeEntities(channelTitle).trim();
  if (/ - Topic$/.test(channel)) return { artist: channel.replace(/ - Topic$/, ""), title, official: true };
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim(), official: /vevo$/i.test(channel) || /official/i.test(rawTitle) };
  return { artist: channel.replace(/VEVO$/i, "").trim(), title, official: /vevo$/i.test(channel) };
}

interface YtSearchItem { id: { videoId?: string }; snippet: { title: string; channelTitle: string } }
interface YtVideo { id: string; contentDetails?: { duration?: string } }

export const youtubeProvider: MusicProvider = {
  id: "youtube",
  name: "YouTube Music",
  capabilities: { search: true, createPlaylist: true, readPlaylist: false, preview: false, requiresUserAuthForSearch: !youtubeApiKeyConfigured() },
  isConfigured: () => youtubeOAuthConfigured() || youtubeApiKeyConfigured(),

  async search(q: TrackQuery, auth?: ProviderAuth): Promise<ProviderTrackRef[]> {
    const { apiKey } = env();
    if (!auth && !apiKey) throw new ProviderError("youtube", "connect YouTube or set YOUTUBE_API_KEY");
    const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth.accessToken}` } : {};
    const key = auth ? "" : `&key=${encodeURIComponent(apiKey)}`;
    const query = `${q.artist.split(/\s*&\s*/)[0]} ${q.title}`.replace(/["()]/g, "");
    const s = await fetchJson<{ items?: YtSearchItem[] }>(
      `${API}/search?${new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "5", q: query })}${key}`,
      { headers }, "youtube",
    );
    const items = (s.items ?? []).filter((i) => i.id.videoId);
    if (!items.length) return [];
    // 1 unit: durations make matching much more reliable than titles alone.
    const v = await fetchJson<{ items?: YtVideo[] }>(`${API}/videos?part=contentDetails&id=${items.map((i) => i.id.videoId).join(",")}${key}`, { headers }, "youtube").catch(() => ({ items: [] as YtVideo[] }));
    const dur = new Map((v.items ?? []).map((x) => [x.id, isoDuration(x.contentDetails?.duration)]));
    return items
      .map((i) => {
        const p = parseVideoTitle(i.snippet.title, i.snippet.channelTitle);
        return {
          provider: "youtube" as const,
          id: i.id.videoId!,
          url: `https://music.youtube.com/watch?v=${i.id.videoId}`,
          title: p.title,
          artist: p.artist,
          durationSec: dur.get(i.id.videoId!),
          official: p.official,
        };
      })
      // Official audio (Topic/VEVO) first: that's what YouTube Music plays.
      .sort((a, b) => Number(b.official) - Number(a.official))
      .map(({ official: _o, ...ref }) => ref);
  },

  async createPlaylist(auth, name, description, refs) {
    const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
    const pl = await fetchJson<{ id: string }>(`${API}/playlists?part=snippet,status`, {
      method: "POST", headers,
      body: JSON.stringify({ snippet: { title: name.slice(0, 150), description: description.slice(0, 4900) }, status: { privacyStatus: "private" } }),
    }, "youtube");
    // playlistItems.insert must be sequential to preserve order.
    for (const r of refs) {
      await fetchJson(`${API}/playlistItems?part=snippet`, {
        method: "POST", headers,
        body: JSON.stringify({ snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId: r.id } } }),
      }, "youtube");
    }
    return { id: pl.id, url: `https://music.youtube.com/playlist?list=${pl.id}` };
  },

  searchUrl: (q: TrackQuery) => `https://music.youtube.com/search?q=${encodeURIComponent(`${q.title} ${q.artist}`)}`,
};

/** Rough quota cost so the UI can warn before pushing. */
export function youtubeQuotaEstimate(tracks: number, cachedMatches: number): number {
  return (tracks - cachedMatches) * 101 + 50 + tracks * 50;
}
