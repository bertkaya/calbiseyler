/**
 * Feature enrichment pipeline — grows the catalog with MEASURED features.
 *
 *   track ──Spotify search──▶ Spotify ID/ISRC ──ReccoBeats──▶ energy, valence, dance, tempo, key, popularity
 *                                   └─ no BPM? ──GetSongBPM──▶ tempo, key
 *                                   └─ still no BPM? ──Deezer track──▶ bpm
 *
 * Every step is optional and fail-safe: if a source is down or unconfigured
 * the track keeps its editorial/estimated values.
 */
import type { MusicTrack, TrackFeatures } from "../types";
import { spotifyProvider } from "../providers/spotify";
import { deezerProvider, deezerTrackDetail } from "../providers/deezer";
import { matchTrack } from "../providers/matcher";
import type { ProviderAuth } from "../providers/types";
import { reccoEnabled, reccoFeatures } from "./reccobeats";
import { getSongBpm, getSongBpmEnabled } from "./getsongbpm";

export interface EnrichOptions {
  spotifyAuth?: ProviderAuth;
  /** Stop starting new lookups after this many ms (keeps requests snappy). */
  budgetMs?: number;
  concurrency?: number;
}

export interface EnrichReport {
  total: number;
  measured: number;
  bpmOnly: number;
  failed: number;
}

/** Measured values win over editorial/estimated ones, field by field. */
export function mergeFeatures(base: TrackFeatures, measured: TrackFeatures): TrackFeatures {
  const out: TrackFeatures = { ...base };
  for (const [k, v] of Object.entries(measured) as [keyof TrackFeatures, TrackFeatures[keyof TrackFeatures]][]) {
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function enrichmentAvailable(): boolean {
  return (spotifyProvider.isConfigured() && reccoEnabled()) || getSongBpmEnabled() || deezerProvider.isConfigured();
}

export async function enrichTracks(tracks: MusicTrack[], opts: EnrichOptions = {}): Promise<{ tracks: MusicTrack[]; report: EnrichReport }> {
  const start = Date.now();
  const over = () => opts.budgetMs !== undefined && Date.now() - start > opts.budgetMs;
  const out = tracks.map((t) => ({ ...t, features: { ...t.features } }));
  const report: EnrichReport = { total: tracks.length, measured: 0, bpmOnly: 0, failed: 0 };

  // 1) Resolve Spotify IDs (needed by ReccoBeats).
  if (spotifyProvider.isConfigured() && reccoEnabled()) {
    let i = 0;
    const worker = async () => {
      while (i < out.length && !over()) {
        const t = out[i++];
        if (t.spotifyId) continue;
        const m = await matchTrack(t, spotifyProvider, opts.spotifyAuth);
        if (m.status === "available" && m.ref) {
          t.spotifyId = m.ref.id;
          t.isrc ??= m.ref.isrc;
        }
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));

    // 2) ReccoBeats, batched.
    const ids = out.map((t) => t.spotifyId).filter((x): x is string => !!x);
    if (ids.length && !over()) {
      const feats = await reccoFeatures(ids).catch(() => new Map<string, TrackFeatures>());
      for (const t of out) {
        const f = t.spotifyId ? feats.get(t.spotifyId) : undefined;
        if (f && f.energy !== undefined) {
          t.features = mergeFeatures(t.features, f);
          t.estimated = false;
          t.featureSource = "reccobeats";
          report.measured++;
        }
      }
    }
  }

  // 3) BPM/key fallbacks.
  for (const t of out) {
    if (over()) break;
    if (t.features.bpm && t.featureSource) continue;
    let got = false;
    if (getSongBpmEnabled()) {
      const g = await getSongBpm(t.title, t.artist).catch(() => null);
      if (g?.bpm) {
        t.features = mergeFeatures(t.features, { bpm: g.bpm, key: g.key, ...(t.featureSource ? {} : { danceability: g.danceability, acousticness: g.acousticness }) });
        t.featureSource ??= "getsongbpm";
        got = true;
      }
    }
    if (!got && deezerProvider.isConfigured()) {
      const m = await matchTrack(t, deezerProvider);
      const d = m.ref && (m.status === "available" || m.status === "alternative") ? await deezerTrackDetail(m.ref.id) : null;
      if (d?.bpm) {
        t.features = mergeFeatures(t.features, { bpm: d.bpm });
        t.featureSource ??= "deezer";
        got = true;
      }
      t.isrc ??= d?.isrc;
    }
    if (got && t.featureSource !== "reccobeats") report.bpmOnly++;
    if (!got && t.featureSource !== "reccobeats") report.failed++;
  }
  return { tracks: out, report };
}
