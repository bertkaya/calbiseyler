"use client";
import { useEffect, useRef, useState } from "react";
import type { FlowShape, PlaylistBrief } from "@/lib/types";
import { ACTIVITY_LABEL, GENRE_LABEL, MOOD_LABEL, eraLabel } from "@/lib/i18n";
import { Seg, Slider } from "./ui";

type Patch = Partial<PlaylistBrief>;
const FLOW_LABEL: Record<FlowShape, string> = {
  flat: "Flat", gradual_rise: "Gradual Rise", party_curve: "Party Curve", rollercoaster: "Rollercoaster",
  peak_early: "Peak Early", peak_late: "Peak Late", wind_down: "Wind Down", custom: "Custom",
};

function Pop({ label, children, open, onToggle }: { label: React.ReactNode; children: React.ReactNode; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onToggle(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, onToggle]);
  return (
    <div className="rel" ref={ref}>
      <button type="button" className="chip" aria-expanded={open} onClick={onToggle}>{label}</button>
      {open && <div className="card popover">{children}</div>}
    </div>
  );
}

/** The "YOUR PLAYLIST" brief: every parameter is a chip you can click and change. */
export function BriefEditor({ brief, onChange, busy }: { brief: PlaylistBrief; onChange: (p: Patch) => void; busy: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Patch>({});
  const t = (k: string) => () => { setOpen(open === k ? null : k); setDraft({}); };
  const lang = brief.lang;
  const commit = (p: Patch) => { setOpen(null); setDraft({}); onChange(p); };
  const d = { ...brief, ...draft };
  const era = eraLabel(brief.eraFrom, brief.eraTo, lang);
  const peakName = brief.peakPosition < 0.4 ? "Early" : brief.peakPosition < 0.7 ? "Middle" : "Late";

  return (
    <div className="chips" aria-busy={busy}>
      <Pop open={open === "dur"} onToggle={t("dur")} label={<>⏱ {Math.floor(brief.durationMin / 60) ? `${Math.floor(brief.durationMin / 60)}h ` : ""}{brief.durationMin % 60 ? `${brief.durationMin % 60}m` : ""}</>}>
        <Slider label="Minutes" value={d.durationMin} min={15} max={360} step={5} onChange={(v) => setDraft({ ...draft, durationMin: v })} />
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={d.durationStrict} onChange={(e) => setDraft({ ...draft, durationStrict: e.target.checked })} /> Exact length (“tam”)</label>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => commit({ durationMin: d.durationMin, durationStrict: d.durationStrict })}>Apply</button>
      </Pop>

      <Pop open={open === "lang"} onToggle={t("lang")} label={brief.turkishShare === null ? "🌍 Any language" : brief.turkishShare >= 0.99 ? "🇹🇷 Turkish" : brief.turkishShare <= 0.01 ? "🌍 International" : `🇹🇷 ${Math.round(brief.turkishShare * 100)}% Turkish`}>
        <Slider label="Turkish" value={Math.round((d.turkishShare ?? 0.5) * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => setDraft({ ...draft, turkishShare: v / 100 })} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => commit({ turkishShare: d.turkishShare ?? 0.5, languageStrict: (d.turkishShare ?? 0.5) >= 0.99 })}>Apply</button>
          <button className="btn btn-sm" onClick={() => commit({ turkishShare: null, languageStrict: false })}>Any</button>
        </div>
      </Pop>

      <Pop open={open === "era"} onToggle={t("era")} label={<>🕰️ {era ?? (lang === "en" ? "Any era" : "Her dönem")}</>}>
        <div className="row">
          <input className="input" type="number" min={1950} max={2030} placeholder="From" value={d.eraFrom ?? ""} onChange={(e) => setDraft({ ...draft, eraFrom: e.target.value ? Number(e.target.value) : null })} />
          <span>–</span>
          <input className="input" type="number" min={1950} max={2030} placeholder="To" value={d.eraTo ?? ""} onChange={(e) => setDraft({ ...draft, eraTo: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={d.eraStrict} onChange={(e) => setDraft({ ...draft, eraStrict: e.target.checked })} /> Strict (no tracks outside)</label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => commit({ eraFrom: d.eraFrom, eraTo: d.eraTo, eraStrict: d.eraStrict })}>Apply</button>
          <button className="btn btn-sm" onClick={() => commit({ eraFrom: null, eraTo: null, eraStrict: false })}>Any era</button>
        </div>
      </Pop>

      <Pop open={open === "feel"} onToggle={t("feel")} label={<>🔥 Energy {brief.energy.toFixed(1)}</>}>
        <Slider label="Energy" value={d.energy} onChange={(v) => setDraft({ ...draft, energy: v })} />
        <Slider label="Danceability" value={d.danceability} onChange={(v) => setDraft({ ...draft, danceability: v })} />
        <Slider label="Happiness" value={d.valence} onChange={(v) => setDraft({ ...draft, valence: v })} />
        <Slider label="Nostalgia" value={d.nostalgia} onChange={(v) => setDraft({ ...draft, nostalgia: v })} />
        <Slider label="Popularity" value={d.popularity} onChange={(v) => setDraft({ ...draft, popularity: v })} />
        <Slider label="Discovery" value={d.discovery} min={0} max={100} step={5} suffix="%" onChange={(v) => setDraft({ ...draft, discovery: v })} />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => commit(draft)}>Apply</button>
      </Pop>

      <Pop open={open === "flow"} onToggle={t("flow")} label={<>📈 {FLOW_LABEL[brief.flow]}</>}>
        <div className="chips">
          {(Object.keys(FLOW_LABEL) as FlowShape[]).filter((f) => f !== "custom").map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={d.flow === f} onClick={() => setDraft({ ...draft, flow: f })}>{FLOW_LABEL[f]}</button>
          ))}
        </div>
        <div className="chip-group-label">Peak</div>
        <Seg value={(d.peakPosition < 0.4 ? "early" : d.peakPosition < 0.7 ? "middle" : "late") as "early" | "middle" | "late"}
          onChange={(v) => setDraft({ ...draft, peakPosition: v === "early" ? 0.3 : v === "middle" ? 0.55 : 0.82, flow: d.flow === "flat" || d.flow === "gradual_rise" ? "party_curve" : d.flow })}
          options={[{ value: "early", label: "Early" }, { value: "middle", label: "Middle" }, { value: "late", label: "Late" }]} />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, display: "block" }} onClick={() => commit(draft)}>Apply</button>
      </Pop>

      <button type="button" className="chip" aria-pressed={brief.mode === "shuffle"} onClick={() => onChange({ mode: brief.mode === "shuffle" ? "sequential" : "shuffle" })} title="Shuffle-friendly vs. sequential">
        {brief.mode === "shuffle" ? "🔀 Shuffle-friendly" : "▶︎ Sequential"}
      </button>
      <button type="button" className="chip" aria-pressed={!brief.explicit} onClick={() => onChange({ explicit: !brief.explicit })}>{brief.explicit ? "🅴 Explicit allowed" : "🚸 Clean"}</button>
      <Pop open={open === "rep"} onToggle={t("rep")} label={<>🎤 Repetition: {brief.artistRepetition}</>}>
        <Seg value={brief.artistRepetition} onChange={(v) => commit({ artistRepetition: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
      </Pop>
      {brief.activity && <span className="chip chip-soft chip-static">{ACTIVITY_LABEL[brief.activity].emoji} {ACTIVITY_LABEL[brief.activity][lang]}</span>}
      {brief.moods.map((m) => <span key={m} className="chip chip-soft chip-static">{MOOD_LABEL[m].emoji} {MOOD_LABEL[m][lang]}</span>)}
      {brief.genres.slice(0, 5).map((g) => (
        <button key={g} type="button" className="chip chip-soft" title="Remove genre" onClick={() => onChange({ genres: brief.genres.filter((x) => x !== g) })}>🎵 {GENRE_LABEL[g][lang]} <span className="x">×</span></button>
      ))}
      {brief.singalong && <span className="chip chip-soft chip-static">🎤 Sing-along</span>}
      <span className="tiny faint" style={{ alignSelf: "center" }}>Peak: {peakName}</span>
    </div>
  );
}
