/**
 * Question Planner — "AI yormasın". Ask only when the answer would change the
 * playlist a lot AND we can't make a good assumption. Max 2 questions, always
 * skippable ("Just create").
 */
import type { PlaylistBrief, Question } from "../types";
import type { RuleParse } from "./intent-rules";

export function planQuestions(parse: RuleParse, brief: PlaylistBrief): Question[] {
  const tr = brief.lang !== "en";
  const s = parse.signals;
  const qs: Question[] = [];

  // "2 saatlik Türkçe nostaljik playlist" → which nostalgia?
  if (s.vagueNostalgia && !s.hasEra && !s.hasActivity && !s.hasGenre) {
    qs.push({
      id: "era",
      text: tr ? "Nostaljiyi daha çok hangi dönemden istiyorsun?" : "Which era should the nostalgia come from?",
      options: [
        { label: tr ? "70'ler–80'ler" : "70s–80s", patch: { eraFrom: 1970, eraTo: 1989, eraStrict: false } },
        { label: tr ? "90'lar" : "90s", patch: { eraFrom: 1990, eraTo: 1999, eraStrict: false } },
        { label: tr ? "2000'ler" : "2000s", patch: { eraFrom: 2000, eraTo: 2009, eraStrict: false } },
        { label: tr ? "Karışık olsun" : "Mix it", patch: { eraFrom: 1975, eraTo: 2008, eraStrict: false } },
      ],
    });
  }

  // Nothing to go on at all ("playlist yap") → one vibe question.
  const nothing = !s.hasGenre && !s.hasMood && !s.hasActivity && !s.hasArtist && !s.hasEra && !s.surprise && !s.vagueNostalgia;
  if (nothing) {
    qs.push({
      id: "vibe",
      text: tr ? "Nasıl bir hava olsun?" : "What's the vibe?",
      options: [
        { label: tr ? "🥳 Parti" : "🥳 Party", patch: { activity: "party", energy: 8, danceability: 8, flow: "party_curve", singalong: true } },
        { label: tr ? "🌿 Sakin" : "🌿 Chill", patch: { moods: ["chill"], energy: 3.5, flow: "flat" } },
        { label: tr ? "🚗 Yolculuk" : "🚗 Road trip", patch: { activity: "driving", moods: ["roadtrip"], energy: 6.5, flow: "rollercoaster" } },
        { label: tr ? "📼 Nostalji" : "📼 Nostalgia", patch: { moods: ["nostalgic"], nostalgia: 8, eraTo: 2006 } },
      ],
    });
  }

  // Language is high impact for a Turkish user; ask only when nothing hints at it and the request is otherwise rich.
  if (!s.hasLanguage && !s.hasArtist && !s.hasGenre && brief.activity && ["party", "wedding", "birthday", "driving"].includes(brief.activity) && qs.length < 2 && brief.lang === "tr") {
    qs.push({
      id: "language",
      text: "Türkçe mi, karışık mı?",
      options: [
        { label: "🇹🇷 Türkçe", patch: { turkishShare: 1, languageStrict: true } },
        { label: "🇹🇷 Çoğu Türkçe", patch: { turkishShare: 0.75 } },
        { label: "🌍 Karışık", patch: { turkishShare: 0.5 } },
        { label: "🌍 Yabancı", patch: { turkishShare: 0 } },
      ],
    });
  }
  return qs.slice(0, 2);
}
