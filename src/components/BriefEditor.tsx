"use client";
import { useEffect, useRef, useState } from "react";
import type { FlowShape, PlaylistBrief } from "@/lib/types";
import { ACTIVITY_LABEL, GENRE_LABEL, MOOD_LABEL, eraLabel } from "@/lib/i18n";
import { Seg, Slider } from "./ui";
import { useT } from "./LangProvider";

type Patch = Partial<PlaylistBrief>;
const FLOWS: FlowShape[] = ["flat", "gradual_rise", "party_curve", "rollercoaster", "peak_early", "peak_late", "wind_down"];

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
  const { t: tr, lang } = useT();
  const commit = (p: Patch) => { setOpen(null); setDraft({}); onChange(p); };
  const d = { ...brief, ...draft };
  const era = eraLabel(brief.eraFrom, brief.eraTo, lang);
  const peakName = tr(brief.peakPosition < 0.4 ? "brief.early" : brief.peakPosition < 0.7 ? "brief.middle" : "brief.late");

  return (
    <div className="chips" aria-busy={busy}>
      <Pop open={open === "dur"} onToggle={t("dur")} label={<>⏱ {Math.floor(brief.durationMin / 60) ? `${Math.floor(brief.durationMin / 60)}h ` : ""}{brief.durationMin % 60 ? `${brief.durationMin % 60}m` : ""}</>}>
        <Slider label={tr("s.minutes")} value={d.durationMin} min={15} max={360} step={5} onChange={(v) => setDraft({ ...draft, durationMin: v })} />
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={d.durationStrict} onChange={(e) => setDraft({ ...draft, durationStrict: e.target.checked })} /> {tr("brief.exact")}</label>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => commit({ durationMin: d.durationMin, durationStrict: d.durationStrict })}>{tr("brief.applyBtn")}</button>
      </Pop>

      <Pop open={open === "lang"} onToggle={t("lang")} label={brief.turkishShare === null ? `🌍 ${tr("brief.anyLang")}` : brief.turkishShare >= 0.99 ? `🇹🇷 ${tr("s.turkish")}` : brief.turkishShare <= 0.01 ? `🌍 ${tr("brief.intl")}` : `🇹🇷 ${tr("brief.turkishPct", { n: Math.round(brief.turkishShare * 100) })}`}>
        <Slider label={tr("s.turkish")} value={Math.round((d.turkishShare ?? 0.5) * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => setDraft({ ...draft, turkishShare: v / 100 })} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => commit({ turkishShare: d.turkishShare ?? 0.5, languageStrict: (d.turkishShare ?? 0.5) >= 0.99 })}>{tr("brief.applyBtn")}</button>
          <button className="btn btn-sm" onClick={() => commit({ turkishShare: null, languageStrict: false })}>{tr("brief.any")}</button>
        </div>
      </Pop>

      <Pop open={open === "era"} onToggle={t("era")} label={<>🕰️ {era ?? tr("brief.anyEra")}</>}>
        <div className="row">
          <input className="input" type="number" min={1950} max={2030} placeholder={tr("brief.from")} value={d.eraFrom ?? ""} onChange={(e) => setDraft({ ...draft, eraFrom: e.target.value ? Number(e.target.value) : null })} />
          <span>–</span>
          <input className="input" type="number" min={1950} max={2030} placeholder={tr("brief.to")} value={d.eraTo ?? ""} onChange={(e) => setDraft({ ...draft, eraTo: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={d.eraStrict} onChange={(e) => setDraft({ ...draft, eraStrict: e.target.checked })} /> {tr("brief.strict")}</label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => commit({ eraFrom: d.eraFrom, eraTo: d.eraTo, eraStrict: d.eraStrict })}>{tr("brief.applyBtn")}</button>
          <button className="btn btn-sm" onClick={() => commit({ eraFrom: null, eraTo: null, eraStrict: false })}>{tr("brief.anyEra")}</button>
        </div>
      </Pop>

      <Pop open={open === "feel"} onToggle={t("feel")} label={<>🔥 {tr("s.energy")} {brief.energy.toFixed(1)}</>}>
        <Slider label={tr("s.energy")} value={d.energy} onChange={(v) => setDraft({ ...draft, energy: v })} />
        <Slider label={tr("s.dance")} value={d.danceability} onChange={(v) => setDraft({ ...draft, danceability: v })} />
        <Slider label={tr("s.happiness")} value={d.valence} onChange={(v) => setDraft({ ...draft, valence: v })} />
        <Slider label={tr("s.nostalgia")} value={d.nostalgia} onChange={(v) => setDraft({ ...draft, nostalgia: v })} />
        <Slider label={tr("s.popularity")} value={d.popularity} onChange={(v) => setDraft({ ...draft, popularity: v })} />
        <Slider label={tr("s.discovery")} value={d.discovery} min={0} max={100} step={5} suffix="%" onChange={(v) => setDraft({ ...draft, discovery: v })} />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => commit(draft)}>{tr("brief.applyBtn")}</button>
      </Pop>

      <Pop open={open === "flow"} onToggle={t("flow")} label={<>📈 {tr(`flow.${brief.flow}`)}</>}>
        <div className="chips">
          {FLOWS.map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={d.flow === f} onClick={() => setDraft({ ...draft, flow: f })}>{tr(`flow.${f}`)}</button>
          ))}
        </div>
        <div className="chip-group-label">{tr("brief.peak")}</div>
        <Seg value={(d.peakPosition < 0.4 ? "early" : d.peakPosition < 0.7 ? "middle" : "late") as "early" | "middle" | "late"}
          onChange={(v) => setDraft({ ...draft, peakPosition: v === "early" ? 0.3 : v === "middle" ? 0.55 : 0.82, flow: d.flow === "flat" || d.flow === "gradual_rise" ? "party_curve" : d.flow })}
          options={[{ value: "early", label: tr("brief.early") }, { value: "middle", label: tr("brief.middle") }, { value: "late", label: tr("brief.late") }]} />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, display: "block" }} onClick={() => commit(draft)}>{tr("brief.applyBtn")}</button>
      </Pop>

      <button type="button" className="chip" aria-pressed={brief.mode === "shuffle"} onClick={() => onChange({ mode: brief.mode === "shuffle" ? "sequential" : "shuffle" })} title={tr("pl.shuffleTitle")}>
        {brief.mode === "shuffle" ? tr("brief.shuffle") : tr("brief.sequential")}
      </button>
      <button type="button" className="chip" aria-pressed={!brief.explicit} onClick={() => onChange({ explicit: !brief.explicit })}>{brief.explicit ? tr("brief.explicit") : tr("brief.clean")}</button>
      <Pop open={open === "rep"} onToggle={t("rep")} label={<>🎤 {tr("brief.repetition")}: {tr(`lvl.${brief.artistRepetition}`)}</>}>
        <Seg value={brief.artistRepetition} onChange={(v) => commit({ artistRepetition: v })} options={[{ value: "low", label: tr("lvl.low") }, { value: "medium", label: tr("lvl.medium") }, { value: "high", label: tr("lvl.high") }]} />
      </Pop>
      {brief.activity && <span className="chip chip-soft chip-static">{ACTIVITY_LABEL[brief.activity].emoji} {ACTIVITY_LABEL[brief.activity][lang]}</span>}
      {brief.moods.filter((m) => m !== brief.activity).map((m) => <span key={m} className="chip chip-soft chip-static">{MOOD_LABEL[m].emoji} {MOOD_LABEL[m][lang]}</span>)}
      {brief.genres.slice(0, 5).map((g) => (
        <button key={g} type="button" className="chip chip-soft" title={tr("brief.removeGenre")} onClick={() => onChange({ genres: brief.genres.filter((x) => x !== g) })}>🎵 {GENRE_LABEL[g][lang]} <span className="x">×</span></button>
      ))}
      {brief.singalong && <span className="chip chip-soft chip-static">{tr("brief.singalong")}</span>}
      <span className="tiny faint" style={{ alignSelf: "center" }}>{tr("brief.peak")}: {peakName}</span>
    </div>
  );
}
