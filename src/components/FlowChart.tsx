"use client";
import type { TrackRole } from "@/lib/types";
import { useT } from "./LangProvider";

/** Target energy curve vs. the energy of each placed track. */
export function FlowChart({ target, points, roles }: {
  target: number[];
  points: { t: number; e: number; title: string }[];
  roles?: TrackRole[];
}) {
  const { t } = useT();
  const W = 640, H = 170, P = 12;
  const x = (t: number) => P + t * (W - 2 * P);
  const y = (e: number) => H - P - ((e - 1) / 9) * (H - 2 * P);
  const path = target.map((e, i) => `${i ? "L" : "M"}${x(i / Math.max(1, target.length - 1)).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  const area = `${path} L${x(1)},${H - P} L${x(0)},${H - P} Z`;
  const peakIdx = roles ? roles.findIndex((r) => r === "peak") : -1;
  const labels = t("flowchart.labels").split("|");
  return (
    <figure style={{ margin: 0 }}>
      <svg className="flowchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("flowchart.aria")}>
        <defs>
          <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[2, 4, 6, 8, 10].map((e) => (
          <line key={e} x1={P} x2={W - P} y1={y(e)} y2={y(e)} stroke="var(--line)" strokeDasharray="2 5" />
        ))}
        <path d={area} fill="url(#fc-fill)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.e)} r={roles?.[i] === "peak" ? 4.5 : 3.2} fill={roles?.[i] === "peak" ? "var(--accent)" : "var(--text)"} opacity={0.85}>
            <title>{`${i + 1}. ${p.title} · ${p.e.toFixed(1)}`}</title>
          </circle>
        ))}
        {peakIdx >= 0 && points[peakIdx] && (
          <text x={x(points[peakIdx].t)} y={y(points[peakIdx].e) - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--accent)">PEAK</text>
        )}
      </svg>
      <div className="flow-labels">{labels.map((l) => <span key={l}>{l}</span>)}</div>
    </figure>
  );
}
