"use client";
import { useEffect, useState } from "react";
import type { PlaylistDNA } from "@/lib/types";

export function Slider({ label, value, min = 1, max = 10, step = 0.5, suffix = "", onChange, onCommit }: {
  label: string; value: number; min?: number; max?: number; step?: number; suffix?: string;
  onChange?: (v: number) => void; onCommit?: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const p = ((v - min) / (max - min)) * 100;
  const id = `s-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="range" min={min} max={max} step={step} value={v}
        style={{ ["--p" as string]: `${p}%` }}
        onChange={(e) => { const n = Number(e.target.value); setV(n); onChange?.(n); }}
        onPointerUp={() => onCommit?.(v)} onKeyUp={() => onCommit?.(v)}
      />
      <output htmlFor={id}>{Number.isInteger(v) ? v : v.toFixed(1)}{suffix}</output>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const DNA_ROWS: { key: keyof PlaylistDNA; tr: string; en: string }[] = [
  { key: "nostalgia", tr: "Nostalji", en: "Nostalgia" },
  { key: "energy", tr: "Enerji", en: "Energy" },
  { key: "dance", tr: "Dans", en: "Dance" },
  { key: "mainstream", tr: "Bilinirlik", en: "Mainstream" },
  { key: "discovery", tr: "Keşif", en: "Discovery" },
  { key: "happiness", tr: "Mutluluk", en: "Happiness" },
  { key: "turkish", tr: "Türkçe", en: "Turkish" },
  { key: "acoustic", tr: "Akustik", en: "Acoustic" },
];

export function DNABars({ dna, lang = "tr" }: { dna: PlaylistDNA; lang?: "tr" | "en" }) {
  return (
    <div role="list" aria-label="Playlist DNA">
      {DNA_ROWS.map((r) => (
        <div className="dna-row" role="listitem" key={r.key}>
          <span>{r[lang]}</span>
          <div className="dna-bar" aria-hidden><i style={{ width: `${dna[r.key] ?? 0}%` }} /></div>
          <span className="mono muted" style={{ textAlign: "right" }}>{dna[r.key] ?? 0}%</span>
        </div>
      ))}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}

export function Dots() {
  return <span className="pulse-dots" aria-label="loading"><span /><span /><span /></span>;
}

/** Deterministic colour from a string → cover gradient (no images needed). */
export function coverStyle(seed: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${(h + 48) % 360} 58% 34%))` };
}

export function initials(s: string): string {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toLocaleUpperCase("tr");
}
