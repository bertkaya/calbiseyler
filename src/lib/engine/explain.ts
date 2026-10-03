/**
 * Explainer — deterministic templates (no LLM cost).
 *  - interpretBrief(): "Ben bunu şöyle yorumladım" one-liner
 *  - explainPlaylist(): short "Why this playlist?"
 */
import type { MusicTrack, PlaylistBrief, TrackRole } from "../types";
import { ACTIVITY_LABEL, GENRE_LABEL, MOOD_LABEL, eraLabel } from "../i18n";
import { peakTime } from "./flow";

const L = (b: PlaylistBrief, tr: string, en: string) => (b.lang === "en" ? en : tr);

function energyWord(b: PlaylistBrief): string {
  const e = b.energy;
  if (e >= 8) return L(b, "yüksek enerjili", "high-energy");
  if (e >= 6) return L(b, "canlı", "lively");
  if (e >= 4) return L(b, "dengeli", "balanced");
  return L(b, "sakin", "calm");
}

function joinList(items: string[], lang: "tr" | "en"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${lang === "tr" ? "ve" : "and"} ${items[items.length - 1]}`;
}

export function interpretBrief(b: PlaylistBrief): string {
  const lang = b.lang;
  const bits: string[] = [];
  const era = eraLabel(b.eraFrom, b.eraTo, lang);
  if (era) bits.push(b.eraStrict ? L(b, `sadece ${era}`, `strictly ${era}`) : L(b, `${era} ağırlıklı`, `${era}-leaning`));
  bits.push(energyWord(b));
  if (b.popularity >= 8) bits.push(L(b, "tanıdık şarkılardan oluşan", "built from songs everyone knows"));
  else if (b.discovery >= 35) bits.push(L(b, "keşif payı yüksek", "discovery-heavy"));
  if (b.nostalgia >= 7) bits.push(L(b, "nostaljik", "nostalgic"));
  if (b.turkishShare === 1) bits.push(L(b, "tamamen Türkçe", "all-Turkish"));
  else if (b.turkishShare !== null && b.turkishShare > 0) bits.push(L(b, `%${Math.round(b.turkishShare * 100)} Türkçe`, `${Math.round(b.turkishShare * 100)}% Turkish`));
  if (b.genres.length) bits.push(joinList(b.genres.slice(0, 4).map((g) => GENRE_LABEL[g][lang]), lang));
  if (b.avoidTags.includes("cheesy")) bits.push(L(b, "fazla cheesy olmayan", "not too cheesy"));
  if (b.avoidGenres.length) bits.push(L(b, `çok ${b.avoidGenres.map((g) => GENRE_LABEL[g].tr).join("/")} olmayan`, `light on ${b.avoidGenres.map((g) => GENRE_LABEL[g].en).join("/")}`));
  if (b.singalong) bits.push(L(b, "herkesin eşlik edebileceği", "sing-along friendly"));
  const act = b.activity ? ACTIVITY_LABEL[b.activity][lang] : b.moods.length ? MOOD_LABEL[b.moods[0]][lang] : null;
  const flow = flowPhrase(b);
  const dur = durationPhrase(b);
  if (lang === "en") {
    return `Got it. A ${dur} ${bits.join(", ")} flow${act ? ` for ${act}` : ""}${flow ? `, ${flow}` : ""}. Building it now.`;
  }
  return `Anladım. ${dur}, ${bits.join(", ")}${act ? ` ve ${act} için uygun` : ""} bir akış hazırlıyorum${flow ? ` — ${flow}` : ""}.`;
}

function durationPhrase(b: PlaylistBrief): string {
  const h = Math.floor(b.durationMin / 60), m = b.durationMin % 60;
  if (b.lang === "en") return h ? `${h}${m ? `h ${m}m` : "-hour"}` : `${m}-minute`;
  return h ? `${h} saat${m ? ` ${m} dakikalık` : "lik"}` : `${m} dakikalık`;
}

function flowPhrase(b: PlaylistBrief): string {
  const lang = b.lang;
  const seg = b.segments.find((s) => s.startMin === 0 && s.delta < 0);
  const map: Record<string, [string, string]> = {
    party_curve: ["sakin başlayıp coşan, finalde güçlü biten", "starting easy, building to a strong final third"],
    gradual_rise: ["enerjisi giderek artan", "with energy rising steadily"],
    peak_late: ["son bölümde patlayan", "exploding in the last stretch"],
    peak_early: ["erken zirve yapıp yumuşayan", "peaking early, then easing off"],
    rollercoaster: ["dalgalı, nefes aldıran", "with waves and breathers"],
    wind_down: ["giderek sakinleşen", "winding down gradually"],
    flat: ["baştan sona dengeli", "steady from start to finish"],
    custom: ["senin çizdiğin eğriyle", "following your custom curve"],
  };
  const base = map[b.flow]?.[lang === "en" ? 1 : 0] ?? "";
  if (seg) return lang === "en" ? `first ${seg.endMin} minutes kept calmer, ${base}` : `ilk ${seg.endMin} dakika daha sakin, ${base}`;
  return base;
}

export function explainPlaylist(b: PlaylistBrief, tracks: MusicTrack[], roles: TrackRole[]): string {
  const lang = b.lang;
  const totalMin = Math.round(tracks.reduce((s, t) => s + t.durationSec, 0) / 60);
  const peakMin = Math.round(peakTime(b) * totalMin);
  const opener = tracks[0];
  const finale = tracks[tracks.length - 1];
  const peakCount = roles.filter((r) => r === "peak").length;
  const s: string[] = [];
  if (lang === "en") {
    if (b.activity === "dinner" || b.activity === "raki" || b.segments.some((x) => x.startMin === 0 && x.delta < 0))
      s.push("I started with familiar, mid-energy tracks so conversation and food come first.");
    else if (opener) s.push(`I open with "${opener.title}" — recognisable, not too loud, a good handshake.`);
    if (b.flow !== "flat") s.push(`Energy builds toward minute ~${peakMin}, where I placed ${peakCount} of the strongest tracks.`);
    else s.push("Energy stays deliberately even so nothing jolts the room.");
    if (b.mode === "shuffle") s.push("Tracks are chosen to sit close together, so shuffle won't derail the vibe.");
    else s.push("Neighbouring tracks are matched on tempo, energy, era and genre to keep transitions smooth.");
    if (finale) s.push(`"${finale.title}" closes it as the finale.`);
  } else {
    if (b.activity === "dinner" || b.activity === "raki" || b.segments.some((x) => x.startMin === 0 && x.delta < 0))
      s.push("Önce sohbet ve yemek olacağı için tanıdık, orta enerjili şarkılarla başladım.");
    else if (opener) s.push(`"${opener.title}" ile açıyorum — tanıdık ama bağırmayan, iyi bir tokalaşma.`);
    if (b.flow !== "flat") s.push(`Enerji ~${peakMin}. dakikaya doğru yükseliyor; en güçlü ${peakCount} parçayı oraya koydum.`);
    else s.push("Enerjiyi bilinçli olarak dengeli tuttum, ortamı sarsacak ani geçiş yok.");
    if (b.mode === "shuffle") s.push("Şarkıları birbirine yakın seçtim; shuffle açılsa da ortam dağılmaz.");
    else s.push("Ardışık parçaları tempo, enerji, dönem ve tür uyumuna göre eşleştirdim, geçişler yumuşak.");
    if (finale) s.push(`Finali "${finale.title}" yapıyor.`);
  }
  return s.join(" ");
}
