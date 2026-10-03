/**
 * GetSongBPM — tempo + key fallback. Needs GETSONGBPM_API_KEY (free, requires
 * a backlink to getsongbpm.com, shown in the app footer when enabled).
 * Docs: https://getsongbpm.com/api
 */
import { fetchJson } from "../providers/types";
import { norm } from "../catalog";
import { camelotFromName, camelotFromOpenKey } from "./keys";

const API = "https://api.getsong.co";

interface GsbSong { title?: string; tempo?: string | number; key_of?: string; open_key?: string; danceability?: number; acousticness?: number; artist?: { name?: string } }

export function getSongBpmEnabled(): boolean {
  return !!process.env.GETSONGBPM_API_KEY;
}

export async function getSongBpm(title: string, artist: string): Promise<{ bpm?: number; key?: string; danceability?: number; acousticness?: number } | null> {
  const key = process.env.GETSONGBPM_API_KEY;
  if (!key) return null;
  const url = `${API}/search/?${new URLSearchParams({ api_key: key, type: "both", lookup: `song:${title} artist:${artist}`, limit: "5" })}`;
  const res = await fetchJson<{ search?: GsbSong[] | { error?: string } }>(url, { timeoutMs: 8000 }, "deezer").catch(() => null);
  const songs = Array.isArray(res?.search) ? res!.search : [];
  const hit = songs.find((s) => norm(s.title ?? "") === norm(title) && norm(s.artist?.name ?? "").includes(norm(artist).split(" ")[0])) ?? songs[0];
  if (!hit) return null;
  const bpm = Number(hit.tempo);
  return {
    bpm: Number.isFinite(bpm) && bpm > 30 ? Math.round(bpm) : undefined,
    key: camelotFromOpenKey(hit.open_key) ?? camelotFromName(hit.key_of),
    danceability: typeof hit.danceability === "number" ? hit.danceability / 100 : undefined,
    acousticness: typeof hit.acousticness === "number" ? hit.acousticness / 100 : undefined,
  };
}
