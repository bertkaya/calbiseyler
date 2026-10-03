import type { PlaylistBrief } from "../types";
import { clamp10 } from "./util";

export type MakeItPreset =
  | "more_energetic"
  | "more_nostalgic"
  | "more_mainstream"
  | "more_surprising"
  | "more_turkish"
  | "more_danceable"
  | "more_chill"
  | "more_modern";

export const MAKE_IT: { id: MakeItPreset; tr: string; en: string }[] = [
  { id: "more_energetic", tr: "Daha enerjik", en: "More energetic" },
  { id: "more_nostalgic", tr: "Daha nostaljik", en: "More nostalgic" },
  { id: "more_mainstream", tr: "Daha bilinen", en: "More mainstream" },
  { id: "more_surprising", tr: "Daha şaşırtıcı", en: "More surprising" },
  { id: "more_turkish", tr: "Daha Türkçe", en: "More Turkish" },
  { id: "more_danceable", tr: "Daha dans", en: "More danceable" },
  { id: "more_chill", tr: "Daha sakin", en: "More chill" },
  { id: "more_modern", tr: "Daha modern", en: "More modern" },
];

/** One-click "Make it…" → brief patch. Intensity 1 = default step. */
export function presetPatch(b: PlaylistBrief, p: MakeItPreset, intensity = 1): Partial<PlaylistBrief> {
  const k = intensity;
  switch (p) {
    case "more_energetic":
      return { energy: clamp10(b.energy + 1.5 * k), danceability: clamp10(b.danceability + 0.8 * k) };
    case "more_nostalgic": {
      const patch: Partial<PlaylistBrief> = { nostalgia: clamp10(b.nostalgia + 2 * k) };
      if (b.eraTo) patch.eraFrom = (b.eraFrom ?? b.eraTo - 15) - Math.round(4 * k);
      return patch;
    }
    case "more_mainstream":
      return { popularity: clamp10(b.popularity + 1.5 * k), discovery: Math.max(0, b.discovery - 10 * k) };
    case "more_surprising":
      return { discovery: Math.min(100, b.discovery + 20 * k), popularity: clamp10(b.popularity - 1.5 * k) };
    case "more_turkish":
      return { turkishShare: Math.min(1, (b.turkishShare ?? 0.5) + 0.2 * k) };
    case "more_danceable":
      return { danceability: clamp10(b.danceability + 2 * k), energy: clamp10(b.energy + 0.5 * k) };
    case "more_chill":
      return { energy: clamp10(b.energy - 2 * k), danceability: clamp10(b.danceability - 1 * k) };
    case "more_modern": {
      const now = new Date().getFullYear();
      const patch: Partial<PlaylistBrief> = { nostalgia: clamp10(b.nostalgia - 2.5 * k) };
      if (b.eraFrom || b.eraTo) {
        patch.eraFrom = Math.min(now - 3, (b.eraFrom ?? 1990) + Math.round(8 * k));
        patch.eraTo = Math.min(now, (b.eraTo ?? now - 10) + Math.round(10 * k));
      }
      return patch;
    }
  }
}
