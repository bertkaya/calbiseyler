import { z } from "zod";

/** Brief patches come from the UI; validate shape loosely and let normalizeBrief clamp values. */
const IE = z.object({
  artists: z.array(z.string().max(120)).max(50).default([]),
  trackIds: z.array(z.string().max(200)).max(200).default([]),
  trackNames: z.array(z.string().max(200)).max(50).default([]),
  genres: z.array(z.string()).max(30).default([]),
  tags: z.array(z.string()).max(30).default([]),
});

export const BriefPatch = z
  .object({
    title: z.string().max(120).optional(),
    durationMin: z.number().min(10).max(600).optional(),
    durationStrict: z.boolean().optional(),
    turkishShare: z.number().min(0).max(1).nullable().optional(),
    languageStrict: z.boolean().optional(),
    genres: z.array(z.string()).max(20).optional(),
    moods: z.array(z.string()).max(10).optional(),
    activity: z.string().nullable().optional(),
    eraFrom: z.number().min(1900).max(2100).nullable().optional(),
    eraTo: z.number().min(1900).max(2100).nullable().optional(),
    eraStrict: z.boolean().optional(),
    energy: z.number().optional(),
    danceability: z.number().optional(),
    valence: z.number().optional(),
    nostalgia: z.number().optional(),
    popularity: z.number().optional(),
    discovery: z.number().optional(),
    flow: z.enum(["flat", "gradual_rise", "party_curve", "rollercoaster", "peak_early", "peak_late", "wind_down", "custom"]).optional(),
    peakPosition: z.number().optional(),
    segments: z.array(z.object({ startMin: z.number(), endMin: z.number(), delta: z.number().min(-5).max(5), label: z.string().optional() })).max(8).optional(),
    customCurve: z.array(z.number().min(1).max(10)).max(24).optional(),
    mode: z.enum(["sequential", "shuffle"]).optional(),
    explicit: z.boolean().optional(),
    artistRepetition: z.enum(["low", "medium", "high"]).optional(),
    include: IE.optional(),
    exclude: IE.optional(),
    avoidTags: z.array(z.string()).max(20).optional(),
    avoidGenres: z.array(z.string()).max(20).optional(),
    focusArtists: z.array(z.string()).max(20).optional(),
    singalong: z.boolean().optional(),
  })
  .strict();

export const CreateBody = z.object({
  prompt: z.string().max(2000).default(""),
  overrides: BriefPatch.optional(),
  answers: z.array(BriefPatch).max(4).optional(),
  skipQuestions: z.boolean().optional(),
  referencePlaylistIds: z.array(z.string()).max(5).optional(),
  expert: z.boolean().optional(),
  uiLang: z.enum(["tr", "en"]).optional(),
});

export const ActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("preset"), preset: z.enum(["more_energetic", "more_nostalgic", "more_mainstream", "more_surprising", "more_turkish", "more_danceable", "more_chill", "more_modern"]) }),
  z.object({ action: z.literal("replace"), position: z.number().int().min(0), choiceId: z.string().optional() }),
  z.object({ action: z.literal("alternatives"), position: z.number().int().min(0) }),
  z.object({ action: z.literal("feedback"), position: z.number().int().min(0), kind: z.enum(["like", "love", "dislike", "never"]) }),
  z.object({ action: z.literal("remove"), position: z.number().int().min(0), replace: z.boolean().default(true) }),
  z.object({ action: z.literal("move"), from: z.number().int().min(0), to: z.number().int().min(0) }),
  z.object({ action: z.literal("lock"), position: z.number().int().min(0) }),
  z.object({ action: z.literal("include"), trackId: z.string() }),
  z.object({ action: z.literal("includeExclude"), which: z.enum(["include", "exclude"]), value: IE }),
  z.object({ action: z.literal("suggestion"), suggestionId: z.string(), accept: z.boolean() }),
  z.object({ action: z.literal("undo") }),
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("share") }),
  z.object({ action: z.literal("journal"), text: z.string().min(1).max(2000) }),
]);
