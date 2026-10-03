import type { MusicTrack } from "../types";

/** Aggregated, transparent taste signals (see taste/model.ts). Values in -1..1. */
export interface TasteSignals {
  artist: Record<string, number>;
  genre: Record<string, number>;
  track: Record<string, number>;
  tag: Record<string, number>;
  never: string[];
  /** Positive = user tends to want more energy than they ask for. */
  energyBias: number;
}

export interface EngineContext {
  /** Candidate universe (catalog + dynamic tracks). */
  pool: MusicTrack[];
  taste?: TasteSignals | null;
  /** Tracks currently in the playlist — edits keep them unless they no longer fit. */
  keepTrackIds?: Set<string>;
  keepBonus?: number;
  referenceTracks?: MusicTrack[];
}
