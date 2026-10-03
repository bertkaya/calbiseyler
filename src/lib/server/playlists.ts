/**
 * Application service: orchestrates intent → engine → persistence → taste.
 * API routes stay thin and call these functions.
 */
import type { MusicTrack, PlaylistBrief, Question } from "../types";
import { allSeedTracks, slugify } from "../catalog";
import { applyPatch, defaultBrief } from "../engine/brief";
import type { EngineContext } from "../engine/context";
import { generatePlaylist, type GenerateResult } from "../engine/generate";
import { findReplacement, relink, type ReplaceReason } from "../engine/replace";
import { computeDNA, computeStats } from "../engine/dna";
import { assignRoles } from "../engine/roles";
import { interpretBrief, explainPlaylist } from "../engine/explain";
import { makeTitle } from "../engine/titles";
import { energyAt } from "../engine/flow";
import { presetPatch, type MakeItPreset } from "../engine/presets";
import { passesFilters } from "../engine/scoring";
import { understand, briefSummary, hashSeed } from "../ai/intent";
import { planEdit } from "../ai/edit-rules";
import { llmCurate, llmEnabled, llmInterpretEdit, llmMode } from "../ai/llm";
import { mergeLlm } from "../ai/intent";
import { parseIntentRules } from "../ai/intent-rules";
import { applyFeedback, journalSignals, noteSeenArtists, toSignals, type FeedbackKind } from "../taste/model";
import { themeDefaults } from "../taste/theme";
import * as repo from "./repo";
import type { StoredPlaylist } from "./repo";
import { randomId } from "./crypto";
import { CURRENT_YEAR } from "../engine/features";
import { enrichTracks } from "../enrich/enrich";

export interface HydratedPlaylist extends StoredPlaylist {
  items: (StoredPlaylist["tracks"][number] & { track: MusicTrack })[];
  feedback?: Record<string, string>;
}

export function hydrate(p: StoredPlaylist, userId?: string): HydratedPlaylist {
  const items = p.tracks.map((t) => ({ ...t, track: repo.getTrack(t.trackId) })).filter((x): x is HydratedPlaylist["items"][number] => !!x.track);
  return { ...p, items, feedback: userId ? repo.feedbackForPlaylist(userId, p.id) : undefined };
}

function pool(): MusicTrack[] {
  const dyn = repo.dynamicTracks();
  const seen = new Set<string>();
  return [...allSeedTracks(), ...dyn].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

export function buildContext(userId: string, brief: PlaylistBrief, extra: Partial<EngineContext> = {}): EngineContext {
  const taste = toSignals(repo.getTaste(userId));
  const referenceTracks = brief.referenceTrackIds.length ? repo.getTracks(brief.referenceTrackIds) : undefined;
  return { pool: pool(), taste, referenceTracks, ...extra };
}

/** Theme + learned biases fill only what the user didn't specify. */
function withUserDefaults(userId: string, brief: PlaylistBrief): PlaylistBrief {
  const explicit = new Set(brief.explicitFields ?? []);
  const patch: Partial<PlaylistBrief> = {};
  const theme = themeDefaults(repo.getTheme(userId));
  for (const [k, v] of Object.entries(theme)) if (!explicit.has(k)) (patch as Record<string, unknown>)[k] = v;
  const taste = repo.getTaste(userId);
  if (!explicit.has("energy") && taste.energyBias) patch.energy = brief.energy + Math.max(-1, Math.min(1, taste.energyBias));
  if (!explicit.has("discovery") && taste.discoveryBias) patch.discovery = brief.discovery + taste.discoveryBias;
  return Object.keys(patch).length ? applyPatch(brief, patch, false) : brief;
}

/** LLM curator: only when the local pool is thin for this brief (AI cost control). */
async function maybeCurate(brief: PlaylistBrief, ctx: EngineContext): Promise<number> {
  if (!llmEnabled() || process.env.SOMMELIER_LLM_CURATE === "0") return 0;
  const eligible = ctx.pool.filter((t) => passesFilters(t, brief, ctx.taste));
  const sec = eligible.reduce((s, t) => s + t.durationSec, 0);
  if (sec >= brief.durationMin * 60 * 2.2) return 0;
  const res = await llmCurate(briefSummary(brief), ctx.pool.map((t) => `${t.artist} - ${t.title}`), 30);
  if (!res) return 0;
  const added: MusicTrack[] = [];
  for (const s of res.tracks) {
    const id = `ai:${slugify(s.artist)}--${slugify(s.title)}`;
    if (ctx.pool.some((t) => t.id === id || (slugify(t.title) === slugify(s.title) && slugify(t.artist) === slugify(s.artist)))) continue;
    const c = (x: number) => Math.max(0, Math.min(1, x));
    const t: MusicTrack = {
      id, title: s.title, artist: s.artist, year: s.year ?? undefined, durationSec: Math.round(s.durationSec ?? 225),
      language: s.language || "en", genres: s.genres.length ? (s.genres as MusicTrack["genres"]) : ["pop"],
      tags: s.tags as MusicTrack["tags"], explicit: s.explicit, source: "ai", estimated: true,
      features: { energy: c(s.energy), danceability: c(s.danceability), valence: c(s.valence), popularity: c(s.popularity), bpm: s.bpm ?? undefined },
    };
    added.push(t);
  }
  // Replace LLM estimates with measured features where we can (time-boxed).
  const { tracks: enriched } = await enrichTracks(added, { budgetMs: Number(process.env.ENRICH_BUDGET_MS || 6000) }).catch(() => ({ tracks: added }));
  for (const t of enriched) {
    repo.upsertTrack(t);
    ctx.pool.push(t);
  }
  return enriched.length;
}

function persistGenerated(id: string, userId: string, prompt: string, interpretation: string, g: GenerateResult, prev?: StoredPlaylist): StoredPlaylist {
  return repo.savePlaylist({
    id,
    userId,
    title: prev?.title && prev.brief.title ? prev.title : makeTitle(g.brief),
    prompt,
    brief: g.brief,
    interpretation,
    explanation: g.explanation,
    dna: g.dna,
    stats: g.stats,
    flowTarget: g.flowTarget,
    suggestions: g.suggestions,
    warnings: g.warnings,
    saved: prev?.saved ?? false,
    shareId: prev?.shareId ?? null,
    parentId: prev?.parentId ?? null,
    tracks: g.tracks,
    createdAt: prev?.createdAt,
  });
}

function learn(userId: string, fn: (t: ReturnType<typeof repo.getTaste>) => ReturnType<typeof repo.getTaste>) {
  const user = repo.getUser(userId);
  if (user?.learningPaused) return;
  repo.saveTaste(userId, fn(repo.getTaste(userId)));
}

// ── Create ─────────────────────────────────────────────────────
export interface CreateInput {
  prompt: string;
  overrides?: Partial<PlaylistBrief>;
  answers?: Partial<PlaylistBrief>[];
  skipQuestions?: boolean;
  referencePlaylistIds?: string[];
  expert?: boolean;
  /** UI language — used for sommelier copy when the prompt itself carries no language (chips only). */
  uiLang?: "tr" | "en";
}

export type CreateOutput =
  | { status: "needs_input"; brief: PlaylistBrief; interpretation: string; questions: Question[]; detected: string[] }
  | { status: "created"; playlist: HydratedPlaylist; usedLlm: boolean; curated: number };

export async function createPlaylist(userId: string, input: CreateInput): Promise<CreateOutput> {
  const prompt = (input.prompt ?? "").slice(0, 2000);
  const intent = await understand(prompt || "1 saatlik iyi müzik", { overrides: input.overrides });
  let brief = withUserDefaults(userId, intent.brief);
  if (!prompt.trim() && input.uiLang) brief = { ...brief, lang: input.uiLang };
  for (const a of input.answers ?? []) brief = applyPatch(brief, a);

  if (input.referencePlaylistIds?.length) {
    const refIds = input.referencePlaylistIds.flatMap((id) => repo.getPlaylist(id)?.tracks.map((t) => t.trackId) ?? []);
    brief = { ...brief, referenceTrackIds: [...new Set(refIds)] };
  }
  if (!input.skipQuestions && !input.answers?.length && !input.expert && intent.questions.length) {
    return { status: "needs_input", brief, interpretation: interpretBrief(brief), questions: intent.questions, detected: intent.detected };
  }
  const ctx = buildContext(userId, brief);
  const curated = await maybeCurate(brief, ctx);
  const g = generatePlaylist(brief, ctx);
  const id = `pl_${randomId(8)}`;
  const saved = persistGenerated(id, userId, prompt, interpretBrief(brief), g);
  repo.logSession(id, "create", prompt, interpretBrief(brief), null);
  learn(userId, (t) => noteSeenArtists(t, g.trackObjects));
  return { status: "created", playlist: hydrate(saved, userId), usedLlm: intent.usedLlm, curated };
}

/** Preview the brief only (Expert mode / brief card) without generating. */
export async function previewBrief(userId: string, prompt: string, overrides?: Partial<PlaylistBrief>) {
  const intent = await understand(prompt, { overrides, useLlm: false });
  const brief = withUserDefaults(userId, intent.brief);
  return { brief, interpretation: interpretBrief(brief), questions: intent.questions, detected: intent.detected, title: makeTitle(brief) };
}

// ── Regenerate while preserving ────────────────────────────────
export interface ChangeResult {
  playlist: HydratedPlaylist;
  message: string;
  diff: { kept: number; added: number; removed: number };
}

function ownedPlaylist(userId: string, id: string): StoredPlaylist {
  const p = repo.getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  return p;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function regenerate(userId: string, p: StoredPlaylist, patch: Partial<PlaylistBrief>, opts: { kind: string; input: string; reseed?: boolean; keepBonus?: number; dropIds?: string[] }): ChangeResult {
  let brief = applyPatch(p.brief, patch);
  if (opts.reseed) brief = { ...brief, seed: (brief.seed + 7919) % 100000 };
  const keep = new Set(p.tracks.map((t) => t.trackId).filter((id) => !opts.dropIds?.includes(id)));
  const ctx = buildContext(userId, brief, { keepTrackIds: opts.reseed ? undefined : keep, keepBonus: opts.keepBonus ?? 0.22 });
  const g = generatePlaylist(brief, ctx);
  const newIds = new Set(g.tracks.map((t) => t.trackId));
  const oldIds = new Set(p.tracks.map((t) => t.trackId));
  const diff = {
    kept: [...newIds].filter((x) => oldIds.has(x)).length,
    added: [...newIds].filter((x) => !oldIds.has(x)).length,
    removed: [...oldIds].filter((x) => !newIds.has(x)).length,
  };
  repo.logSession(p.id, opts.kind, opts.input, `${diff.kept}/${diff.added}/${diff.removed}`, p);
  const saved = persistGenerated(p.id, userId, p.prompt, interpretBrief(brief), g, p);
  learn(userId, (t) => noteSeenArtists(t, g.trackObjects));
  return { playlist: hydrate(saved, userId), message: "", diff };
}

function diffText(lang: "tr" | "en", d: ChangeResult["diff"]): string {
  return lang === "en"
    ? `Kept ${d.kept} tracks, swapped in ${d.added}.`
    : `${d.kept} şarkıyı korudum, ${d.added} yeni şarkı ekledim.`;
}

export function updateBrief(userId: string, id: string, patch: Partial<PlaylistBrief>): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const r = regenerate(userId, p, patch, { kind: "brief", input: JSON.stringify(patch) });
  r.message = diffText(p.brief.lang, r.diff);
  return r;
}

export function applyMakeIt(userId: string, id: string, preset: MakeItPreset): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const r = regenerate(userId, p, presetPatch(p.brief, preset), { kind: "preset", input: preset, keepBonus: 0.06 });
  r.message = diffText(p.brief.lang, r.diff);
  return r;
}

export async function editWithText(userId: string, id: string, text: string): Promise<ChangeResult> {
  const p = ownedPlaylist(userId, id);
  const tracks = repo.getTracks(p.tracks.map((t) => t.trackId));
  const plan = planEdit(text, p.brief, tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist })));
  const lang = p.brief.lang;
  let patch = plan.patch;
  let reply = "";
  let drop = plan.removeTrackIds;
  if (llmEnabled() && (!plan.understood || (llmMode() === "always" && text.trim().split(/\s+/).length >= 4))) {
    const list = tracks.map((t, i) => `${i + 1}. ${t.artist} – ${t.title} (${t.year ?? "?"})`).join("\n");
    const llm = await llmInterpretEdit(text, briefSummary(p.brief), list);
    if (llm?.understood) {
      const merged = mergeLlm(p.brief, { ...emptyLlm(), ...llm.brief } as Parameters<typeof mergeLlm>[1], parseIntentRules(""));
      // Rules win on what they parsed explicitly (catalog artists/titles, segments); LLM fills the rest.
      patch = { ...diffBrief(p.brief, merged), ...plan.patch };
      drop = [...new Set([...plan.removeTrackIds, ...llm.removeTrackNumbers.map((n) => tracks[n - 1]?.id).filter((x): x is string => !!x)])];
      if (drop.length) patch.exclude = { ...merged.exclude, trackIds: [...merged.exclude.trackIds, ...drop] };
      reply = llm.reply;
    }
  }
  if (!Object.keys(patch).length && !drop.length && !plan.reseed) {
    return {
      playlist: hydrate(p, userId),
      diff: { kept: p.tracks.length, added: 0, removed: 0 },
      message: lang === "en"
        ? "I didn't quite catch that. Try e.g. “first 30 minutes calmer”, “more 2000s”, “no Sezen Aksu”."
        : "Tam anlayamadım. Örneğin “ilk 30 dakika daha sakin”, “biraz daha 2000'ler”, “Sezen Aksu olmasın” diyebilirsin.",
    };
  }
  const r = regenerate(userId, p, patch, { kind: "edit", input: text, reseed: plan.reseed, dropIds: drop, keepBonus: 0.25 });
  for (const tid of drop) {
    const t = repo.getTrack(tid);
    if (t) learn(userId, (x) => applyFeedback(x, "remove", t));
  }
  r.message = reply || `${editAck(lang, plan.notes)} ${diffText(lang, r.diff)}`.trim();
  return r;
}

function emptyLlm() {
  return {
    durationMin: null, durationStrict: false, turkishShare: null, languageStrict: false, genres: [], excludeGenres: [], avoidGenres: [], moods: [],
    activity: null, eraFrom: null, eraTo: null, eraStrict: false, energy: null, danceability: null, valence: null, nostalgia: null, popularity: null,
    discovery: null, flow: null, peakPosition: null, segments: [], explicit: null, shuffle: null, singalong: false, includeArtists: [], excludeArtists: [],
    focusArtists: [], includeTracks: [], excludeTracks: [], avoidTags: [], excludeTags: [], title: null,
  };
}

function diffBrief(a: PlaylistBrief, b: PlaylistBrief): Partial<PlaylistBrief> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b) as (keyof PlaylistBrief)[]) {
    if (k === "explicitFields" || k === "seed") continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  }
  return out as Partial<PlaylistBrief>;
}

function editAck(lang: "tr" | "en", notes: string[]): string {
  const tr: Record<string, string> = {
    segment: "Akışın o bölümünü yeniden tasarladım.", more_energetic: "Enerjiyi yükselttim.", more_chill: "Tempoyu yumuşattım.",
    more_nostalgic: "Nostaljiyi artırdım.", more_modern: "Daha güncel şarkılara kaydırdım.", more_mainstream: "Daha bilinen şarkılara yöneldim.",
    more_surprising: "Biraz keşif ekledim.", more_turkish: "Türkçe oranını artırdım.", more_danceable: "Dans edilebilirliği artırdım.",
    include: "İstediklerini ekledim.", exclude: "İstemediklerini çıkardım.", remove: "O şarkıyı çıkarıp aynı rolde bir alternatif koydum.",
    focus: "O sanatçıya daha çok yer verdim.", reseed: "Farklı bir versiyon hazırladım.", genres: "Türleri güncelledim.", less_turkish: "Yabancı oranını artırdım.",
  };
  const en: Record<string, string> = {
    segment: "Redesigned that part of the flow.", more_energetic: "Turned the energy up.", more_chill: "Softened the pace.",
    more_nostalgic: "Dialled up nostalgia.", more_modern: "Shifted toward newer songs.", more_mainstream: "Leaned more mainstream.",
    more_surprising: "Added some discovery.", more_turkish: "More Turkish tracks.", more_danceable: "More danceable.",
    include: "Added what you asked for.", exclude: "Removed what you didn't want.", remove: "Removed it and found a same-role alternative.",
    focus: "Gave that artist more room.", reseed: "Made a fresh version.", genres: "Updated genres.", less_turkish: "More international tracks.",
  };
  const dict = lang === "en" ? en : tr;
  const msgs = [...new Set(notes.map((n) => (n.startsWith("era→") ? (lang === "en" ? `Leaned toward the ${n.slice(4)}.` : `${n.slice(4).replace("s", "'ler")} tarafına kaydırdım.`) : dict[n])).filter(Boolean))];
  return msgs.join(" ") || (lang === "en" ? "Done." : "Tamam.");
}

// ── Track-level operations ─────────────────────────────────────
function rebuildDerived(p: StoredPlaylist, tracks: MusicTrack[], pts: StoredPlaylist["tracks"], userId: string): StoredPlaylist {
  const roles = assignRoles(tracks, p.brief);
  const linked = relink(pts.map((t, i) => ({ ...t, role: pts[i].role ?? roles[i] })), tracks);
  return repo.savePlaylist({
    ...p,
    tracks: linked,
    dna: computeDNA(tracks, toSignals(repo.getTaste(userId))),
    stats: computeStats(tracks),
    explanation: explainPlaylist(p.brief, tracks, linked.map((t) => t.role)),
  });
}

export function replaceTrack(userId: string, id: string, position: number, reason: ReplaceReason = "replace", choiceId?: string): ChangeResult & { replacedWith?: MusicTrack } {
  const p = ownedPlaylist(userId, id);
  const tracks = repo.getTracks(p.tracks.map((t) => t.trackId));
  const old = tracks[position];
  if (!old) throw new HttpError(400, "Invalid position");
  const ctx = buildContext(userId, p.brief);
  let pick: MusicTrack | undefined;
  let message = "";
  if (choiceId) {
    pick = repo.getTrack(choiceId);
    message = p.brief.lang === "en" ? `Swapped in "${pick?.title}".` : `"${pick?.title}" geldi.`;
  } else {
    const r = findReplacement(p.brief, tracks, position, p.tracks[position].role, ctx, reason);
    if (r) { pick = r.track; message = r.message; }
  }
  if (!pick) return { playlist: hydrate(p, userId), message: p.brief.lang === "en" ? "No good alternative found." : "Uygun bir alternatif bulamadım.", diff: { kept: p.tracks.length, added: 0, removed: 0 } };
  repo.logSession(p.id, "replace", `${position}:${reason}`, `${old.id}→${pick.id}`, p);
  const newTracks = tracks.slice();
  newTracks[position] = pick;
  const pts = p.tracks.slice();
  pts[position] = { ...pts[position], trackId: pick.id, locked: false };
  // Removing for good: exclude from future regenerations of this playlist.
  let brief = p.brief;
  if (reason !== "replace" && reason !== "unavailable") brief = applyPatch(p.brief, { exclude: { artists: [], trackIds: [old.id], trackNames: [], genres: [], tags: [] } }, false);
  const saved = rebuildDerived({ ...p, brief }, newTracks, pts, userId);
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  const before = tracks.slice(0, position).reduce((s, t) => s + t.durationSec, 0);
  const targetEnergy = energyAt(p.brief, (before + old.durationSec / 2) / Math.max(1, total));
  if (reason !== "unavailable") learn(userId, (t) => applyFeedback(t, reason === "dislike" ? "dislike" : reason === "never" ? "never" : reason === "remove" ? "remove" : "replace", old, { targetEnergy }));
  return { playlist: hydrate(saved, userId), message, diff: { kept: p.tracks.length - 1, added: 1, removed: 1 }, replacedWith: pick };
}

export function alternativesFor(userId: string, id: string, position: number): MusicTrack[] {
  const p = ownedPlaylist(userId, id);
  const tracks = repo.getTracks(p.tracks.map((t) => t.trackId));
  const r = findReplacement(p.brief, tracks, position, p.tracks[position]?.role ?? "warmup", buildContext(userId, p.brief), "replace");
  return r ? [r.track, ...r.alternatives] : [];
}

export function giveFeedback(userId: string, id: string, position: number, kind: "like" | "love" | "dislike" | "never"): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const pt = p.tracks[position];
  const track = pt ? repo.getTrack(pt.trackId) : undefined;
  if (!track) throw new HttpError(400, "Invalid position");
  repo.addFeedback(userId, id, track.id, track.artist, kind, { role: pt.role });
  if (kind === "dislike" || kind === "never") {
    // replaceTrack also records the taste signal.
    return replaceTrack(userId, id, position, kind);
  }
  learn(userId, (t) => applyFeedback(t, kind as FeedbackKind, track));
  const lang = p.brief.lang;
  return {
    playlist: hydrate(p, userId),
    diff: { kept: p.tracks.length, added: 0, removed: 0 },
    message: kind === "love" ? (lang === "en" ? "Noted — more like this in the future." : "Not ettim — ileride bunun gibilerini daha çok koyacağım.") : lang === "en" ? "Thanks!" : "Teşekkürler!",
  };
}

export function removeTrack(userId: string, id: string, position: number, withReplacement = true): ChangeResult {
  if (withReplacement) return replaceTrack(userId, id, position, "remove");
  const p = ownedPlaylist(userId, id);
  const tracks = repo.getTracks(p.tracks.map((t) => t.trackId));
  const old = tracks[position];
  repo.logSession(p.id, "remove", String(position), old?.id ?? "", p);
  const newTracks = tracks.filter((_, i) => i !== position);
  const pts = p.tracks.filter((_, i) => i !== position);
  const brief = old ? applyPatch(p.brief, { exclude: { artists: [], trackIds: [old.id], trackNames: [], genres: [], tags: [] } }, false) : p.brief;
  const saved = rebuildDerived({ ...p, brief }, newTracks, pts, userId);
  if (old) learn(userId, (t) => applyFeedback(t, "remove", old));
  return { playlist: hydrate(saved, userId), message: "", diff: { kept: pts.length, added: 0, removed: 1 } };
}

export function moveTrack(userId: string, id: string, from: number, to: number): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const pts = p.tracks.slice();
  const [m] = pts.splice(from, 1);
  pts.splice(Math.max(0, Math.min(pts.length, to)), 0, m);
  repo.logSession(p.id, "move", `${from}->${to}`, "", p);
  const saved = rebuildDerived(p, repo.getTracks(pts.map((t) => t.trackId)), pts, userId);
  return { playlist: hydrate(saved, userId), message: "", diff: { kept: pts.length, added: 0, removed: 0 } };
}

export function toggleLock(userId: string, id: string, position: number): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const pt = p.tracks[position];
  if (!pt) throw new HttpError(400, "Invalid position");
  const locked = !pt.locked;
  const include = { ...p.brief.include, trackIds: locked ? [...new Set([...p.brief.include.trackIds, pt.trackId])] : p.brief.include.trackIds.filter((x) => x !== pt.trackId) };
  const brief = { ...p.brief, include };
  const pts = p.tracks.map((t, i) => (i === position ? { ...t, locked } : t));
  const saved = repo.savePlaylist({ ...p, brief, tracks: pts });
  const t = repo.getTrack(pt.trackId);
  if (locked && t) learn(userId, (x) => applyFeedback(x, "include", t));
  return { playlist: hydrate(saved, userId), message: "", diff: { kept: pts.length, added: 0, removed: 0 } };
}

export function includeTrack(userId: string, id: string, trackId: string): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const t = repo.getTrack(trackId);
  if (!t) throw new HttpError(404, "Track not found");
  const r = regenerate(userId, p, { include: { artists: [], trackIds: [trackId], trackNames: [], genres: [], tags: [] } }, { kind: "include", input: trackId });
  learn(userId, (x) => applyFeedback(x, "include", t));
  r.message = p.brief.lang === "en" ? `"${t.title}" is in — placed where it fits the flow.` : `"${t.title}" eklendi — akışta en uygun yere yerleştirdim.`;
  return r;
}

export function setIncludeExclude(userId: string, id: string, which: "include" | "exclude", ie: StoredPlaylist["brief"]["include"]): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const patch = { [which]: { ...ie, replace: true } } as Partial<PlaylistBrief>;
  const r = regenerate(userId, p, patch, { kind: which, input: JSON.stringify(ie) });
  r.message = diffText(p.brief.lang, r.diff);
  return r;
}

export function acceptSuggestion(userId: string, id: string, suggestionId: string, accept: boolean): ChangeResult {
  const p = ownedPlaylist(userId, id);
  const s = p.suggestions.find((x) => x.id === suggestionId);
  if (!s) throw new HttpError(404, "Suggestion not found");
  if (!accept) {
    const saved = repo.savePlaylist({ ...p, suggestions: p.suggestions.filter((x) => x.id !== suggestionId) });
    return { playlist: hydrate(saved, userId), message: p.brief.lang === "en" ? "Keeping it as is." : "Olduğu gibi bırakıyorum.", diff: { kept: p.tracks.length, added: 0, removed: 0 } };
  }
  const r = regenerate(userId, p, s.acceptPatch, { kind: "suggestion", input: suggestionId });
  const saved = repo.savePlaylist({ ...repo.getPlaylist(id)!, suggestions: [] });
  r.playlist = hydrate(saved, userId);
  r.message = diffText(p.brief.lang, r.diff);
  return r;
}

export function undo(userId: string, id: string): HydratedPlaylist {
  const p = ownedPlaylist(userId, id);
  const snap = repo.popSnapshot(p.id);
  if (!snap) throw new HttpError(409, "Nothing to undo");
  const restored = repo.savePlaylist({ ...snap, id: p.id, userId, saved: p.saved, shareId: p.shareId });
  return hydrate(restored, userId);
}

export function duplicate(userId: string, id: string): HydratedPlaylist {
  const p = repo.getPlaylist(id);
  if (!p) throw new HttpError(404, "Playlist not found");
  const copy = repo.savePlaylist({ ...p, id: `pl_${randomId(8)}`, userId, title: `${p.title} (copy)`, saved: false, shareId: null, parentId: p.id, createdAt: undefined });
  return hydrate(copy, userId);
}

export function setSaved(userId: string, id: string, saved: boolean, title?: string): HydratedPlaylist {
  const p = ownedPlaylist(userId, id);
  const out = repo.savePlaylist({ ...p, saved, title: title?.trim() ? title.trim().slice(0, 120) : p.title, brief: title?.trim() ? { ...p.brief, title: title.trim().slice(0, 120) } : p.brief });
  if (saved) {
    const tracks = repo.getTracks(p.tracks.map((t) => t.trackId));
    learn(userId, (t) => tracks.reduce((acc, tr) => applyFeedback(acc, "keep", tr), t));
  }
  return hydrate(out, userId);
}

export function share(userId: string, id: string): string {
  const p = ownedPlaylist(userId, id);
  if (p.shareId) return p.shareId;
  const shareId = randomId(6);
  repo.savePlaylist({ ...p, shareId });
  return shareId;
}

export function addJournalEntry(userId: string, playlistId: string | null, text: string) {
  const sig = journalSignals(text);
  repo.addJournal(userId, playlistId, text.slice(0, 2000), sig);
  learn(userId, (t) => {
    const next = { ...t, energyBias: Math.max(-1.5, Math.min(1.5, t.energyBias + sig.energyBias)), discoveryBias: Math.max(-20, Math.min(30, t.discoveryBias + sig.discoveryBias)) };
    if (playlistId && (sig.positive || sig.negative)) {
      const p = repo.getPlaylist(playlistId);
      const tracks = p ? repo.getTracks(p.tracks.map((x) => x.trackId)) : [];
      return tracks.reduce((acc, tr) => applyFeedback(acc, sig.positive ? "keep" : "replace", tr), next);
    }
    return next;
  });
  return sig;
}

/** Import → analyse DNA → becomes a reference playlist. */
export async function importTracks(userId: string, name: string, items: { title: string; artist: string; durationSec?: number; isrc?: string }[]): Promise<HydratedPlaylist> {
  const seeds = allSeedTracks();
  const ids: string[] = [];
  const fresh: MusicTrack[] = [];
  for (const it of items.slice(0, 500)) {
    const match = seeds.find((t) => slugify(t.title) === slugify(it.title) && slugify(t.artist).includes(slugify(it.artist.split(/\s*[&,]\s*/)[0])));
    if (match) { ids.push(match.id); continue; }
    const id = `imp:${slugify(it.artist)}--${slugify(it.title)}`;
    const existing = repo.getTrack(id);
    if (!existing) {
      const rp = parseIntentRules(`${it.artist} ${it.title}`);
      const tr = /[çğıöşü]/i.test(`${it.title} ${it.artist}`);
      fresh.push({
        id, title: it.title, artist: it.artist, durationSec: it.durationSec ?? 225, language: tr ? "tr" : "en",
        genres: rp.patch.genres?.length ? rp.patch.genres : [tr ? "tr-pop" : "pop"], tags: [], explicit: false, source: "import", estimated: true,
        isrc: it.isrc, features: {},
      });
    }
    ids.push(id);
  }
  const { tracks: measured } = await enrichTracks(fresh, { budgetMs: Number(process.env.ENRICH_BUDGET_MS || 10000) }).catch(() => ({ tracks: fresh }));
  for (const t of measured) repo.upsertTrack(t);
  const tracks = repo.getTracks(ids);
  const brief = defaultImportBrief(tracks);
  const pts = tracks.map((t, i) => ({ trackId: t.id, position: i, role: "warmup" as const, transitionIn: null, locked: false }));
  const p = repo.savePlaylist({
    id: `pl_${randomId(8)}`, userId, title: name.slice(0, 120) || "Imported playlist", prompt: "import", brief, interpretation: "", explanation: "",
    dna: computeDNA(tracks), stats: computeStats(tracks), flowTarget: [], suggestions: [], warnings: tracks.some((t) => t.estimated) ? ["Some tracks are not in the Sommelier catalog — their features are estimated."] : [],
    saved: true, shareId: null, parentId: null, tracks: relink(pts.map((x, i) => ({ ...x, role: assignRoles(tracks, brief)[i] })), tracks),
  });
  return hydrate(p, userId);
}

function defaultImportBrief(tracks: MusicTrack[]): PlaylistBrief {
  const d = computeDNA(tracks);
  const years = tracks.map((t) => t.year).filter(Boolean) as number[];
  const base = applyPatch(
    defaultBrief(),
    {
      durationMin: Math.max(10, Math.round(tracks.reduce((s, t) => s + t.durationSec, 0) / 60)),
      energy: Math.max(1, d.energy / 10), danceability: Math.max(1, d.dance / 10), nostalgia: Math.max(1, d.nostalgia / 10),
      popularity: Math.max(1, d.mainstream / 10), turkishShare: d.turkish / 100, valence: Math.max(1, d.happiness / 10),
      eraFrom: years.length ? Math.min(...years) : null, eraTo: years.length ? Math.max(...years) : null,
    },
    false,
  );
  return { ...base, seed: hashSeed(tracks.map((t) => t.id).join()), lang: "tr", referenceTrackIds: tracks.map((t) => t.id) };
}

export function gamification(userId: string) {
  const now = Date.now();
  const week = now - 7 * 864e5, month = now - 30 * 864e5;
  const taste = repo.getTaste(userId);
  const newArtists = Object.values(taste.artistsSeen).filter((ts) => ts >= month).length;
  const fb = repo.feedbackSince(userId, month);
  const genreDelta: Record<string, number> = {};
  for (const f of fb) {
    if (!f.trackId || !["like", "love"].includes(f.kind)) continue;
    const t = repo.getTrack(f.trackId);
    for (const g of t?.genres ?? []) genreDelta[g] = (genreDelta[g] ?? 0) + 1;
  }
  const topNew = Object.entries(genreDelta).sort((a, b) => b[1] - a[1])[0];
  return {
    playlistsThisWeek: repo.playlistCountSince(userId, week),
    newArtistsThisMonth: newArtists,
    tasteExpansion: topNew ? { genre: topNew[0], likes: topNew[1] } : null,
    year: CURRENT_YEAR,
  };
}
