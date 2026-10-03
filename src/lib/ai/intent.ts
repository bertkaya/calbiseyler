/**
 * Intent orchestration: rules first (free, instant), LLM refinement when it
 * adds value (long / rich requests, leftovers), then normalisation + questions.
 */
import type { GenreId, PlaylistBrief, Question, TrackTag } from "../types";
import { CATALOG_ARTISTS, allSeedTracks, norm, searchTracks } from "../catalog";
import { applyPatch, defaultBrief, emptyIE } from "../engine/brief";
import { interpretBrief } from "../engine/explain";
import { parseIntentRules, type RuleParse } from "./intent-rules";
import { llmEnabled, llmParseIntent, type LlmBrief } from "./llm";
import { planQuestions } from "./questions";

export interface IntentResult {
  brief: PlaylistBrief;
  interpretation: string;
  questions: Question[];
  detected: string[];
  usedLlm: boolean;
}

export interface IntentOptions {
  base?: PlaylistBrief;
  overrides?: Partial<PlaylistBrief>;
  useLlm?: boolean;
}

/** Heuristic: is the request rich enough that an LLM would understand it better than rules? */
function wantsLlm(text: string, rp: RuleParse): boolean {
  const words = text.trim().split(/\s+/).length;
  const understood = rp.detected.length;
  return words >= 14 || (words >= 6 && understood <= 1);
}

export async function understand(text: string, opts: IntentOptions = {}): Promise<IntentResult> {
  const rp = parseIntentRules(text);
  let brief = applyPatch(opts.base ?? { ...defaultBrief(), lang: rp.lang }, rp.patch, false);
  brief.explicitFields = rp.patch.explicitFields ?? [];
  let usedLlm = false;

  if ((opts.useLlm ?? true) && llmEnabled() && wantsLlm(text, rp)) {
    const llm = await llmParseIntent(text);
    if (llm) {
      brief = mergeLlm(brief, llm, rp);
      usedLlm = true;
    }
  }
  if (opts.overrides && Object.keys(opts.overrides).length) brief = applyPatch(brief, opts.overrides);
  brief.seed = hashSeed(text);
  const questions = planQuestions(rp, brief);
  return { brief, interpretation: interpretBrief(brief), questions, detected: rp.detected, usedLlm };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function resolveArtist(name: string): string | null {
  const n = norm(name);
  return CATALOG_ARTISTS.find((a) => norm(a) === n) ?? CATALOG_ARTISTS.find((a) => norm(a).includes(n) || n.includes(norm(a))) ?? null;
}

function resolveTrack(title: string, artist: string): string | null {
  const hit = searchTracks(`${title} ${artist}`, allSeedTracks(), 1)[0];
  if (hit && norm(hit.title) === norm(title)) return hit.id;
  return null;
}

/** LLM fills gaps and refines; explicit rule matches (catalog artists/tracks) are kept. */
export function mergeLlm(brief: PlaylistBrief, llm: LlmBrief, rp: RuleParse): PlaylistBrief {
  const ruleSet = new Set(rp.patch.explicitFields ?? []);
  const patch: Partial<PlaylistBrief> = {};
  const scalar = <K extends keyof PlaylistBrief>(k: K, v: PlaylistBrief[K] | null | undefined) => {
    if (v === null || v === undefined) return;
    if (ruleSet.has(k as string) && k !== "energy") return; // rules win on what they explicitly parsed
    patch[k] = v;
  };
  scalar("durationMin", llm.durationMin ?? undefined);
  if (llm.durationStrict) patch.durationStrict = true;
  scalar("turkishShare", llm.turkishShare);
  if (llm.languageStrict && patch.turkishShare === 1) patch.languageStrict = true;
  scalar("activity", llm.activity);
  scalar("eraFrom", llm.eraFrom);
  scalar("eraTo", llm.eraTo);
  if (llm.eraFrom || llm.eraTo) scalar("eraStrict", llm.eraStrict);
  scalar("energy", llm.energy);
  scalar("danceability", llm.danceability);
  scalar("valence", llm.valence);
  scalar("nostalgia", llm.nostalgia);
  scalar("popularity", llm.popularity);
  scalar("discovery", llm.discovery);
  scalar("flow", llm.flow);
  scalar("peakPosition", llm.peakPosition);
  if (llm.explicit !== null) scalar("explicit", llm.explicit);
  if (llm.shuffle) patch.mode = "shuffle";
  if (llm.singalong) patch.singalong = true;
  if (llm.title) patch.title = llm.title;
  if (llm.genres.length) patch.genres = [...new Set([...brief.genres, ...(llm.genres as GenreId[])])];
  if (llm.moods.length) patch.moods = [...new Set([...brief.moods, ...llm.moods])];
  if (llm.segments.length && !brief.segments.length) patch.segments = llm.segments.map((s) => ({ ...s, delta: Math.max(-4, Math.min(4, s.delta)) }));
  if (llm.avoidGenres.length) patch.avoidGenres = [...new Set([...brief.avoidGenres, ...(llm.avoidGenres as GenreId[])])];
  if (llm.avoidTags.length) patch.avoidTags = [...new Set([...brief.avoidTags, ...(llm.avoidTags as TrackTag[])])];

  const inc = emptyIE(), exc = emptyIE();
  for (const a of llm.includeArtists) { const r = resolveArtist(a); if (r) inc.artists.push(r); }
  for (const a of llm.excludeArtists) { const r = resolveArtist(a); if (r) exc.artists.push(r); else exc.artists.push(a); }
  for (const t of llm.includeTracks) { const id = resolveTrack(t.title, t.artist); if (id) inc.trackIds.push(id); else inc.trackNames.push(`${t.title} — ${t.artist}`); }
  for (const t of llm.excludeTracks) { const id = resolveTrack(t.title, t.artist); if (id) exc.trackIds.push(id); }
  exc.genres = llm.excludeGenres as GenreId[];
  exc.tags = llm.excludeTags as TrackTag[];
  patch.include = inc;
  patch.exclude = exc;
  const focus = llm.focusArtists.map(resolveArtist).filter((x): x is string => !!x);
  if (focus.length) patch.focusArtists = [...new Set([...brief.focusArtists, ...focus])];
  const out = applyPatch(brief, patch, false);
  out.explicitFields = [...new Set([...(brief.explicitFields ?? []), ...Object.keys(patch).filter((k) => !["include", "exclude"].includes(k))])];
  return out;
}

/** Compact brief description for LLM prompts. */
export function briefSummary(b: PlaylistBrief): string {
  return JSON.stringify({
    durationMin: b.durationMin, turkishShare: b.turkishShare, genres: b.genres, moods: b.moods, activity: b.activity,
    era: [b.eraFrom, b.eraTo], eraStrict: b.eraStrict, energy: b.energy, danceability: b.danceability, valence: b.valence,
    nostalgia: b.nostalgia, popularity: b.popularity, discovery: b.discovery, flow: b.flow, segments: b.segments,
    explicit: b.explicit, mode: b.mode, include: b.include, exclude: b.exclude, focusArtists: b.focusArtists,
    avoidTags: b.avoidTags, avoidGenres: b.avoidGenres, singalong: b.singalong,
  });
}
