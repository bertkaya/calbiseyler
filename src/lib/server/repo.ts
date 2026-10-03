/**
 * Repository: every SQL statement lives here.
 */
import { db } from "../db";
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
export function ensureUser(id: string): void {
  db().prepare("INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)").run(id, Date.now());
}

export function getUser(id: string): { id: string; learningPaused: boolean; settings: Record<string, unknown> } | null {
  const r = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
  return r ? { id: String(r.id), learningPaused: !!r.learning_paused, settings: J(r.settings, {}) } : null;
}

export function setLearningPaused(id: string, paused: boolean): void {
  db().prepare("UPDATE users SET learning_paused = ? WHERE id = ?").run(paused ? 1 : 0, id);
}

/** GDPR/KVKK: delete everything about a user. */
export function deleteUserData(id: string): void {
  const d = db();
  d.prepare("DELETE FROM users WHERE id = ?").run(id); // cascades
}

// ── Taste ──────────────────────────────────────────────────────
export function getTaste(userId: string): TasteProfileData {
  const r = db().prepare("SELECT data FROM taste_profiles WHERE user_id = ?").get(userId) as Row | undefined;
  return { ...emptyTaste(), ...J<Partial<TasteProfileData>>(r?.data, {}) };
}

export function saveTaste(userId: string, data: TasteProfileData): void {
  db().prepare(
    "INSERT INTO taste_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).run(userId, JSON.stringify(data), Date.now());
}

export function resetTaste(userId: string): void {
  db().prepare("DELETE FROM taste_profiles WHERE user_id = ?").run(userId);
  db().prepare("DELETE FROM feedback WHERE user_id = ?").run(userId);
}

// ── Theme ──────────────────────────────────────────────────────
export function getTheme(userId: string): MusicTheme | null {
  const r = db().prepare("SELECT * FROM themes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(userId) as Row | undefined;
  if (!r) return null;
  return { id: String(r.id), statement: String(r.statement), principles: J(r.principles, []), discovery: r.discovery === null ? null : Number(r.discovery), updatedAt: Number(r.updated_at) };
}

export function saveTheme(userId: string, t: { statement: string; principles: string[]; discovery: number | null }): MusicTheme {
  const existing = getTheme(userId);
  const now = Date.now();
  if (existing) {
    db().prepare("UPDATE themes SET statement = ?, principles = ?, discovery = ?, updated_at = ? WHERE id = ?").run(t.statement, JSON.stringify(t.principles), t.discovery, now, existing.id);
    return { ...existing, ...t, updatedAt: now };
  }
  const id = `th_${randomId()}`;
  db().prepare("INSERT INTO themes (id, user_id, statement, principles, discovery, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, userId, t.statement, JSON.stringify(t.principles), t.discovery, now, now);
  return { id, ...t, updatedAt: now };
}

// ── Dynamic tracks (AI / import / provider) ────────────────────
export function upsertTrack(t: MusicTrack): void {
  db().prepare("INSERT INTO music_tracks (id, source, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(t.id, t.source, JSON.stringify(t), Date.now());
}

export function getTrack(id: string): MusicTrack | undefined {
  const s = seedTrack(id);
  if (s) return s;
  const r = db().prepare("SELECT data FROM music_tracks WHERE id = ?").get(id) as Row | undefined;
  return r ? J<MusicTrack | undefined>(r.data, undefined) : undefined;
}

export function getTracks(ids: string[]): MusicTrack[] {
  return ids.map(getTrack).filter((t): t is MusicTrack => !!t);
}

export function dynamicTracks(limit = 2000): MusicTrack[] {
  return (db().prepare("SELECT data FROM music_tracks ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map((r) => J<MusicTrack>(r.data, null as unknown as MusicTrack)).filter(Boolean);
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
    saved: !!r.saved, shareId: (r.share_id as string) ?? null, parentId: (r.parent_id as string) ?? null,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), tracks,
  };
}

export function loadTracksOf(playlistId: string): PlaylistTrack[] {
  return (db().prepare("SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position").all(playlistId) as Row[]).map((r) => ({
    trackId: String(r.track_id), position: Number(r.position), role: r.role as PlaylistTrack["role"],
    transitionIn: r.transition_in === null ? null : Number(r.transition_in), locked: !!r.locked,
  }));
}

export function getPlaylist(id: string): StoredPlaylist | null {
  const r = db().prepare("SELECT * FROM playlists WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToPlaylist(r, loadTracksOf(id)) : null;
}

export function getPlaylistByShare(shareId: string): StoredPlaylist | null {
  const r = db().prepare("SELECT * FROM playlists WHERE share_id = ?").get(shareId) as Row | undefined;
  return r ? rowToPlaylist(r, loadTracksOf(String(r.id))) : null;
}

export function listPlaylists(userId: string, limit = 30): StoredPlaylist[] {
  return (db().prepare("SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?").all(userId, limit) as Row[]).map((r) => rowToPlaylist(r, []));
}

export function savePlaylist(p: Omit<StoredPlaylist, "createdAt" | "updatedAt"> & { createdAt?: number }): StoredPlaylist {
  const d = db();
  const now = Date.now();
  const created = p.createdAt ?? now;
  d.exec("BEGIN");
  try {
    d.prepare(
      `INSERT INTO playlists (id, user_id, title, prompt, brief, interpretation, explanation, dna, stats, flow_target, suggestions, warnings, saved, share_id, parent_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, prompt=excluded.prompt, brief=excluded.brief, interpretation=excluded.interpretation,
         explanation=excluded.explanation, dna=excluded.dna, stats=excluded.stats, flow_target=excluded.flow_target, suggestions=excluded.suggestions,
         warnings=excluded.warnings, saved=excluded.saved, share_id=excluded.share_id, updated_at=excluded.updated_at`,
    ).run(
      p.id, p.userId, p.title, p.prompt, JSON.stringify(p.brief), p.interpretation, p.explanation, JSON.stringify(p.dna), JSON.stringify(p.stats),
      JSON.stringify(p.flowTarget), JSON.stringify(p.suggestions), JSON.stringify(p.warnings), p.saved ? 1 : 0, p.shareId, p.parentId, created, now,
    );
    d.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(p.id);
    const ins = d.prepare("INSERT INTO playlist_tracks (playlist_id, position, track_id, role, transition_in, locked) VALUES (?,?,?,?,?,?)");
    p.tracks.forEach((t, i) => ins.run(p.id, i, t.trackId, t.role, t.transitionIn, t.locked ? 1 : 0));
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { ...p, createdAt: created, updatedAt: now };
}

export function deletePlaylist(id: string, userId: string): boolean {
  return db().prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

// ── Sessions (edit history + undo) ─────────────────────────────
export function logSession(playlistId: string, kind: string, input: string, summary: string, snapshot: StoredPlaylist | null): void {
  db().prepare("INSERT INTO playlist_sessions (playlist_id, kind, input, summary, snapshot, created_at) VALUES (?,?,?,?,?,?)").run(
    playlistId, kind, input, summary, snapshot ? JSON.stringify(snapshot) : null, Date.now(),
  );
}

export function listSessions(playlistId: string, limit = 30): { id: number; kind: string; input: string; summary: string; createdAt: number; hasSnapshot: boolean }[] {
  return (db().prepare("SELECT id, kind, input, summary, created_at, snapshot IS NOT NULL AS has FROM playlist_sessions WHERE playlist_id = ? ORDER BY id DESC LIMIT ?").all(playlistId, limit) as Row[]).map((r) => ({
    id: Number(r.id), kind: String(r.kind), input: String(r.input), summary: String(r.summary), createdAt: Number(r.created_at), hasSnapshot: !!r.has,
  }));
}

/** Pops the latest snapshot (undo). */
export function popSnapshot(playlistId: string): StoredPlaylist | null {
  const r = db().prepare("SELECT id, snapshot FROM playlist_sessions WHERE playlist_id = ? AND snapshot IS NOT NULL ORDER BY id DESC LIMIT 1").get(playlistId) as Row | undefined;
  if (!r) return null;
  db().prepare("UPDATE playlist_sessions SET snapshot = NULL WHERE id = ?").run(Number(r.id));
  return J<StoredPlaylist | null>(r.snapshot, null);
}

// ── Feedback & journal ─────────────────────────────────────────
export function addFeedback(userId: string, playlistId: string | null, trackId: string | null, artist: string | null, kind: string, context: object = {}): void {
  db().prepare("INSERT INTO feedback (user_id, playlist_id, track_id, artist, kind, context, created_at) VALUES (?,?,?,?,?,?,?)").run(
    userId, playlistId, trackId, artist, kind, JSON.stringify(context), Date.now(),
  );
}

export function feedbackForPlaylist(userId: string, playlistId: string): Record<string, string> {
  const rows = db().prepare("SELECT track_id, kind FROM feedback WHERE user_id = ? AND playlist_id = ? ORDER BY id").all(userId, playlistId) as Row[];
  const out: Record<string, string> = {};
  for (const r of rows) if (r.track_id) out[String(r.track_id)] = String(r.kind);
  return out;
}

export function addJournal(userId: string, playlistId: string | null, text: string, signals: object): void {
  db().prepare("INSERT INTO journal_entries (user_id, playlist_id, text, signals, created_at) VALUES (?,?,?,?,?)").run(userId, playlistId, text, JSON.stringify(signals), Date.now());
}

export function listJournal(userId: string, limit = 50): { id: number; playlistId: string | null; playlistTitle: string | null; text: string; createdAt: number }[] {
  return (db().prepare(
    "SELECT j.id, j.playlist_id, p.title, j.text, j.created_at FROM journal_entries j LEFT JOIN playlists p ON p.id = j.playlist_id WHERE j.user_id = ? ORDER BY j.id DESC LIMIT ?",
  ).all(userId, limit) as Row[]).map((r) => ({ id: Number(r.id), playlistId: (r.playlist_id as string) ?? null, playlistTitle: (r.title as string) ?? null, text: String(r.text), createdAt: Number(r.created_at) }));
}

export function deleteJournal(userId: string, id: number): void {
  db().prepare("DELETE FROM journal_entries WHERE id = ? AND user_id = ?").run(id, userId);
}

// ── Provider connections & match cache ─────────────────────────
export interface Connection { provider: string; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: number; accountId: string | null; accountName: string | null; scope: string | null }

export function getConnection(userId: string, provider: string): Connection | null {
  const r = db().prepare("SELECT * FROM provider_connections WHERE user_id = ? AND provider = ?").get(userId, provider) as Row | undefined;
  return r ? { provider, accessTokenEnc: String(r.access_token_enc), refreshTokenEnc: (r.refresh_token_enc as string) ?? null, expiresAt: Number(r.expires_at), accountId: (r.account_id as string) ?? null, accountName: (r.account_name as string) ?? null, scope: (r.scope as string) ?? null } : null;
}

export function listConnections(userId: string): { provider: string; accountName: string | null }[] {
  return (db().prepare("SELECT provider, account_name FROM provider_connections WHERE user_id = ?").all(userId) as Row[]).map((r) => ({ provider: String(r.provider), accountName: (r.account_name as string) ?? null }));
}

export function saveConnection(userId: string, c: Connection): void {
  db().prepare(
    `INSERT INTO provider_connections (user_id, provider, access_token_enc, refresh_token_enc, expires_at, account_id, account_name, scope) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, provider) DO UPDATE SET access_token_enc=excluded.access_token_enc, refresh_token_enc=COALESCE(excluded.refresh_token_enc, provider_connections.refresh_token_enc),
     expires_at=excluded.expires_at, account_id=COALESCE(excluded.account_id, provider_connections.account_id), account_name=COALESCE(excluded.account_name, provider_connections.account_name), scope=excluded.scope`,
  ).run(userId, c.provider, c.accessTokenEnc, c.refreshTokenEnc, c.expiresAt, c.accountId, c.accountName, c.scope);
}

export function deleteConnection(userId: string, provider: string): void {
  db().prepare("DELETE FROM provider_connections WHERE user_id = ? AND provider = ?").run(userId, provider);
}

export function getCachedMatch<T>(trackId: string, provider: string, maxAgeMs = 7 * 864e5): T | null {
  const r = db().prepare("SELECT data, checked_at FROM provider_matches WHERE track_id = ? AND provider = ?").get(trackId, provider) as Row | undefined;
  if (!r || Date.now() - Number(r.checked_at) > maxAgeMs) return null;
  return J<T | null>(r.data, null);
}

export function cacheMatch(trackId: string, provider: string, data: object): void {
  db().prepare("INSERT INTO provider_matches (track_id, provider, data, checked_at) VALUES (?,?,?,?) ON CONFLICT(track_id, provider) DO UPDATE SET data=excluded.data, checked_at=excluded.checked_at").run(trackId, provider, JSON.stringify(data), Date.now());
}

// ── Stats (gentle gamification) ────────────────────────────────
export function playlistCountSince(userId: string, since: number): number {
  return Number((db().prepare("SELECT COUNT(*) AS n FROM playlists WHERE user_id = ? AND created_at >= ?").get(userId, since) as Row).n);
}

export function feedbackSince(userId: string, since: number): { kind: string; trackId: string | null }[] {
  return (db().prepare("SELECT kind, track_id FROM feedback WHERE user_id = ? AND created_at >= ?").all(userId, since) as Row[]).map((r) => ({ kind: String(r.kind), trackId: (r.track_id as string) ?? null }));
}
