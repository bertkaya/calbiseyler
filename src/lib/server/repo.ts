/**
 * Repository: every SQL statement lives here. Async (libSQL works the same
 * against a local SQLite file and a remote Turso database).
 */
import { all, get, run, tx } from "../db";
import type { GeneratedPlaylist, MusicTrack, PlaylistBrief, PlaylistTrack } from "../types";
import { seedTrack } from "../catalog";
import { emptyTaste, type TasteProfileData } from "../taste/model";
import type { MusicTheme } from "../taste/theme";
import { randomId } from "./crypto";

type Row = Record<string, unknown>;
const J = <T>(s: unknown, fallback: T): T => {
  try { return s ? (JSON.parse(String(s)) as T) : fallback; } catch { return fallback; }
};

// ── Users ──────────────────────────────────────────────────────
export async function ensureUser(id: string): Promise<void> {
  await run("INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)", [id, Date.now()]);
}

export async function getUser(id: string): Promise<{ id: string; learningPaused: boolean; settings: Record<string, unknown> } | null> {
  const r = await get<Row>("SELECT * FROM users WHERE id = ?", [id]);
  return r ? { id: String(r.id), learningPaused: !!Number(r.learning_paused), settings: J(r.settings, {}) } : null;
}

export async function setLearningPaused(id: string, paused: boolean): Promise<void> {
  await run("UPDATE users SET learning_paused = ? WHERE id = ?", [paused ? 1 : 0, id]);
}

/** GDPR/KVKK: delete everything about a user (explicit, not relying on FK cascades). */
export async function deleteUserData(id: string): Promise<void> {
  await tx([
    { sql: "DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)", args: [id] },
    { sql: "DELETE FROM playlist_sessions WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)", args: [id] },
    { sql: "DELETE FROM playlists WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM taste_profiles WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM themes WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM feedback WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM journal_entries WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM provider_connections WHERE user_id = ?", args: [id] },
    { sql: "DELETE FROM users WHERE id = ?", args: [id] },
  ]);
}

// ── Taste ──────────────────────────────────────────────────────
export async function getTaste(userId: string): Promise<TasteProfileData> {
  const r = await get<Row>("SELECT data FROM taste_profiles WHERE user_id = ?", [userId]);
  return { ...emptyTaste(), ...J<Partial<TasteProfileData>>(r?.data, {}) };
}

export async function saveTaste(userId: string, data: TasteProfileData): Promise<void> {
  await run(
    "INSERT INTO taste_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    [userId, JSON.stringify(data), Date.now()],
  );
}

export async function resetTaste(userId: string): Promise<void> {
  await tx([
    { sql: "DELETE FROM taste_profiles WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM feedback WHERE user_id = ?", args: [userId] },
  ]);
}

// ── Theme ──────────────────────────────────────────────────────
export async function getTheme(userId: string): Promise<MusicTheme | null> {
  const r = await get<Row>("SELECT * FROM themes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1", [userId]);
  if (!r) return null;
  return { id: String(r.id), statement: String(r.statement), principles: J(r.principles, []), discovery: r.discovery === null ? null : Number(r.discovery), updatedAt: Number(r.updated_at) };
}

export async function saveTheme(userId: string, t: { statement: string; principles: string[]; discovery: number | null }): Promise<MusicTheme> {
  const existing = await getTheme(userId);
  const now = Date.now();
  if (existing) {
    await run("UPDATE themes SET statement = ?, principles = ?, discovery = ?, updated_at = ? WHERE id = ?", [t.statement, JSON.stringify(t.principles), t.discovery, now, existing.id]);
    return { ...existing, ...t, updatedAt: now };
  }
  const id = `th_${randomId()}`;
  await run("INSERT INTO themes (id, user_id, statement, principles, discovery, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, userId, t.statement, JSON.stringify(t.principles), t.discovery, now, now]);
  return { id, ...t, updatedAt: now };
}

// ── Dynamic tracks (AI / import / provider) ────────────────────
export async function upsertTrack(t: MusicTrack): Promise<void> {
  await run("INSERT INTO music_tracks (id, source, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [t.id, t.source, JSON.stringify(t), Date.now()]);
}

export async function getTrack(id: string): Promise<MusicTrack | undefined> {
  const s = seedTrack(id);
  if (s) return s;
  const r = await get<Row>("SELECT data FROM music_tracks WHERE id = ?", [id]);
  return r ? J<MusicTrack | undefined>(r.data, undefined) : undefined;
}

/** Order-preserving batch lookup (one query for all non-seed ids). */
export async function getTracks(ids: string[]): Promise<MusicTrack[]> {
  const missing = [...new Set(ids.filter((id) => !seedTrack(id)))];
  const dyn = new Map<string, MusicTrack>();
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await all<Row>(`SELECT id, data FROM music_tracks WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk);
    for (const r of rows) { const t = J<MusicTrack | null>(r.data, null); if (t) dyn.set(String(r.id), t); }
  }
  return ids.map((id) => seedTrack(id) ?? dyn.get(id)).filter((t): t is MusicTrack => !!t);
}

export async function dynamicTracks(limit = 2000): Promise<MusicTrack[]> {
  const rows = await all<Row>("SELECT data FROM music_tracks ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map((r) => J<MusicTrack | null>(r.data, null)).filter((t): t is MusicTrack => !!t);
}

// ── Playlists ──────────────────────────────────────────────────
export interface StoredPlaylist {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  brief: PlaylistBrief;
  interpretation: string;
  explanation: string;
  dna: GeneratedPlaylist["dna"];
  stats: GeneratedPlaylist["stats"];
  flowTarget: number[];
  suggestions: GeneratedPlaylist["suggestions"];
  warnings: string[];
  saved: boolean;
  shareId: string | null;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
}

function rowToPlaylist(r: Row, tracks: PlaylistTrack[]): StoredPlaylist {
  return {
    id: String(r.id), userId: String(r.user_id), title: String(r.title), prompt: String(r.prompt),
    brief: J(r.brief, {} as PlaylistBrief), interpretation: String(r.interpretation), explanation: String(r.explanation),
    dna: J(r.dna, {} as GeneratedPlaylist["dna"]), stats: J(r.stats, {} as GeneratedPlaylist["stats"]),
    flowTarget: J(r.flow_target, []), suggestions: J(r.suggestions, []), warnings: J(r.warnings, []),
    saved: !!Number(r.saved), shareId: (r.share_id as string) ?? null, parentId: (r.parent_id as string) ?? null,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), tracks,
  };
}

export async function loadTracksOf(playlistId: string): Promise<PlaylistTrack[]> {
  const rows = await all<Row>("SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position", [playlistId]);
  return rows.map((r) => ({
    trackId: String(r.track_id), position: Number(r.position), role: r.role as PlaylistTrack["role"],
    transitionIn: r.transition_in === null ? null : Number(r.transition_in), locked: !!Number(r.locked),
  }));
}

export async function getPlaylist(id: string): Promise<StoredPlaylist | null> {
  const r = await get<Row>("SELECT * FROM playlists WHERE id = ?", [id]);
  return r ? rowToPlaylist(r, await loadTracksOf(id)) : null;
}

export async function getPlaylistByShare(shareId: string): Promise<StoredPlaylist | null> {
  const r = await get<Row>("SELECT * FROM playlists WHERE share_id = ?", [shareId]);
  return r ? rowToPlaylist(r, await loadTracksOf(String(r.id))) : null;
}

export async function listPlaylists(userId: string, limit = 30): Promise<StoredPlaylist[]> {
  const rows = await all<Row>("SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?", [userId, limit]);
  return rows.map((r) => rowToPlaylist(r, []));
}

export async function savePlaylist(p: Omit<StoredPlaylist, "createdAt" | "updatedAt"> & { createdAt?: number }): Promise<StoredPlaylist> {
  const now = Date.now();
  const created = p.createdAt ?? now;
  await tx([
    {
      sql: `INSERT INTO playlists (id, user_id, title, prompt, brief, interpretation, explanation, dna, stats, flow_target, suggestions, warnings, saved, share_id, parent_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, prompt=excluded.prompt, brief=excluded.brief, interpretation=excluded.interpretation,
         explanation=excluded.explanation, dna=excluded.dna, stats=excluded.stats, flow_target=excluded.flow_target, suggestions=excluded.suggestions,
         warnings=excluded.warnings, saved=excluded.saved, share_id=excluded.share_id, updated_at=excluded.updated_at`,
      args: [
        p.id, p.userId, p.title, p.prompt, JSON.stringify(p.brief), p.interpretation, p.explanation, JSON.stringify(p.dna), JSON.stringify(p.stats),
        JSON.stringify(p.flowTarget), JSON.stringify(p.suggestions), JSON.stringify(p.warnings), p.saved ? 1 : 0, p.shareId, p.parentId, created, now,
      ],
    },
    { sql: "DELETE FROM playlist_tracks WHERE playlist_id = ?", args: [p.id] },
    ...p.tracks.map((t, i) => ({
      sql: "INSERT INTO playlist_tracks (playlist_id, position, track_id, role, transition_in, locked) VALUES (?,?,?,?,?,?)",
      args: [p.id, i, t.trackId, t.role, t.transitionIn, t.locked ? 1 : 0],
    })),
  ]);
  return { ...p, createdAt: created, updatedAt: now };
}

export async function deletePlaylist(id: string, userId: string): Promise<boolean> {
  const owned = await get<Row>("SELECT id FROM playlists WHERE id = ? AND user_id = ?", [id, userId]);
  if (!owned) return false;
  await tx([
    { sql: "DELETE FROM playlist_tracks WHERE playlist_id = ?", args: [id] },
    { sql: "DELETE FROM playlist_sessions WHERE playlist_id = ?", args: [id] },
    { sql: "DELETE FROM playlists WHERE id = ?", args: [id] },
  ]);
  return true;
}

// ── Sessions (edit history + undo) ─────────────────────────────
export async function logSession(playlistId: string, kind: string, input: string, summary: string, snapshot: StoredPlaylist | null): Promise<void> {
  await run("INSERT INTO playlist_sessions (playlist_id, kind, input, summary, snapshot, created_at) VALUES (?,?,?,?,?,?)", [
    playlistId, kind, input, summary, snapshot ? JSON.stringify(snapshot) : null, Date.now(),
  ]);
}

export async function listSessions(playlistId: string, limit = 30): Promise<{ id: number; kind: string; input: string; summary: string; createdAt: number; hasSnapshot: boolean }[]> {
  const rows = await all<Row>("SELECT id, kind, input, summary, created_at, snapshot IS NOT NULL AS has FROM playlist_sessions WHERE playlist_id = ? ORDER BY id DESC LIMIT ?", [playlistId, limit]);
  return rows.map((r) => ({ id: Number(r.id), kind: String(r.kind), input: String(r.input), summary: String(r.summary), createdAt: Number(r.created_at), hasSnapshot: !!Number(r.has) }));
}

/** Pops the latest snapshot (undo). */
export async function popSnapshot(playlistId: string): Promise<StoredPlaylist | null> {
  const r = await get<Row>("SELECT id, snapshot FROM playlist_sessions WHERE playlist_id = ? AND snapshot IS NOT NULL ORDER BY id DESC LIMIT 1", [playlistId]);
  if (!r) return null;
  await run("UPDATE playlist_sessions SET snapshot = NULL WHERE id = ?", [Number(r.id)]);
  return J<StoredPlaylist | null>(r.snapshot, null);
}

// ── Feedback & journal ─────────────────────────────────────────
export async function addFeedback(userId: string, playlistId: string | null, trackId: string | null, artist: string | null, kind: string, context: object = {}): Promise<void> {
  await run("INSERT INTO feedback (user_id, playlist_id, track_id, artist, kind, context, created_at) VALUES (?,?,?,?,?,?,?)", [
    userId, playlistId, trackId, artist, kind, JSON.stringify(context), Date.now(),
  ]);
}

export async function feedbackForPlaylist(userId: string, playlistId: string): Promise<Record<string, string>> {
  const rows = await all<Row>("SELECT track_id, kind FROM feedback WHERE user_id = ? AND playlist_id = ? ORDER BY id", [userId, playlistId]);
  const out: Record<string, string> = {};
  for (const r of rows) if (r.track_id) out[String(r.track_id)] = String(r.kind);
  return out;
}

export async function addJournal(userId: string, playlistId: string | null, text: string, signals: object): Promise<void> {
  await run("INSERT INTO journal_entries (user_id, playlist_id, text, signals, created_at) VALUES (?,?,?,?,?)", [userId, playlistId, text, JSON.stringify(signals), Date.now()]);
}

export async function listJournal(userId: string, limit = 50): Promise<{ id: number; playlistId: string | null; playlistTitle: string | null; text: string; createdAt: number }[]> {
  const rows = await all<Row>(
    "SELECT j.id, j.playlist_id, p.title, j.text, j.created_at FROM journal_entries j LEFT JOIN playlists p ON p.id = j.playlist_id WHERE j.user_id = ? ORDER BY j.id DESC LIMIT ?",
    [userId, limit],
  );
  return rows.map((r) => ({ id: Number(r.id), playlistId: (r.playlist_id as string) ?? null, playlistTitle: (r.title as string) ?? null, text: String(r.text), createdAt: Number(r.created_at) }));
}

export async function deleteJournal(userId: string, id: number): Promise<void> {
  await run("DELETE FROM journal_entries WHERE id = ? AND user_id = ?", [id, userId]);
}

// ── Provider connections & match cache ─────────────────────────
export interface Connection { provider: string; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: number; accountId: string | null; accountName: string | null; scope: string | null }

export async function getConnection(userId: string, provider: string): Promise<Connection | null> {
  const r = await get<Row>("SELECT * FROM provider_connections WHERE user_id = ? AND provider = ?", [userId, provider]);
  return r ? { provider, accessTokenEnc: String(r.access_token_enc), refreshTokenEnc: (r.refresh_token_enc as string) ?? null, expiresAt: Number(r.expires_at), accountId: (r.account_id as string) ?? null, accountName: (r.account_name as string) ?? null, scope: (r.scope as string) ?? null } : null;
}

export async function listConnections(userId: string): Promise<{ provider: string; accountName: string | null }[]> {
  const rows = await all<Row>("SELECT provider, account_name FROM provider_connections WHERE user_id = ?", [userId]);
  return rows.map((r) => ({ provider: String(r.provider), accountName: (r.account_name as string) ?? null }));
}

export async function saveConnection(userId: string, c: Connection): Promise<void> {
  await run(
    `INSERT INTO provider_connections (user_id, provider, access_token_enc, refresh_token_enc, expires_at, account_id, account_name, scope) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, provider) DO UPDATE SET access_token_enc=excluded.access_token_enc, refresh_token_enc=COALESCE(excluded.refresh_token_enc, provider_connections.refresh_token_enc),
     expires_at=excluded.expires_at, account_id=COALESCE(excluded.account_id, provider_connections.account_id), account_name=COALESCE(excluded.account_name, provider_connections.account_name), scope=excluded.scope`,
    [userId, c.provider, c.accessTokenEnc, c.refreshTokenEnc, c.expiresAt, c.accountId, c.accountName, c.scope],
  );
}

export async function deleteConnection(userId: string, provider: string): Promise<void> {
  await run("DELETE FROM provider_connections WHERE user_id = ? AND provider = ?", [userId, provider]);
}

export async function getCachedMatch<T>(trackId: string, provider: string, maxAgeMs = 7 * 864e5): Promise<T | null> {
  const r = await get<Row>("SELECT data, checked_at FROM provider_matches WHERE track_id = ? AND provider = ?", [trackId, provider]);
  if (!r || Date.now() - Number(r.checked_at) > maxAgeMs) return null;
  return J<T | null>(r.data, null);
}

export async function cacheMatch(trackId: string, provider: string, data: object): Promise<void> {
  await run("INSERT INTO provider_matches (track_id, provider, data, checked_at) VALUES (?,?,?,?) ON CONFLICT(track_id, provider) DO UPDATE SET data=excluded.data, checked_at=excluded.checked_at", [trackId, provider, JSON.stringify(data), Date.now()]);
}

// ── Stats (gentle gamification) ────────────────────────────────
export async function playlistCountSince(userId: string, since: number): Promise<number> {
  return Number((await get<Row>("SELECT COUNT(*) AS n FROM playlists WHERE user_id = ? AND created_at >= ?", [userId, since]))?.n ?? 0);
}

export async function feedbackSince(userId: string, since: number): Promise<{ kind: string; trackId: string | null }[]> {
  const rows = await all<Row>("SELECT kind, track_id FROM feedback WHERE user_id = ? AND created_at >= ?", [userId, since]);
  return rows.map((r) => ({ kind: String(r.kind), trackId: (r.track_id as string) ?? null }));
}
