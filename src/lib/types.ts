/**
 * Core domain types. Framework-free so they can be shared with a future
 * React Native / PWA client.
 */

export type GenreId =
  | "tr-pop"
  | "tr-dance"
  | "tr-rock"
  | "anatolian-rock"
  | "tr-alt"
  | "tr-rap"
  | "arabesk"
  | "fantezi"
  | "tsm"
  | "thm"
  | "pop"
  | "dance"
  | "disco-funk"
  | "rock"
  | "rnb-hiphop"
  | "indie"
  | "latin"
  | "jazz"
  | "lounge"
  | "electronic";

export type Mood =
  | "happy"
  | "sad"
  | "chill"
  | "romantic"
  | "energetic"
  | "nostalgic"
  | "melancholic"
  | "party"
  | "focus"
  | "roadtrip";

export type Activity =
  | "party"
  | "dinner"
  | "driving"
  | "workout"
  | "date"
  | "background"
  | "pregame"
  | "wedding"
  | "beach"
  | "work"
  | "raki"
  | "birthday";

/** Free-form descriptive tags on tracks; also used for include/exclude. */
export type TrackTag =
  | "singalong"
  | "anthem"
  | "slow"
  | "cheesy"
  | "classic"
  | "wedding"
  | "romantic"
  | "sad"
  | "summer"
  | "oyun"
  | "instrumental"
  | "cover"
  | "explicit";

export type FlowShape =
  | "flat"
  | "gradual_rise"
  | "party_curve"
  | "rollercoaster"
  | "peak_early"
  | "peak_late"
  | "wind_down"
  | "custom";

export type PlaylistMode = "sequential" | "shuffle";
export type Level3 = "low" | "medium" | "high";

export type TrackRole =
  | "opener"
  | "warmup"
  | "builder"
  | "singalong"
  | "bridge"
  | "peak"
  | "reset"
  | "cooldown"
  | "finale";

/**
 * Audio/editorial features. Every field is optional: providers rarely give
 * all of them, and the engine degrades gracefully when data is missing.
 * Scalar features are normalised to 0..1.
 */
export interface TrackFeatures {
  bpm?: number;
  /** Camelot notation, e.g. "8A". */
  key?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  loudness?: number;
  /** 0..1 — how well-known the track is (editorial estimate). */
  popularity?: number;
}

export type TrackSource = "catalog" | "ai" | "import" | "provider";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  durationSec: number;
  language: string; // ISO-639-1, "tr" | "en" | "es" ...
  genres: GenreId[];
  tags: TrackTag[];
  explicit: boolean;
  features: TrackFeatures;
  source: TrackSource;
  /** True when features are estimates (LLM or heuristic), not measured. */
  estimated?: boolean;
  isrc?: string;
}

export interface SegmentOverride {
  /** Minutes from start. */
  startMin: number;
  endMin: number;
  /** Energy delta on the 1..10 scale (-4..+4). */
  delta: number;
  label?: string;
}

export interface IncludeExclude {
  artists: string[];
  trackIds: string[];
  /** Free text track names not matched in catalog (kept for the LLM curator / providers). */
  trackNames: string[];
  genres: GenreId[];
  tags: TrackTag[];
}

/**
 * The structured brief that every playlist is generated from.
 * 1..10 scales mirror what users see in Expert Mode.
 */
export interface PlaylistBrief {
  title?: string;
  durationMin: number;
  durationStrict: boolean;
  /** 0..1 share of Turkish tracks. null = no preference. */
  turkishShare: number | null;
  languageStrict: boolean;
  genres: GenreId[];
  moods: Mood[];
  activity: Activity | null;
  eraFrom: number | null;
  eraTo: number | null;
  eraStrict: boolean;
  energy: number;
  danceability: number;
  valence: number;
  nostalgia: number;
  popularity: number;
  /** 0..100 % of discovery (less familiar) tracks. */
  discovery: number;
  flow: FlowShape;
  /** 0..1 where the peak sits for curve shapes that have one. */
  peakPosition: number;
  segments: SegmentOverride[];
  /** Custom curve control points (1..10), evenly spaced, used when flow === "custom". */
  customCurve?: number[];
  mode: PlaylistMode;
  explicit: boolean;
  artistRepetition: Level3;
  include: IncludeExclude;
  exclude: IncludeExclude;
  /** Soft-avoid tags ("çok arabesk olmasın") — penalised, not removed. */
  avoidTags: TrackTag[];
  avoidGenres: GenreId[];
  /** Artists the user wants featured heavily ("Tarkan ağırlıklı"). */
  focusArtists: string[];
  singalong: boolean;
  /** Reference playlists' track ids — the curator pulls toward their centroid. */
  referenceTrackIds: string[];
  /** Deterministic seed so regenerations are stable unless asked otherwise. */
  seed: number;
  /** Conversation language for sommelier copy. */
  lang: "tr" | "en";
  /** Fields the user (or parser) set explicitly; neutral defaults exert less pull. */
  explicitFields?: string[];
}

export interface PlaylistTrack {
  trackId: string;
  position: number;
  role: TrackRole;
  /** Transition score from previous track (0..1); null for the first track. */
  transitionIn: number | null;
  locked: boolean;
}

export interface PlaylistDNA {
  nostalgia: number;
  energy: number;
  dance: number;
  mainstream: number;
  discovery: number;
  turkish: number;
  happiness: number;
  acoustic: number;
}

export interface PlaylistStats {
  totalSec: number;
  trackCount: number;
  avgTransition: number;
  shuffleFriendly: number;
  energyAvg: number;
  /** Fraction of tracks whose features are estimates. */
  estimatedShare: number;
}

export interface SommelierSuggestion {
  id: string;
  message: string;
  /** Patch applied when user accepts. */
  acceptPatch: Partial<PlaylistBrief>;
  acceptLabel: string;
  declineLabel: string;
}

export interface Question {
  id: string;
  text: string;
  options: { label: string; patch: Partial<PlaylistBrief> }[];
}

export interface GeneratedPlaylist {
  brief: PlaylistBrief;
  tracks: PlaylistTrack[];
  dna: PlaylistDNA;
  stats: PlaylistStats;
  flowTarget: number[];
  explanation: string;
  suggestions: SommelierSuggestion[];
  warnings: string[];
}
