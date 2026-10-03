import type { PlaylistBrief } from "../types";
import { ACTIVITY_LABEL, GENRE_LABEL, MOOD_LABEL, eraLabel } from "../i18n";

const cap = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase("tr"));

/** Short evocative title, e.g. "2 Hours of Turkish Nostalgia" / "90'lar Türkçe Pop · Eller Havaya". */
export function makeTitle(b: PlaylistBrief): string {
  if (b.title) return b.title;
  const h = b.durationMin / 60;
  const durEn = h >= 1 ? `${Number.isInteger(h) ? h : h.toFixed(1)} Hour${h === 1 ? "" : "s"}` : `${b.durationMin} Minutes`;
  const durTr = h >= 1 ? `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} Saat` : `${b.durationMin} Dakika`;
  const era = eraLabel(b.eraFrom, b.eraTo, b.lang);
  const turkish = b.turkishShare !== null && b.turkishShare >= 0.8;
  if (b.lang === "en") {
    let what = "";
    if (b.activity) what = cap(ACTIVITY_LABEL[b.activity].en);
    else if (b.moods.includes("nostalgic") || b.nostalgia >= 8) what = "Nostalgia";
    else if (b.genres[0]) what = cap(GENRE_LABEL[b.genres[0]].en);
    else if (b.moods[0]) what = cap(MOOD_LABEL[b.moods[0]].en);
    else what = "Good Music";
    return `${durEn} of ${era ? `${era} ` : ""}${turkish && !what.startsWith("Turkish") ? "Turkish " : ""}${what}`;
  }
  const parts: string[] = [];
  if (era) parts.push(era);
  if (b.activity === "raki") return `Rakı Sofrası · ${durTr}`;
  if (b.activity === "wedding") return `Düğün Gecesi · ${durTr}`;
  if (b.genres[0]) parts.push(cap(GENRE_LABEL[b.genres[0]].tr.replace("hareketli ", "")));
  else if (turkish) parts.push("Türkçe");
  if (b.energy >= 8.5 && (b.activity === "party" || b.moods.includes("party"))) parts.push("· Eller Havaya");
  else if (b.activity) parts.push(`· ${cap(ACTIVITY_LABEL[b.activity].tr)}`);
  else if (b.moods[0]) parts.push(`· ${cap(MOOD_LABEL[b.moods[0]].tr)}`);
  if (!parts.length) return `${durTr} İyi Müzik`;
  return `${parts.join(" ")} · ${durTr}`.replace(/^· /, "");
}
