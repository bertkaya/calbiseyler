/**
 * Music Theme — a higher-level personal principle ("I want music to make
 * ordinary moments feel cinematic"), adapted from the Theme System idea:
 * theme → lightweight reflection → review → adjustment.
 */
import type { PlaylistBrief } from "../types";

export interface MusicTheme {
  id: string;
  statement: string;
  principles: string[];
  discovery: number | null;
  updatedAt: number;
}

/** Turn a theme into soft brief defaults (never overrides what the user asked explicitly). */
export function themeDefaults(theme: MusicTheme | null): Partial<PlaylistBrief> {
  if (!theme) return {};
  const t = `${theme.statement} ${theme.principles.join(" ")}`.toLocaleLowerCase("tr");
  const out: Partial<PlaylistBrief> = {};
  const pct = /%\s*(\d{1,2})\s*(discovery|keşif|kesif|yeni)|(\d{1,2})\s*%\s*(discovery|keşif|kesif|yeni)/.exec(t);
  if (theme.discovery !== null) out.discovery = theme.discovery;
  else if (pct) out.discovery = parseInt(pct[1] ?? pct[3], 10);
  if (/(familiar|tanıdık|tanidik|bildiğim|bildigim)/.test(t)) out.popularity = 8;
  if (/(cinematic|sinematik|film gibi|epic|epik)/.test(t)) out.flow = "party_curve";
  if (/(calm|sakin|huzur|peace)/.test(t)) out.energy = 4.5;
  if (/(energy|enerji|canlı|alive|dans)/.test(t)) out.energy = 7;
  if (/(türkçe|turkce|turkish)/.test(t)) out.turkishShare = 0.8;
  if (/(nostalji|nostalg|eski)/.test(t)) out.nostalgia = 7;
  return out;
}

export const REFLECTION_PROMPTS = {
  tr: [
    "Bu hafta hangi şarkı bir anı 'film sahnesi' gibi hissettirdi?",
    "Bu hafta müzik seni nerede yanılttı — fazla mı sakin, fazla mı tanıdıktı?",
    "Gelecek hafta müziğinden ne istiyorsun?",
  ],
  en: [
    "Which song made an ordinary moment feel cinematic this week?",
    "Where did music miss this week — too calm, too familiar?",
    "What do you want from your music next week?",
  ],
};
