/**
 * Optional LLM layer (Anthropic Claude). Used ONLY for:
 *  - intent understanding of rich/ambiguous requests
 *  - free-form natural-language edits the rule parser can't map
 *  - curation beyond the local catalog (suggestions are verified later)
 * Everything else is deterministic code. If ANTHROPIC_API_KEY is unset or the
 * call fails, callers fall back to the rule parser (fail-safe).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { GENRE_IDS } from "../catalog/genres";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 25000);

export function llmEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.SOMMELIER_DISABLE_LLM !== "1";
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

const Genre = z.enum(GENRE_IDS as [string, ...string[]]);
const MoodE = z.enum(["happy", "sad", "chill", "romantic", "energetic", "nostalgic", "melancholic", "party", "focus", "roadtrip"]);
const ActivityE = z.enum(["party", "dinner", "driving", "workout", "date", "background", "pregame", "wedding", "beach", "work", "raki", "birthday"]);
const FlowE = z.enum(["flat", "gradual_rise", "party_curve", "rollercoaster", "peak_early", "peak_late", "wind_down"]);
const TagE = z.enum(["singalong", "anthem", "slow", "cheesy", "classic", "wedding", "romantic", "sad", "summer", "oyun", "instrumental", "explicit"]);

export const LlmBriefSchema = z.object({
  durationMin: z.number().nullable().describe("Total minutes, null if not stated"),
  durationStrict: z.boolean().describe("User asked for an exact length ('tam 2 saat')"),
  turkishShare: z.number().nullable().describe("0..1 share of Turkish-language songs, null if unspecified"),
  languageStrict: z.boolean(),
  genres: z.array(Genre),
  excludeGenres: z.array(Genre),
  avoidGenres: z.array(Genre).describe("Soft: 'not too much arabesk'"),
  moods: z.array(MoodE),
  activity: ActivityE.nullable(),
  eraFrom: z.number().nullable(),
  eraTo: z.number().nullable(),
  eraStrict: z.boolean(),
  energy: z.number().nullable().describe("1..10"),
  danceability: z.number().nullable().describe("1..10"),
  valence: z.number().nullable().describe("1..10 happiness"),
  nostalgia: z.number().nullable().describe("1..10"),
  popularity: z.number().nullable().describe("1..10 mainstream-ness"),
  discovery: z.number().nullable().describe("0..100 percent unfamiliar tracks"),
  flow: FlowE.nullable(),
  peakPosition: z.number().nullable().describe("0..1 relative time of the energy peak"),
  segments: z.array(z.object({ startMin: z.number(), endMin: z.number(), delta: z.number().describe("-4..4 energy change") })),
  explicit: z.boolean().nullable(),
  shuffle: z.boolean().nullable(),
  singalong: z.boolean(),
  includeArtists: z.array(z.string()),
  excludeArtists: z.array(z.string()),
  focusArtists: z.array(z.string()),
  includeTracks: z.array(z.object({ title: z.string(), artist: z.string() })),
  excludeTracks: z.array(z.object({ title: z.string(), artist: z.string() })),
  avoidTags: z.array(TagE),
  excludeTags: z.array(TagE),
  title: z.string().nullable().describe("A short evocative playlist title in the user's language"),
});
export type LlmBrief = z.infer<typeof LlmBriefSchema>;

const SYSTEM_INTENT = `You are the Intent Parser of "AI Music Sommelier", a playlist designer.
Translate the user's request (usually Turkish, sometimes English) into a structured playlist brief.
Think like a sommelier: infer the occasion, audience, duration, energy story and era from context,
but never invent constraints the user didn't imply — use null for unknown scalars.
Guidance:
- "eller havaya" = hands-in-the-air party energy (energy≈9, danceability≈8.5).
- "rakı sofrası" = activity raki: Turkish, sing-along, TSM/THM/Turkish pop/fantezi, calm start rising late.
- "eski" without a decade = nostalgic, roughly before ~2006, not strict. An explicit decade ("90'lar") is strict unless "ağırlıklı".
- "çok X olmasın" is a SOFT avoid (avoidGenres/avoidTags); "X olmasın" is a hard exclusion.
- "herkes eşlik etsin" = singalong true, popularity high.
- Segments express local energy changes in minutes, e.g. "ilk 30 dakika sakin" → {startMin:0,endMin:30,delta:-2.5}.
Genres: tr-pop, tr-dance, tr-rock, anatolian-rock, tr-alt, tr-rap, arabesk, fantezi, tsm (Turkish classical), thm (Turkish folk), pop, dance, disco-funk, rock, rnb-hiphop, indie, latin, jazz, lounge, electronic.`;

async function parseWith<T extends z.ZodType>(schema: T, system: string, user: string, maxTokens = 4000): Promise<z.infer<T> | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return (res.parsed_output as z.infer<T>) ?? null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`[llm] ${err.status ?? ""} ${err.message}`);
    else console.warn("[llm] failed:", (err as Error).message);
    return null;
  }
}

export async function llmParseIntent(text: string): Promise<LlmBrief | null> {
  return parseWith(LlmBriefSchema, SYSTEM_INTENT, text);
}

const EditSchema = z.object({
  understood: z.boolean().describe("false if the instruction is not about the playlist"),
  brief: LlmBriefSchema.partial().describe("ONLY the fields that should change; omit everything else"),
  removeTrackNumbers: z.array(z.number()).describe("1-based track numbers to remove/replace"),
  reply: z.string().describe("One short sentence to the user, in their language, saying what you changed"),
});
export type LlmEdit = z.infer<typeof EditSchema>;

export async function llmInterpretEdit(instruction: string, briefSummary: string, trackList: string): Promise<LlmEdit | null> {
  const system = `${SYSTEM_INTENT}
You are now editing an EXISTING playlist. Return only the brief fields that must change to satisfy the instruction.
Prefer minimal changes; the engine keeps tracks that still fit.`;
  const user = `Current brief:\n${briefSummary}\n\nCurrent tracks:\n${trackList}\n\nInstruction: ${instruction}`;
  return parseWith(EditSchema, system, user);
}

const CurateSchema = z.object({
  tracks: z.array(
    z.object({
      title: z.string(),
      artist: z.string(),
      year: z.number().nullable(),
      durationSec: z.number().nullable(),
      language: z.string().describe("ISO-639-1"),
      genres: z.array(Genre),
      energy: z.number().describe("0..1"),
      danceability: z.number().describe("0..1"),
      valence: z.number().describe("0..1"),
      popularity: z.number().describe("0..1 how well-known in the target audience"),
      bpm: z.number().nullable(),
      tags: z.array(TagE),
      explicit: z.boolean(),
    }),
  ),
});
export type LlmCuration = z.infer<typeof CurateSchema>;

/** Ask for real, existing recordings that fit — results are marked estimated and verified on a provider before export. */
export async function llmCurate(briefSummary: string, avoid: string[], count = 30): Promise<LlmCuration | null> {
  const system = `You are the Music Curator of "AI Music Sommelier". Suggest REAL, released recordings only — never invent songs.
If unsure a song exists exactly as titled, leave it out. Prefer the canonical studio version title.
Estimate audio features honestly; they will be shown as estimates.`;
  const user = `Brief:\n${briefSummary}\n\nSuggest up to ${count} tracks that fit. Do not include these (already known): ${avoid.slice(0, 150).join("; ")}`;
  return parseWith(CurateSchema, system, user, 12000);
}
