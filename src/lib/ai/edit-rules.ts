/**
 * Natural-language editing ("İlk 30 dakika biraz daha sakin olsun",
 * "Tarkan kalsın ama Sezen Aksu olmasın", "Bunun %30 daha nostaljik versiyonu").
 * Produces a brief patch; the engine regenerates while keeping fitting tracks.
 */
import type { PlaylistBrief, SegmentOverride } from "../types";
import { presetPatch, type MakeItPreset } from "../engine/presets";
import { clamp10 } from "../engine/util";
import { parseIntentRules } from "./intent-rules";
import { find, fold, has } from "./text";

export interface EditPlan {
  patch: Partial<PlaylistBrief>;
  /** Track ids to drop (and replace by role). */
  removeTrackIds: string[];
  reseed: boolean;
  /** Short list of what we understood, for the reply. */
  notes: string[];
  understood: boolean;
}

const PRESET_WORDS: { preset: MakeItPreset; terms: string[] }[] = [
  { preset: "more_energetic", terms: ["daha enerjik", "daha hareketli", "more energetic", "more upbeat", "daha cos", "daha canli", "hizlandir", "gaz ver"] },
  { preset: "more_chill", terms: ["daha sakin", "daha chill", "more chill", "calmer", "daha yumusak", "sakinlestir", "yavaslat"] },
  { preset: "more_nostalgic", terms: ["daha nostaljik", "more nostalgic", "daha eski"] },
  { preset: "more_modern", terms: ["daha modern", "more modern", "daha yeni", "daha guncel", "modernlestir"] },
  { preset: "more_mainstream", terms: ["daha bilinen", "daha populer", "more mainstream", "more popular", "daha tanidik"] },
  { preset: "more_surprising", terms: ["daha sasirtici", "more surprising", "beni sasirt", "daha az bilinen", "surprise me"] },
  { preset: "more_turkish", terms: ["daha turkce", "daha cok turkce", "more turkish"] },
  { preset: "more_danceable", terms: ["daha dans", "more danceable", "daha oynak"] },
];

export function planEdit(raw: string, brief: PlaylistBrief, trackTitles: { id: string; title: string; artist: string }[]): EditPlan {
  const text = fold(raw);
  const notes: string[] = [];
  let patch: Partial<PlaylistBrief> = {};
  const removeTrackIds: string[] = [];
  let reseed = false;

  // Intensity: "%30 daha", "çok daha", "biraz"
  const pct = /%\s*(\d{1,3})|(\d{1,3})\s*%/.exec(text);
  let intensity = 1;
  if (pct) intensity = Math.max(0.3, Math.min(3, parseInt(pct[1] ?? pct[2], 10) / 25));
  else if (has(text, ["cok daha", "much more", "way more", "epey"])) intensity = 2;
  else if (has(text, ["biraz", "a bit", "slightly", "a little", "hafif"])) intensity = 0.6;

  // Relative presets
  for (const { preset, terms } of PRESET_WORDS) {
    if (has(text, terms)) {
      // Segment-scoped edits ("ilk 30 dakika daha sakin") are handled below, not as global presets.
      if (/(ilk|son|first|last)\s+(\d+|yarim)/.test(text) && (preset === "more_chill" || preset === "more_energetic")) continue;
      patch = { ...patch, ...presetPatch({ ...brief, ...patch }, preset, intensity) };
      notes.push(preset);
    }
  }
  if (pct && has(text, ["nostalji"])) {
    patch.nostalgia = clamp10(brief.nostalgia * (1 + parseInt(pct[1] ?? pct[2], 10) / 100) + 0.5);
  }
  if (has(text, ["daha az turkce", "daha cok yabanci", "less turkish", "more international"])) {
    patch.turkishShare = Math.max(0, (brief.turkishShare ?? 0.7) - 0.25 * intensity);
    patch.languageStrict = false;
    notes.push("less_turkish");
  }

  // "Biraz daha 2000'ler" → lean the era window
  const dec = /(?:^|\s)(?:19)?([5-9]0|2000|2010|2020|00)\s*(?:lar|ler|s)\b/.exec(text);
  if (dec && has(text, ["daha", "more"])) {
    const d = dec[1] === "00" ? 2000 : dec[1].length === 2 ? 1900 + +dec[1] : +dec[1];
    const from = brief.eraFrom ?? d - 10, to = brief.eraTo ?? d + 9;
    patch.eraFrom = Math.min(from, d);
    patch.eraTo = Math.max(to, d + (intensity < 1 ? 5 : 9));
    patch.eraStrict = false;
    notes.push(`era→${d}s`);
  }

  // Segment edits
  const segs = detectRelativeSegments(text, brief.durationMin);
  if (segs.length) {
    const kept = brief.segments.filter((s) => !segs.some((n) => n.startMin < s.endMin && n.endMin > s.startMin));
    patch.segments = [...kept, ...segs];
    notes.push("segment");
  }

  // Absolute statements reuse the intent parser (duration, artists, genres, exclusions…)
  const abs = parseIntentRules(raw).patch;
  for (const k of ["durationMin", "durationStrict", "turkishShare", "languageStrict", "eraFrom", "eraTo", "eraStrict", "flow", "mode", "explicit", "artistRepetition", "singalong"] as const) {
    if (abs.explicitFields?.includes(k) && abs[k] !== undefined && !(k in patch)) (patch as Record<string, unknown>)[k] = abs[k];
  }
  if (abs.genres?.length && !has(text, ["daha az", "less"])) { patch.genres = [...new Set([...brief.genres, ...abs.genres])]; notes.push("genres"); }
  if (abs.include) { patch.include = abs.include; notes.push("include"); }
  if (abs.exclude) {
    patch.exclude = abs.exclude;
    removeTrackIds.push(...abs.exclude.trackIds);
    notes.push("exclude");
  }
  if (abs.focusArtists?.length) { patch.focusArtists = [...new Set([...brief.focusArtists, ...abs.focusArtists])]; notes.push("focus"); }
  if (abs.avoidTags?.length) patch.avoidTags = [...new Set([...brief.avoidTags, ...abs.avoidTags])];
  if (abs.avoidGenres?.length) patch.avoidGenres = [...new Set([...brief.avoidGenres, ...abs.avoidGenres])];

  // "X'i çıkar" for titles currently in the playlist (any length, since the user is pointing at the list)
  for (const t of trackTitles) {
    const ft = fold(t.title).replace(/[^a-z0-9 ]/g, "").trim();
    if (ft.length < 3) continue;
    const idx = find(text, ft);
    if (idx >= 0 && has(text.slice(idx + ft.length, idx + ft.length + 25), ["cikar", "sil", "olmasin", "istemiyorum", "remove", "kaldir", "at"])) {
      removeTrackIds.push(t.id);
      patch.exclude = { ...(patch.exclude ?? { artists: [], trackIds: [], trackNames: [], genres: [], tags: [] }), trackIds: [...(patch.exclude?.trackIds ?? []), t.id] };
      notes.push("remove");
    }
  }

  if (has(text, ["bastan", "yeniden", "tamamen farkli", "start over", "regenerate", "baska bir versiyon", "another version", "karistir"])) {
    reseed = true;
    notes.push("reseed");
  }
  const understood = notes.length > 0 || Object.keys(patch).length > 0;
  return { patch, removeTrackIds: [...new Set(removeTrackIds)], reseed, notes, understood };
}

function detectRelativeSegments(text: string, durationMin: number): SegmentOverride[] {
  const out: SegmentOverride[] = [];
  const re = /(ilk|son|first|last)\s+(\d+|yarim)\s*(saat|dakika|dk|min\w*|hours?)?[^.]*?(biraz\s+)?(daha\s+|more\s+)?(sakin|yavas|calm|chill|soft|hareketli|enerjik|energetic|cos\w*|patla\w*|upbeat)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = m[2] === "yarim" ? 30 : +m[2];
    if (m[3] && /saat|hour/.test(m[3]) && n < 10) n *= 60;
    const calm = /sakin|yavas|calm|chill|soft/.test(m[6]);
    const mag = m[4] ? 1.5 : 2.5;
    const delta = calm ? -mag : mag;
    const isFirst = m[1] === "ilk" || m[1] === "first";
    out.push(isFirst ? { startMin: 0, endMin: Math.min(n, durationMin), delta, label: calm ? "calmer start" : "hot start" } : { startMin: Math.max(0, durationMin - n), endMin: durationMin, delta, label: calm ? "soft landing" : "explosive finish" });
  }
  // "ortası daha sakin"
  if (/(orta|middle)\S*\s[^.]*(sakin|calm|chill)/.test(text)) out.push({ startMin: Math.round(durationMin * 0.4), endMin: Math.round(durationMin * 0.6), delta: -2, label: "breather" });
  return out;
}
