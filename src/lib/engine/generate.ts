/**
 * The pipeline:
 * USER INTENT → BRIEF → CANDIDATES → FILTER → SCORE → DIVERSITY → FLOW →
 * TRANSITIONS → DURATION FIT → FINAL ORDER   (platform matching happens later)
 */
import type { GeneratedPlaylist, MusicTrack, PlaylistBrief, PlaylistTrack, SommelierSuggestion } from "../types";
import { artistMatches } from "../catalog";
import type { EngineContext } from "./context";
import { passesFilters, scoreTrack, type ScoredTrack } from "./scoring";
import { durationTolerance, selectTracks } from "./select";
import { optimizeOrder } from "./order";
import { assignRoles } from "./roles";
import { computeDNA, computeStats, transitionsOf } from "./dna";
import { explainPlaylist } from "./explain";
import { sampleCurve, energyAt } from "./flow";
import { energyOf } from "./features";
import { eraLabel } from "../i18n";
import { GENRE_IDS, genrePairSimilarity } from "../catalog/genres";

export interface GenerateResult extends GeneratedPlaylist {
  trackObjects: MusicTrack[];
}

export function generatePlaylist(brief: PlaylistBrief, ctx: EngineContext): GenerateResult {
  const warnings: string[] = [];
  const L = (tr: string, en: string) => (brief.lang === "en" ? en : tr);

  // FILTER + SCORE
  const eligible = ctx.pool.filter((t) => passesFilters(t, brief, ctx.taste));
  let scored = eligible.map((t) => scoreTrack(t, brief, ctx));

  // Included artists: lock their best track if none is locked yet.
  for (const artist of brief.include.artists) {
    const theirs = scored.filter((s) => artistMatches(s.track.artist, artist)).sort((a, b) => b.value - a.value);
    if (!theirs.length) {
      warnings.push(L(`"${artist}" katalogda bulunamadı.`, `Couldn't find "${artist}" in the catalog.`));
      continue;
    }
    if (!theirs.some((s) => s.included)) theirs[0].included = true;
  }
  for (const id of brief.include.trackIds) {
    if (!scored.some((s) => s.track.id === id)) warnings.push(L(`İstenen bir şarkı bulunamadı (${id}).`, `A requested track wasn't found (${id}).`));
  }

  // Candidate pool: drop clearly unfitting tracks unless needed to fill time.
  scored.sort((a, b) => b.value - a.value);
  const T = brief.durationMin * 60;
  const good = scored.filter((s) => s.included || s.fit >= 0.5);
  const goodSec = good.reduce((s, x) => s + x.track.durationSec, 0);
  const candidates: ScoredTrack[] = goodSec >= T * 1.4 ? good : scored;

  const suggestions = buildSuggestions(brief, ctx, scored, goodSec);

  // SELECT (diversity + duration) → ORDER (flow + transitions)
  const selected = selectTracks(candidates, brief);
  const ordered = optimizeOrder(selected.map((s) => s.track), brief);
  const lockedIds = new Set(selected.filter((s) => s.included).map((s) => s.track.id));

  const totalSec = ordered.reduce((s, t) => s + t.durationSec, 0);
  if (Math.abs(totalSec - T) > durationTolerance(brief) * 1.5) {
    warnings.push(
      L(
        `Bu kriterlerle ${Math.round(totalSec / 60)} dakika oluşturabildim (hedef ${brief.durationMin}). Kısıtları biraz gevşetirsen tamamlayabilirim.`,
        `With these constraints I could build ${Math.round(totalSec / 60)} minutes (target ${brief.durationMin}). Relax a constraint and I'll fill the rest.`,
      ),
    );
  }

  const roles = assignRoles(ordered, brief);
  const trans = transitionsOf(ordered);
  const tracks: PlaylistTrack[] = ordered.map((t, i) => ({
    trackId: t.id,
    position: i,
    role: roles[i],
    transitionIn: trans[i] === null ? null : Math.round((trans[i] as number) * 100) / 100,
    locked: lockedIds.has(t.id),
  }));

  // Peak quality check → sommelier may propose relaxing the era (spec §26).
  const lastThird = ordered.filter((_, i) => i >= ordered.length * 0.6);
  if (lastThird.length && brief.flow !== "flat" && brief.flow !== "wind_down") {
    let acc = ordered.slice(0, ordered.length - lastThird.length).reduce((s, t) => s + t.durationSec, 0);
    const errs = lastThird.map((t) => {
      const mid = (acc + t.durationSec / 2) / totalSec;
      acc += t.durationSec;
      return energyAt(brief, mid) - energyOf(t) * 10;
    });
    const under = errs.reduce((a, b) => a + b, 0) / errs.length;
    if (under > 1.4 && brief.eraStrict && brief.eraTo && !suggestions.some((s) => s.id === "widen-era")) {
      suggestions.push(widenEraSuggestion(brief, ctx, "peak"));
    }
  }

  return {
    brief,
    tracks,
    trackObjects: ordered,
    dna: computeDNA(ordered, ctx.taste),
    stats: computeStats(ordered),
    flowTarget: sampleCurve(brief),
    explanation: explainPlaylist(brief, ordered, roles),
    // One suggestion at a time — the sommelier guides, it doesn't nag.
    suggestions: suggestions.filter(Boolean).slice(0, 1),
    warnings,
  };
}

function widenEraSuggestion(brief: PlaylistBrief, ctx: EngineContext, reason: "pool" | "peak"): SommelierSuggestion {
  const to = brief.eraTo as number;
  const newTo = to + 4;
  const extra = ctx.pool.filter(
    (t) => t.year && t.year > to && t.year <= newTo && passesFilters(t, { ...brief, eraStrict: false }, ctx.taste),
  ).length;
  const era = eraLabel(brief.eraFrom, brief.eraTo, brief.lang) ?? `${brief.eraFrom}–${to}`;
  const n = Math.max(2, Math.min(6, extra));
  const msg =
    brief.lang === "en"
      ? reason === "peak"
        ? `I can keep this strictly ${era}. But if you let me add ~${n} tracks from ${to + 1}–${newTo}, the last section will rise much more naturally.`
        : `There aren't quite enough strictly-${era} tracks for this. Allow ~${n} tracks from ${to + 1}–${newTo}?`
      : reason === "peak"
        ? `Sadece ${era} ile yapabilirim. Ancak playlistin son bölümünün daha doğal yükselmesi için ${to + 1}–${newTo} döneminden ~${n} şarkı eklememe izin verirsen daha iyi bir akış elde ederiz.`
        : `Bu süre için katı ${era} şarkısı biraz az. ${to + 1}–${newTo} döneminden ~${n} şarkı eklememe izin verir misin?`;
  return {
    id: "widen-era",
    message: msg,
    acceptPatch: { eraTo: newTo, eraStrict: true },
    acceptLabel: brief.lang === "en" ? "Allow" : "İzin ver",
    declineLabel: brief.lang === "en" ? `Keep strictly ${era}` : `Sadece ${era} kalsın`,
  };
}

function buildSuggestions(brief: PlaylistBrief, ctx: EngineContext, scored: ScoredTrack[], goodSec: number): SommelierSuggestion[] {
  const T = brief.durationMin * 60;
  const out: SommelierSuggestion[] = [];
  if (goodSec >= T * 1.3) return out;
  if (brief.eraStrict && brief.eraTo && brief.eraTo < new Date().getFullYear() - 2) out.push(widenEraSuggestion(brief, ctx, "pool"));
  if (brief.languageStrict && brief.turkishShare === 1) {
    out.push({
      id: "allow-foreign",
      message:
        brief.lang === "en"
          ? "The Turkish pool for this exact mix is thin. May I add a few international tracks that match the vibe?"
          : "Bu karışım için Türkçe havuz biraz dar. Havaya uyan birkaç yabancı şarkı eklememe izin verir misin?",
      acceptPatch: { turkishShare: 0.85, languageStrict: false },
      acceptLabel: brief.lang === "en" ? "Allow" : "İzin ver",
      declineLabel: brief.lang === "en" ? "Keep 100% Turkish" : "%100 Türkçe kalsın",
    });
  }
  if (!out.length && scored.length && brief.genres.length === 1) {
    out.push({
      id: "adjacent-genres",
      message:
        brief.lang === "en"
          ? "This genre alone is a bit narrow for the length. Allow close neighbours to keep the flow fresh?"
          : "Bu tür tek başına bu süre için biraz dar. Akış taze kalsın diye yakın türlere izin verir misin?",
      acceptPatch: {
        genres: [brief.genres[0], ...GENRE_IDS.filter((g) => g !== brief.genres[0] && genrePairSimilarity(g, brief.genres[0]) >= 0.6)],
      },
      acceptLabel: brief.lang === "en" ? "Allow" : "İzin ver",
      declineLabel: brief.lang === "en" ? "Keep it pure" : "Saf kalsın",
    });
  }
  return out;
}
