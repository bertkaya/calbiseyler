/**
 * MusicProvider adapter contract. The playlist engine never talks to a
 * provider directly — providers only search/match, read and save.
 */
export type ProviderId = "spotify" | "apple" | "youtube" | "deezer";

export interface TrackQuery {
  title: string;
  artist: string;
  durationSec?: number;
  isrc?: string;
}

export interface ProviderTrackRef {
  provider: ProviderId;
  id: string;
  uri?: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  durationSec?: number;
  isrc?: string;
  previewUrl?: string | null;
  explicit?: boolean;
  bpm?: number;
}

export interface ProviderAuth {
  accessToken: string;
}

export interface ImportedPlaylist {
  name: string;
  tracks: TrackQuery[];
}

export interface MusicProvider {
  id: ProviderId;
  name: string;
  capabilities: {
    search: boolean;
    createPlaylist: boolean;
    readPlaylist: boolean;
    preview: boolean;
    requiresUserAuthForSearch: boolean;
  };
  /** Credentials present in env. */
  isConfigured(): boolean;
  search(q: TrackQuery, auth?: ProviderAuth): Promise<ProviderTrackRef[]>;
  createPlaylist?(auth: ProviderAuth, name: string, description: string, refs: ProviderTrackRef[]): Promise<{ id: string; url: string }>;
  readPlaylist?(auth: ProviderAuth | undefined, idOrUrl: string): Promise<ImportedPlaylist>;
  /** Always-available deep link (no API needed). */
  searchUrl(q: TrackQuery): string;
}

export class ProviderError extends Error {
  constructor(public provider: ProviderId, message: string, public status?: number) {
    super(`[${provider}] ${message}`);
  }
}

/** fetch with timeout; providers must never hang the app. */
export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}, provider: ProviderId = "spotify"): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (res.status === 429) throw new ProviderError(provider, `rate limited (retry after ${res.headers.get("retry-after") ?? "?"}s)`, 429);
    if (!res.ok) {
      const text = await res.text();
      if (provider === "youtube" && res.status === 403 && /quotaExceeded|rateLimitExceeded/.test(text)) {
        throw new ProviderError(provider, "YouTube's daily quota is used up. It resets at midnight Pacific time — try again tomorrow.", 429);
      }
      throw new ProviderError(provider, `${res.status} ${text.slice(0, 200)}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(provider, (e as Error).name === "AbortError" ? "timeout" : (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
