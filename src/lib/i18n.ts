import type { Activity, GenreId, Mood } from "./types";

export const GENRE_LABEL: Record<GenreId, { tr: string; en: string }> = {
  "tr-pop": { tr: "Türkçe pop", en: "Turkish pop" },
  "tr-dance": { tr: "hareketli Türkçe pop", en: "Turkish dance-pop" },
  "tr-rock": { tr: "Türkçe rock", en: "Turkish rock" },
  "anatolian-rock": { tr: "Anadolu rock", en: "Anatolian rock" },
  "tr-alt": { tr: "Türkçe alternatif", en: "Turkish alternative" },
  "tr-rap": { tr: "Türkçe rap", en: "Turkish rap" },
  arabesk: { tr: "arabesk", en: "arabesk" },
  fantezi: { tr: "fantezi", en: "fantezi" },
  tsm: { tr: "Türk sanat müziği", en: "Turkish classical" },
  thm: { tr: "Türk halk müziği", en: "Turkish folk" },
  pop: { tr: "pop", en: "pop" },
  dance: { tr: "dance", en: "dance" },
  "disco-funk": { tr: "disko & funk", en: "disco & funk" },
  rock: { tr: "rock", en: "rock" },
  "rnb-hiphop": { tr: "R&B / hip-hop", en: "R&B / hip-hop" },
  indie: { tr: "indie", en: "indie" },
  latin: { tr: "latin", en: "latin" },
  jazz: { tr: "caz", en: "jazz" },
  lounge: { tr: "lounge", en: "lounge" },
  electronic: { tr: "elektronik", en: "electronic" },
};

export const MOOD_LABEL: Record<Mood, { tr: string; en: string; emoji: string }> = {
  happy: { tr: "mutlu", en: "happy", emoji: "😊" },
  sad: { tr: "hüzünlü", en: "sad", emoji: "🌧️" },
  chill: { tr: "sakin", en: "chill", emoji: "🌿" },
  romantic: { tr: "romantik", en: "romantic", emoji: "🌹" },
  energetic: { tr: "enerjik", en: "energetic", emoji: "⚡" },
  nostalgic: { tr: "nostaljik", en: "nostalgic", emoji: "📼" },
  melancholic: { tr: "melankolik", en: "melancholic", emoji: "🌙" },
  party: { tr: "parti", en: "party", emoji: "🥳" },
  focus: { tr: "odak", en: "focus", emoji: "🎯" },
  roadtrip: { tr: "yol", en: "road trip", emoji: "🚗" },
};

export const ACTIVITY_LABEL: Record<Activity, { tr: string; en: string; emoji: string }> = {
  party: { tr: "parti", en: "party", emoji: "🥳" },
  dinner: { tr: "yemek", en: "dinner", emoji: "🍽️" },
  driving: { tr: "yolculuk", en: "driving", emoji: "🚗" },
  workout: { tr: "spor", en: "workout", emoji: "🏃" },
  date: { tr: "baş başa akşam", en: "date night", emoji: "🕯️" },
  background: { tr: "arka plan", en: "background", emoji: "🛋️" },
  pregame: { tr: "gece öncesi", en: "pre-game", emoji: "🍸" },
  wedding: { tr: "düğün", en: "wedding", emoji: "💍" },
  beach: { tr: "plaj", en: "beach", emoji: "🏖️" },
  work: { tr: "çalışma", en: "work", emoji: "💻" },
  raki: { tr: "rakı sofrası", en: "rakı table", emoji: "🥂" },
  birthday: { tr: "doğum günü", en: "birthday", emoji: "🎂" },
};

export function eraLabel(from: number | null, to: number | null, lang: "tr" | "en"): string | null {
  if (!from && !to) return null;
  const dec = (y: number) => (y < 2000 ? `${String(y).slice(2, 3)}0` : `${String(y).slice(0, 3)}0`);
  const suffix = (y: number) => {
    if (lang === "en") return y < 2000 ? `${dec(y)}s` : `${dec(y)}s`;
    const d = dec(y);
    // Turkish vowel harmony for decades: 60'lar 70'ler 80'ler 90'lar 2000'ler 2010'lar 2020'ler
    const map: Record<string, string> = { "50": "'ler", "60": "'lar", "70": "'ler", "80": "'ler", "90": "'lar", "2000": "'ler", "2010": "'lar", "2020": "'ler" };
    return `${d}${map[d] ?? "'ler"}`;
  };
  if (from && to) {
    if (to - from <= 10 && Math.floor(from / 10) === Math.floor(to / 10)) return suffix(from);
    if (from % 10 === 0 && to % 10 === 9) return `${suffix(from)}–${suffix(to - 9)}`;
    return `${from}–${to}`;
  }
  if (from) return lang === "tr" ? `${from} sonrası` : `after ${from}`;
  return lang === "tr" ? `${to} öncesi` : `before ${to}`;
}
