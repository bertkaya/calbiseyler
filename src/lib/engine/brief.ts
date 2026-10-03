import type { Activity, IncludeExclude, PlaylistBrief } from "../types";
import { clamp, clamp10 } from "./util";

export const emptyIE = (): IncludeExclude => ({ artists: [], trackIds: [], trackNames: [], genres: [], tags: [] });

export function defaultBrief(): PlaylistBrief {
  return {
    durationMin: 60,
    durationStrict: false,
    turkishShare: null,
    languageStrict: false,
    genres: [],
    moods: [],
    activity: null,
    eraFrom: null,
    eraTo: null,
    eraStrict: false,
    energy: 6,
    danceability: 6,
    valence: 6,
    nostalgia: 5,
    popularity: 7,
    discovery: 15,
    flow: "gradual_rise",
    peakPosition: 0.7,
    segments: [],
    mode: "sequential",
    explicit: true,
    artistRepetition: "medium",
    include: emptyIE(),
    exclude: emptyIE(),
    avoidTags: [],
    avoidGenres: [],
    focusArtists: [],
    singalong: false,
    referenceTrackIds: [],
    seed: 7,
    lang: "tr",
    explicitFields: [],
  };
}

/** Activity → sensible technical defaults (the "sommelier" interpretation). */
export const ACTIVITY_PROFILES: Record<Activity, Partial<PlaylistBrief>> = {
  party: { energy: 8, danceability: 8, valence: 8, popularity: 8, flow: "party_curve", peakPosition: 0.72, singalong: true },
  birthday: { energy: 8, danceability: 8, valence: 9, popularity: 8, flow: "party_curve", peakPosition: 0.7, singalong: true },
  dinner: { energy: 4, danceability: 4, valence: 6, popularity: 6, flow: "flat", moods: ["chill"] },
  driving: { energy: 6.5, danceability: 6, valence: 7, popularity: 7, flow: "rollercoaster", singalong: true, moods: ["roadtrip"] },
  workout: { energy: 9, danceability: 7, valence: 7, popularity: 7, flow: "peak_late", peakPosition: 0.8 },
  date: { energy: 4, danceability: 5, valence: 6, popularity: 6, flow: "flat", moods: ["romantic"] },
  background: { energy: 4.5, danceability: 5, valence: 6, popularity: 6, flow: "flat" },
  pregame: { energy: 7.5, danceability: 8, valence: 8, popularity: 8, flow: "gradual_rise" },
  wedding: { energy: 8, danceability: 9, valence: 9, popularity: 9, flow: "rollercoaster", peakPosition: 0.7, singalong: true, explicit: false, artistRepetition: "low" },
  beach: { energy: 6.5, danceability: 7, valence: 8, popularity: 7, flow: "flat" },
  work: { energy: 4, danceability: 4, valence: 6, popularity: 6, flow: "flat", moods: ["focus"], mode: "shuffle" },
  raki: {
    energy: 5.5, danceability: 5, valence: 6, popularity: 8, nostalgia: 7, flow: "peak_late", peakPosition: 0.82,
    singalong: true, turkishShare: 1, languageStrict: true, genres: ["tsm", "thm", "tr-pop", "fantezi", "anatolian-rock"],
  },
};

const NUMERIC_10 = ["energy", "danceability", "valence", "nostalgia", "popularity"] as const;

/** Merge a patch into a brief, clamping and de-duplicating. Arrays inside include/exclude are merged. */
export function applyPatch(brief: PlaylistBrief, patch: Partial<PlaylistBrief>, markExplicit = true): PlaylistBrief {
  const next: PlaylistBrief = { ...brief, ...patch };
  next.include = mergeIE(brief.include, patch.include);
  next.exclude = mergeIE(brief.exclude, patch.exclude);
  if (patch.include && (patch.include as IncludeExclude & { replace?: boolean }).replace) next.include = { ...emptyIE(), ...patch.include };
  if (patch.exclude && (patch.exclude as IncludeExclude & { replace?: boolean }).replace) next.exclude = { ...emptyIE(), ...patch.exclude };
  if (markExplicit) {
    const fields = new Set([...(brief.explicitFields ?? []), ...Object.keys(patch)]);
    next.explicitFields = [...fields];
  }
  return normalizeBrief(next);
}

function mergeIE(a: IncludeExclude, b?: Partial<IncludeExclude>): IncludeExclude {
  if (!b) return a;
  const u = <T>(x: T[] = [], y: T[] = []) => Array.from(new Set([...x, ...y]));
  return {
    artists: u(a.artists, b.artists),
    trackIds: u(a.trackIds, b.trackIds),
    trackNames: u(a.trackNames, b.trackNames),
    genres: u(a.genres, b.genres),
    tags: u(a.tags, b.tags),
  };
}

export function normalizeBrief(b: PlaylistBrief): PlaylistBrief {
  const out = { ...b };
  for (const k of NUMERIC_10) out[k] = clamp10(Number(out[k]) || 5);
  out.durationMin = Math.round(clamp(Number(out.durationMin) || 60, 10, 600));
  out.discovery = Math.round(clamp(Number(out.discovery) || 0, 0, 100));
  out.peakPosition = clamp(Number(out.peakPosition) || 0.7, 0.05, 0.95);
  if (out.turkishShare !== null) out.turkishShare = clamp(Number(out.turkishShare));
  if (out.eraFrom && out.eraTo && out.eraFrom > out.eraTo) [out.eraFrom, out.eraTo] = [out.eraTo, out.eraFrom];
  // A song can't be both required and banned: exclusion wins only if the user didn't also include it.
  out.exclude = {
    ...out.exclude,
    artists: out.exclude.artists.filter((a) => !out.include.artists.some((i) => i.toLowerCase() === a.toLowerCase())),
    trackIds: out.exclude.trackIds.filter((id) => !out.include.trackIds.includes(id)),
  };
  out.segments = (out.segments ?? []).filter((s) => s.endMin > s.startMin).slice(-6);
  out.genres = Array.from(new Set(out.genres));
  out.moods = Array.from(new Set(out.moods));
  return out;
}

/** How strongly a 1..10 target should pull: neutral values pull weakly unless set explicitly. */
export function pullWeight(brief: PlaylistBrief, field: string, value: number): number {
  const dev = Math.abs(value - 5.5) / 4.5;
  const explicit = brief.explicitFields?.includes(field);
  return explicit ? 0.5 + 0.5 * dev : 0.15 + 0.85 * dev;
}
