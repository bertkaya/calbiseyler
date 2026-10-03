/**
 * Deterministic Intent Parser (TR + EN). Always available, zero cost.
 * Turns "2 saatlik eller havaya eski Türkçe şarkılar" into a brief patch.
 * The LLM layer (llm.ts) may refine this, but never replaces catalog matches.
 */
import type { Activity, FlowShape, GenreId, Mood, PlaylistBrief, SegmentOverride, TrackTag } from "../types";
import { CATALOG_ARTISTS, allSeedTracks, norm } from "../catalog";
import { ACTIVITY_PROFILES } from "../engine/brief";
import { NUM_WORDS, allIndexes, detectLang, find, fold, has } from "./text";

export interface RuleParse {
  patch: Partial<PlaylistBrief>;
  lang: "tr" | "en";
  /** Human-readable list of what was understood (debug + UI chips). */
  detected: string[];
  /** Signals for the question planner. */
  signals: {
    hasDuration: boolean;
    hasEra: boolean;
    hasLanguage: boolean;
    hasGenre: boolean;
    hasMood: boolean;
    hasActivity: boolean;
    hasArtist: boolean;
    vagueNostalgia: boolean;
    surprise: boolean;
  };
  /** Words/phrases we could not map (LLM candidates). */
  leftovers: string[];
}

const NEG_AFTER = ["olmasin", "olmayan", "olmadan", "istemiyorum", "istemem", "haric", "yok", "degil", "cikar", "cikart", "atla", "olmayacak", "koyma", "calma"];
const NEG_BEFORE = ["no", "without", "except", "not", "hic", "minus", "sans"];
const SOFT = ["cok", "fazla", "asiri", "too", "very", "overly", "so"];
const INC_AFTER = ["kalsin", "olsun", "kesin", "mutlaka", "olmazsa olmaz", "ekle", "bulunsun", "koy", "girsin", "olacak"];
const INC_BEFORE = ["include", "with", "must", "plus"];
const FOCUS_AFTER = ["agirlikli", "agirlikta", "bol", "bolca", "agirligi", "dolu", "heavy", "cok olsun", "fazla olsun"];
const FOCUS_BEFORE = ["mostly", "lots of", "plenty of", "focus on", "bol bol", "daha fazla", "more"];
const STOP = new Set([",", ".", "ama", "fakat", "ancak", "ve", "but", "and", "however", "sonra", "then"]);

type Polarity = "exclude" | "avoid" | "include" | "focus" | "mention";

/** Classify a mention at `idx` by looking at nearby words (stops at conjunctions). */
function polarity(text: string, idx: number, len: number): Polarity {
  const afterWords: string[] = [];
  for (const w of text.slice(idx + len).split(/\s+/).filter(Boolean)) {
    const clean = w.replace(/[,.;:!?]+$/, "");
    if (STOP.has(clean) || STOP.has(w)) break;
    afterWords.push(clean);
    if (/[,.;:!?]$/.test(w) || afterWords.length >= 4) break;
  }
  const after = afterWords.join(" ");
  const beforeWords = text.slice(0, idx).split(/\s+/).filter(Boolean).slice(-3);
  const cut = beforeWords.findLastIndex((w) => STOP.has(w.replace(/[,.;:!?]+$/, "")) || /[,.;:!?]$/.test(w));
  const before = beforeWords.slice(cut + 1).join(" ");
  const neg = NEG_AFTER.some((n) => has(after, [n])) || NEG_BEFORE.some((n) => has(before, [n], false));
  if (neg) return SOFT.some((s) => has(before, [s], false) || has(after, [s], false)) ? "avoid" : "exclude";
  if (FOCUS_AFTER.some((f) => has(after, [f])) || FOCUS_BEFORE.some((f) => has(before, [f], false))) return "focus";
  if (INC_AFTER.some((f) => has(after, [f])) || INC_BEFORE.some((f) => has(before, [f], false))) return "include";
  return "mention";
}

const GENRE_TERMS: { terms: string[]; tr?: GenreId; intl?: GenreId; both?: GenreId[] }[] = [
  { terms: ["tsm", "sanat muzig", "turk sanat", "klasik turk", "fasil"], both: ["tsm"] },
  { terms: ["thm", "halk muzig", "turku", "turk halk", "folk"], both: ["thm"] },
  { terms: ["arabesk"], both: ["arabesk"] },
  { terms: ["fantezi"], both: ["fantezi"] },
  { terms: ["anadolu rock", "anatolian rock", "anadolu pop"], both: ["anatolian-rock"] },
  { terms: ["oyun havas", "roman havas", "gobek"], both: ["tr-dance", "fantezi"] },
  { terms: ["pop"], tr: "tr-pop", intl: "pop" },
  { terms: ["rock"], tr: "tr-rock", intl: "rock" },
  { terms: ["alternatif", "alternative", "indie"], tr: "tr-alt", intl: "indie" },
  { terms: ["rap", "hip hop", "hiphop", "hip-hop"], tr: "tr-rap", intl: "rnb-hiphop" },
  { terms: ["r&b", "rnb", "soul"], both: ["rnb-hiphop"] },
  { terms: ["caz", "jazz"], both: ["jazz"] },
  { terms: ["lounge", "chillout", "chill out", "downtempo"], both: ["lounge"] },
  { terms: ["elektronik", "electronic", "edm", "house", "techno"], both: ["electronic", "dance"] },
  { terms: ["dance", "dans muzig"], tr: "tr-dance", intl: "dance" },
  { terms: ["disko", "disco", "funk"], both: ["disco-funk"] },
  { terms: ["latin", "reggaeton", "salsa"], both: ["latin"] },
];

const MOOD_TERMS: Record<Mood, string[]> = {
  happy: ["mutlu", "neseli", "eglenceli", "happy", "cheerful", "keyifli", "pozitif", "positive", "feel good", "feel-good", "guzel enerji"],
  sad: ["huzunlu", "uzgun", "sad", "aglatan", "hazin"],
  chill: ["sakin", "rahat", "chill", "huzurlu", "relax", "dinlendirici", "yumusak", "soft", "mellow", "calm"],
  romantic: ["romantik", "romantic", "ask sarki", "love song"],
  energetic: ["enerjik", "hareketli", "cosku", "cossun", "hype", "energetic", "upbeat", "gaz", "ziplatan", "ritmik"],
  nostalgic: ["nostalji", "nostalgic", "nostalgia", "eski gunler", "eskiler", "retro"],
  melancholic: ["melankolik", "melancholic", "melancholy", "buruk", "hasret", "duygusal"],
  party: ["parti", "eller havaya", "party", "partiye", "cilgin"],
  focus: ["odak", "focus", "konsantr", "ders calis", "study", "deep work"],
  roadtrip: ["road trip", "roadtrip", "yolculuk", "yola"],
};

const ACTIVITY_TERMS: Record<Activity, string[]> = {
  raki: ["raki", "meyhane", "fasil gecesi"],
  wedding: ["dugun", "wedding", "nikah", "kina"],
  birthday: ["dogum gunu", "birthday", "dogumgunu"],
  dinner: ["yemek", "aksam yemeg", "dinner", "sofra", "brunch", "kahvalti"],
  party: ["parti", "party", "ev partisi", "eller havaya", "kutlama", "celebration", "misafir", "arkadaslar gel", "kisi gelecek", "kisi geleceg", "gelecegiz", "toplanacagiz", "friends over", "people coming", "guests"],
  driving: ["araba", "surus", "road trip", "roadtrip", "yolculuk", "driving", "drive", "otoban", "yola cik"],
  workout: ["spor", "antrenman", "kosu", "gym", "workout", "fitness", "kosarken", "running"],
  date: ["date", "sevgili", "bas basa", "romantik aksam", "date night"],
  background: ["arka plan", "background", "fon muzig", "fonda"],
  pregame: ["pre-game", "pregame", "hazirlanirken", "gece oncesi", "on parti", "getting ready"],
  beach: ["plaj", "beach", "deniz kenar", "havuz", "pool party"],
  work: ["ofis", "is yerinde", "work", "calisirken", "calisma", "coding", "kod yazarken"],
};

const TAG_TERMS: { terms: string[]; tag: TrackTag }[] = [
  { terms: ["slow", "yavas", "agir sarki", "agir parca"], tag: "slow" },
  { terms: ["cheesy", "kitsch", "kic", "bayagi", "kliseli", "cringe"], tag: "cheesy" },
  { terms: ["huzunlu", "sad", "aglatan"], tag: "sad" },
  { terms: ["enstrumantal", "instrumental", "sozsuz"], tag: "instrumental" },
];

/** Common words that collide with song titles (only match these titles when quoted). */
const TITLE_STOP = new Set(["happy", "summer", "perfect", "yellow", "dreams", "respect", "levels", "celebration", "sugar", "africa", "toxic", "umbrella", "yalan", "belki", "geceler", "hayde", "galiba", "firuze", "ateşe", "sigara", "zalim", "araba", "dudu", "yolla", "padisah", "nilufer", "suspus", "mihriban"]);

const SEED_TITLES = allSeedTracks().map((t) => ({ id: t.id, f: fold(t.title).replace(/[^a-z0-9 ]/g, "").trim(), artist: t.artist }));

export function parseIntentRules(raw: string, now = new Date().getFullYear()): RuleParse {
  const text = fold(raw);
  const lang = detectLang(raw);
  const patch: Partial<PlaylistBrief> = { lang };
  const detected: string[] = [];
  const explicit = new Set<string>();
  const set = <K extends keyof PlaylistBrief>(k: K, v: PlaylistBrief[K], label?: string) => {
    patch[k] = v;
    explicit.add(k as string);
    if (label) detected.push(label);
  };
  const include = { artists: [] as string[], trackIds: [] as string[], trackNames: [] as string[], genres: [] as GenreId[], tags: [] as TrackTag[] };
  const exclude = { artists: [] as string[], trackIds: [] as string[], trackNames: [] as string[], genres: [] as GenreId[], tags: [] as TrackTag[] };
  const avoidTags: TrackTag[] = [];
  const avoidGenres: GenreId[] = [];
  const focusArtists: string[] = [];
  const signals: RuleParse["signals"] = {
    hasDuration: false, hasEra: false, hasLanguage: false, hasGenre: false, hasMood: false,
    hasActivity: false, hasArtist: false, vagueNostalgia: false, surprise: false,
  };

  // ── Duration ────────────────────────────────────────────────
  let minutes = 0;
  const hourRe = /(\d+(?:[.,]\d+)?|bir|iki|uc|dort|bes|alti|yedi|sekiz|one|two|three|four|five|six|an|a)\s*(buçuk|bucuk)?\s*(?:\+\s*)?(?:saat|saatlik|sa\b|hours?|hrs?\b|h\b)/;
  const hm = hourRe.exec(text);
  if (hm) {
    const n = NUM_WORDS[hm[1]] ?? parseFloat(hm[1].replace(",", "."));
    minutes += (n + (hm[2] ? 0.5 : 0)) * 60;
  }
  const minRe = /(\d+)\s*(?:dakika|dakikalik|dk|min(?:ute)?s?|mins?)\b/;
  const mm = minRe.exec(text);
  if (mm && !/(ilk|son|first|last)\s+\d+\s*(dakika|dk|min)/.test(text.slice(Math.max(0, mm.index - 6), mm.index + mm[0].length))) minutes += parseInt(mm[1], 10);
  if (!minutes && has(text, ["yarim saat", "half an hour", "half hour"])) minutes = 30;
  if (!minutes && has(text, ["butun gece", "all night", "sabaha kadar"])) minutes = 300;
  if (minutes) {
    set("durationMin", Math.round(minutes), `⏱ ${Math.round(minutes)} min`);
    signals.hasDuration = true;
    if (has(text, ["tam ", "exactly", "tam olarak", "precisely"])) set("durationStrict", true);
  }

  // ── Language ────────────────────────────────────────────────
  const pctM = /%\s*(\d{1,3})\s*(?:turkce|turkish)|(\d{1,3})\s*%\s*(?:turkce|turkish)/.exec(text);
  const saysTr = has(text, ["turkce", "turkish", "turk sark", "yerli"]);
  const saysForeign = has(text, ["yabanci", "ingilizce", "english", "international", "foreign", "global"]);
  const mixed = has(text, ["karisik", "karma", "mixed", "mix", "yari yariya", "half"]);
  const mostly = has(text, ["agirlikli", "cogunlukla", "mostly", "genelde", "agirlikta"]);
  if (pctM) {
    set("turkishShare", parseInt(pctM[1] ?? pctM[2], 10) / 100, `🇹🇷 ${pctM[1] ?? pctM[2]}%`);
    signals.hasLanguage = true;
  } else if (saysTr && saysForeign) {
    set("turkishShare", 0.5, "🌍 TR + intl");
    signals.hasLanguage = true;
  } else if (saysTr) {
    set("turkishShare", mostly || mixed ? 0.8 : 1, "🇹🇷 Turkish");
    if (!mostly && !mixed) set("languageStrict", true);
    signals.hasLanguage = true;
  } else if (saysForeign) {
    set("turkishShare", 0, "🌍 International");
    signals.hasLanguage = true;
  }
  const trContext = (patch.turkishShare ?? (lang === "tr" ? 0.6 : 0.2)) >= 0.5;
  const intlContext = (patch.turkishShare ?? (lang === "tr" ? 0.6 : 0.2)) < 1;

  // ── Era ─────────────────────────────────────────────────────
  const decades = new Set<number>();
  const decRe = /(?:^|\s)(?:19)?([5-9])0\s*(?:lar|ler|s|li|lu|larin|lerin)\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = decRe.exec(text))) decades.add(1900 + parseInt(dm[1], 10) * 10);
  const dec2Re = /(?:^|\s)(2000|2010|2020|00)\s*(?:lar|ler|s|li|lu|larin|lerin)\b/g;
  while ((dm = dec2Re.exec(text))) decades.add(dm[1] === "00" ? 2000 : parseInt(dm[1], 10));
  const words: Record<string, number> = { altmislar: 1960, yetmisler: 1970, seksenler: 1980, doksanlar: 1990, sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990 };
  for (const [w, d] of Object.entries(words)) if (has(text, [w])) decades.add(d);
  const range = /\b(19[5-9]\d|20[0-2]\d)\s*(?:-|–|ile|to|ve|and)\s*(19[5-9]\d|20[0-2]\d)\b/.exec(text);
  const lenient = has(text, ["agirlikli", "tarzinda", "havasinda", "leaning", "ish", "esintili", "kokan", "gibi"]);
  if (range) {
    set("eraFrom", +range[1]);
    set("eraTo", +range[2], `🕰 ${range[1]}–${range[2]}`);
    set("eraStrict", !lenient);
    signals.hasEra = true;
  } else if (decades.size) {
    const ds = [...decades].sort();
    set("eraFrom", ds[0]);
    set("eraTo", Math.min(now, ds[ds.length - 1] + 9), `🕰 ${ds.join("/")}`);
    set("eraStrict", !lenient);
    signals.hasEra = true;
  } else {
    const after = /(19[5-9]\d|20[0-2]\d)\s*(?:sonrasi|sonrasindan|ve sonrasi|after|onwards|\+)/.exec(text) ?? /(?:after|since)\s*(19[5-9]\d|20[0-2]\d)/.exec(text);
    const before = /(19[5-9]\d|20[0-2]\d)\s*(?:oncesi|before)/.exec(text) ?? /before\s*(19[5-9]\d|20[0-2]\d)/.exec(text);
    if (after) { set("eraFrom", +after[1], `🕰 ${after[1]}+`); signals.hasEra = true; }
    if (before) { set("eraTo", +before[1], `🕰 <${before[1]}`); signals.hasEra = true; }
  }
  if (!signals.hasEra) {
    if (has(text, ["cok eski", "klasik", "classic", "golden", "yesilcam", "plak"])) {
      set("eraTo", 1990); set("nostalgia", 9, "📼 classics"); signals.hasEra = true;
    } else if (has(text, ["eski", "old", "oldies", "eskiler", "retro", "nostalji", "nostalgic"])) {
      set("eraTo", 2006); set("nostalgia", 8, "📼 old-school");
      signals.vagueNostalgia = true;
    } else if (has(text, ["yeni", "guncel", "son donem", "modern", "new", "recent", "current", "fresh", "taze", "son cikan"])) {
      set("eraFrom", now - 8); set("nostalgia", 2, "✨ recent"); signals.hasEra = true;
    }
  }

  // ── Genres (with negation) ──────────────────────────────────
  const genres: GenreId[] = [];
  for (const g of GENRE_TERMS) {
    for (const term of g.terms) {
      for (const idx of allIndexes(text, term)) {
        if (term === "pop" && text.startsWith("popul", idx)) continue;
        const ids = g.both ?? [...(trContext && g.tr ? [g.tr] : []), ...(intlContext && g.intl ? [g.intl] : [])];
        if (!ids.length && g.tr) ids.push(g.tr);
        const pol = polarity(text, idx, term.length);
        if (pol === "exclude") exclude.genres.push(...ids);
        else if (pol === "avoid") avoidGenres.push(...ids);
        else genres.push(...ids);
      }
    }
  }
  if (genres.length) {
    const uniq = [...new Set(genres)].filter((g) => !exclude.genres.includes(g));
    // Pop in a Turkish party context also covers Turkish dance-pop.
    if (uniq.includes("tr-pop") && !uniq.includes("tr-dance") && has(text, ["eller havaya", "parti", "party", "hareketli", "dans", "enerjik"])) uniq.push("tr-dance");
    set("genres", uniq, `🎵 ${uniq.join(", ")}`);
    signals.hasGenre = true;
    if (patch.turkishShare === undefined && uniq.every((g) => g.startsWith("tr-") || ["tsm", "thm", "arabesk", "fantezi", "anatolian-rock"].includes(g)))
      set("turkishShare", 0.95);
  }

  // ── Tags (slow / cheesy …) ──────────────────────────────────
  for (const { terms, tag } of TAG_TERMS) {
    for (const term of terms) {
      const idx = find(text, term);
      if (idx < 0) continue;
      const pol = polarity(text, idx, term.length);
      if (pol === "exclude") exclude.tags.push(tag);
      else if (pol === "avoid") avoidTags.push(tag);
    }
  }

  // ── Moods ───────────────────────────────────────────────────
  const earlyFlow = detectFlow(text);
  const flowDescribesEnergy = earlyFlow === "party_curve" || earlyFlow === "gradual_rise" || earlyFlow === "peak_late" || earlyFlow === "wind_down";
  const moods: Mood[] = [];
  for (const [mood, terms] of Object.entries(MOOD_TERMS) as [Mood, string[]][]) {
    for (const term of terms) {
      const idx = find(text, term);
      if (idx < 0) continue;
      const pol = polarity(text, idx, term.length);
      if (pol === "exclude" || pol === "avoid") continue;
      moods.push(mood);
      break;
    }
  }
  // "ilk başta sakin sonra coşsun" describes the curve, not the overall mood.
  if (flowDescribesEnergy) for (const m of ["chill", "energetic"] as Mood[]) { const i = moods.indexOf(m); if (i >= 0) moods.splice(i, 1); }
  if (moods.length) {
    set("moods", [...new Set(moods)], `🎭 ${[...new Set(moods)].join(", ")}`);
    signals.hasMood = true;
  }
  if (moods.includes("nostalgic") && !signals.hasEra && patch.nostalgia === undefined) {
    set("nostalgia", 8);
    signals.vagueNostalgia = true;
  }

  // ── Activity ────────────────────────────────────────────────
  const acts = (Object.entries(ACTIVITY_TERMS) as [Activity, string[]][]).filter(([, terms]) =>
    terms.some((t) => { const i = find(text, t); return i >= 0 && polarity(text, i, t.length) !== "exclude"; }),
  ).map(([a]) => a);
  let activity: Activity | null = acts[0] ?? null;
  const drinksLater = has(text, ["icki", "icecek", "drinks", "sonra cos", "sonra parti", "gece ilerledikce", "then party", "cossun", "ortam cos"]);
  if (activity) {
    const profile = { ...ACTIVITY_PROFILES[activity] };
    // Profile values are soft defaults: only fill what the user didn't say.
    for (const [k, v] of Object.entries(profile)) if (!explicit.has(k) && (patch as Record<string, unknown>)[k] === undefined) (patch as Record<string, unknown>)[k] = v;
    if (profile.genres && explicit.has("genres")) patch.genres = [...new Set([...(patch.genres ?? []), ...profile.genres])];
    detected.push(`🎯 ${activity}`);
    signals.hasActivity = true;
  }
  if (acts.includes("dinner") && (acts.includes("party") || drinksLater) && activity !== "raki") {
    activity = "party";
    Object.assign(patch, { ...ACTIVITY_PROFILES.party, flow: "party_curve", peakPosition: 0.8 }, pick(patch, explicit));
    const dur = patch.durationMin ?? 180;
    const calm = Math.round(Math.min(75, Math.max(30, dur * 0.25)));
    patch.segments = [...(patch.segments ?? []), { startMin: 0, endMin: calm, delta: -2.5, label: "dinner" }];
    detected.push(`🍽 → 🥳 first ${calm}m calm`);
  }
  if (activity) patch.activity = activity;
  if (!signals.hasDuration && activity) {
    const d: Partial<Record<Activity, number>> = { party: 180, birthday: 180, raki: 180, wedding: 240, dinner: 120, driving: 120, workout: 60, date: 90, background: 120, work: 120, beach: 120, pregame: 60 };
    patch.durationMin = d[activity] ?? 60;
  }

  // ── Energy & feel scalars ───────────────────────────────────
  if (has(text, ["eller havaya", "hands up", "cilgin", "tavan", "patlasin", "bangers"])) {
    set("energy", 9, "🔥 hands-up energy"); set("danceability", 8.5); set("valence", 8.5);
  } else if (has(text, ["cok enerjik", "cok hareketli", "very energetic", "high energy", "yuksek enerji"])) {
    set("energy", 9, "🔥 high energy");
  } else if (moods.includes("energetic")) {
    set("energy", 7.5);
  } else if (has(text, ["cok sakin", "very calm", "uyku", "sleep"])) {
    set("energy", 2.5, "🌙 very calm");
  } else if (moods.includes("chill") && !drinksLater) {
    set("energy", 3.5);
  }
  if (moods.includes("happy")) set("valence", Math.max(patch.valence ?? 0, 8));
  if (moods.includes("sad") || moods.includes("melancholic")) set("valence", 3);
  if (moods.includes("party")) { set("danceability", Math.max(patch.danceability ?? 0, 8)); if (!patch.flow) set("flow", "party_curve"); }
  if (has(text, ["dans", "dance", "oynat", "oynamalik", "danceable"]) && !exclude.genres.length) set("danceability", 8.5);
  if (has(text, ["herkes eslik", "eslik", "sing along", "singalong", "hep beraber", "hep birlikte", "herkes soylesin", "karaoke"])) {
    set("singalong", true, "🎤 sing-along"); set("popularity", 9);
  }
  if (has(text, ["populer", "popular", "hit", "herkesin bildig", "bilinen", "mainstream", "tanidik", "familiar"])) set("popularity", 9, "⭐ popular");
  if (has(text, ["az bilinen", "bilinmeyen", "kesif", "discover", "underground", "nadir", "hidden gem", "obscure", "deep cut"])) {
    set("popularity", 4, "🧭 discovery"); set("discovery", 45);
  }
  if (has(text, ["beni sasirt", "sasirt", "surprise me", "surprise", "farkli bir sey", "something different"])) {
    set("discovery", 40, "🎲 surprise me"); signals.surprise = true;
  }
  if (has(text, ["kufursuz", "cocuk", "aile", "family", "clean", "kids"]) || /explicit\s*(olmasin|yok|off|no)/.test(text)) set("explicit", false, "🚸 clean");
  if (has(text, ["shuffle", "karistir", "karisik cal", "random"])) set("mode", "shuffle", "🔀 shuffle-friendly");
  if (has(text, ["ayni sanatci", "tekrar etmesin", "cesitli", "variety", "no repeats", "farkli sanatci"])) set("artistRepetition", "low");

  // ── Flow phrases ────────────────────────────────────────────
  const flow = earlyFlow;
  if (flow) {
    if (!(flow === "party_curve" && patch.flow === "peak_late")) set("flow", flow, `📈 ${flow}`);
  }
  const segs = detectSegments(text, patch.durationMin ?? 60);
  if (segs.length) {
    set("segments", [...(patch.segments ?? []), ...segs]);
    detected.push(`📈 ${segs.map((s) => `${s.startMin}-${s.endMin}m ${s.delta > 0 ? "+" : ""}${s.delta}`).join(", ")}`);
  }

  // ── Artists ─────────────────────────────────────────────────
  const taken: [number, number][] = [];
  for (const artist of CATALOG_ARTISTS) {
    const f = fold(artist);
    if (f.length < 3) continue;
    for (const idx of allIndexes(text, f)) {
      if (taken.some(([a, b]) => idx < b && idx + f.length > a)) continue;
      const afterCh = text[idx + f.length];
      if (afterCh && /[a-z]/.test(afterCh) && !/^(i|yi|u|yu|in|un|nin|nun|a|ya|e|ye|da|de|ta|te|dan|den|la|le|siz|suz|li|lu)\b/.test(text.slice(idx + f.length))) continue;
      taken.push([idx, idx + f.length]);
      signals.hasArtist = true;
      const pol = polarity(text, idx, f.length);
      if (pol === "exclude" || pol === "avoid") exclude.artists.push(artist);
      else if (pol === "focus") focusArtists.push(artist);
      else if (has(text.slice(idx + f.length, idx + f.length + 12), ["gibi", "tarzi", "like", "vari"])) {
        const g = allSeedTracks().find((t) => norm(t.artist) === norm(artist))?.genres[0];
        if (g) patch.genres = [...new Set([...(patch.genres ?? []), g])];
      } else include.artists.push(artist);
    }
  }

  // ── Track titles (quoted, or distinctive multi-word titles) ─
  const quoted = [...raw.matchAll(/["“”«»]([^"“”«»]{2,80})["“”«»]/g)].map((m) => fold(m[1]));
  for (const t of SEED_TITLES) {
    if (t.f.length < 4) continue;
    const isQuoted = quoted.some((q) => q === t.f || q.startsWith(`${t.f} `) || q.endsWith(` ${t.f}`));
    const distinctive = !TITLE_STOP.has(t.f) && (t.f.includes(" ") ? t.f.length >= 8 : t.f.length >= 7);
    const idx = find(text, t.f);
    if (idx < 0 || (!isQuoted && !distinctive)) continue;
    if (taken.some(([a, b]) => idx < b && idx + t.f.length > a)) continue;
    taken.push([idx, idx + t.f.length]);
    const pol = polarity(text, idx, t.f.length);
    if (pol === "exclude" || pol === "avoid") exclude.trackIds.push(t.id);
    else include.trackIds.push(t.id);
  }
  for (const q of quoted) if (!SEED_TITLES.some((t) => q.includes(t.f))) include.trackNames.push(q);

  if (include.artists.length || include.trackIds.length || include.trackNames.length) { patch.include = include; explicit.add("include"); detected.push(`✅ ${[...include.artists, ...include.trackIds.map(titleOf)].join(", ")}`); }
  if (exclude.artists.length || exclude.trackIds.length || exclude.genres.length || exclude.tags.length) {
    patch.exclude = exclude; explicit.add("exclude");
    detected.push(`🚫 ${[...exclude.artists, ...exclude.trackIds.map(titleOf), ...exclude.genres, ...exclude.tags].join(", ")}`);
  }
  if (avoidTags.length) { patch.avoidTags = [...new Set(avoidTags)]; detected.push(`↘ less ${avoidTags.join(", ")}`); }
  if (avoidGenres.length) { patch.avoidGenres = [...new Set(avoidGenres)]; detected.push(`↘ less ${avoidGenres.join(", ")}`); }
  if (focusArtists.length) { patch.focusArtists = focusArtists; detected.push(`⭐ ${focusArtists.join(", ")}-heavy`); }

  patch.explicitFields = [...explicit];
  return { patch, lang, detected, signals, leftovers: [] };
}

function titleOf(id: string): string {
  return allSeedTracks().find((t) => t.id === id)?.title ?? id;
}

function pick(patch: Partial<PlaylistBrief>, keys: Set<string>): Partial<PlaylistBrief> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (patch as Record<string, unknown>)[k];
  return out as Partial<PlaylistBrief>;
}

export function detectFlow(text: string): FlowShape | null {
  if (/(ilk|basta|baslarda|once|at first|start)\S*\s.*(sakin|yavas|calm|soft|chill).*(sonra|then|later|ilerledikce|giderek).*(cos|patla|hareket|enerji|yuksel|build|party|up)/.test(text)) return "party_curve";
  if (has(text, ["giderek art", "giderek yuksel", "yavas yavas yuksel", "gittikce art", "gradually", "build up", "builds up", "rising", "kademeli"])) return "gradual_rise";
  if (has(text, ["sona dogru patla", "finalde patla", "sonda patla", "peak late", "son bolumde patla", "son kisimda patla"])) return "peak_late";
  if (has(text, ["erken zirve", "basta patla", "hemen patla", "peak early", "start strong", "hizli basla"])) return "peak_early";
  if (has(text, ["dalgali", "inisli cikisli", "rollercoaster", "roller coaster", "waves"])) return "rollercoaster";
  if (has(text, ["giderek sakinles", "sakinlesen", "wind down", "winding down", "yavaslasin", "uykuya"])) return "wind_down";
  if (has(text, ["sabit", "duz bir", "flat", "steady", "dengeli kalsin", "ayni tempoda"])) return "flat";
  return null;
}

export function detectSegments(text: string, durationMin: number): SegmentOverride[] {
  const out: SegmentOverride[] = [];
  const calmW = "(sakin|yavas|calm|chill|soft|hafif|dusuk)";
  const hotW = "(cos|patla|hareketli|enerjik|energetic|explode|hype|yuksel|up)";
  const first = new RegExp(`(?:ilk|first)\\s+(\\d+|yarim)\\s*(?:saat|dakika|dk|min\\w*|hours?)?[^.]*?(?:biraz\\s+|daha\\s+|a bit\\s+|more\\s+)*${calmW}`).exec(text);
  if (first) {
    const n = first[1] === "yarim" ? 30 : +first[1];
    const mins = /saat|hour/.test(first[0]) && n < 10 ? n * 60 : n;
    out.push({ startMin: 0, endMin: Math.min(durationMin, mins), delta: /biraz|a bit/.test(first[0]) ? -1.5 : -2.5, label: "calmer start" });
  }
  const firstHot = new RegExp(`(?:ilk|first)\\s+(\\d+)\\s*(?:dakika|dk|min\\w*)?[^.]*?${hotW}`).exec(text);
  if (firstHot && !first) out.push({ startMin: 0, endMin: Math.min(durationMin, +firstHot[1]), delta: 2, label: "hot start" });
  const last = new RegExp(`(?:son|last|final)\\s+(\\d+|yarim)\\s*(?:saat|dakika|dk|min\\w*|hours?)?[^.]*?${hotW}`).exec(text);
  if (last) {
    const n = last[1] === "yarim" ? 30 : +last[1];
    const mins = /saat|hour/.test(last[0]) && n < 10 ? n * 60 : n;
    out.push({ startMin: Math.max(0, durationMin - mins), endMin: durationMin, delta: 2, label: "explosive finish" });
  }
  const lastCalm = new RegExp(`(?:son|last|final)\\s+(\\d+)\\s*(?:dakika|dk|min\\w*)?[^.]*?${calmW}`).exec(text);
  if (lastCalm && !last) out.push({ startMin: Math.max(0, durationMin - +lastCalm[1]), endMin: durationMin, delta: -2, label: "soft landing" });
  return out;
}
