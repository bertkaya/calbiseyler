/** Musical key helpers → Camelot notation used by the transition optimizer. */

/** pitchClass 0=C … 11=B, mode 1=major 0=minor → "8B" / "8A". */
export function camelotFromPitch(pitchClass: number, mode: number): string | undefined {
  if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) return undefined;
  const pc = mode === 1 ? pitchClass : (pitchClass + 3) % 12; // minor → relative major shares the number
  const n = (((pc * 7) % 12) + 7) % 12 + 1;
  return `${n}${mode === 1 ? "B" : "A"}`;
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#m", "D♭", "F♯ minor", "Am" → Camelot. */
export function camelotFromName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const m = /^\s*([A-G])\s*([#♯b♭]?)\s*(m|min|minor)?/i.exec(name.replace(/maj(or)?/i, ""));
  if (!m) return undefined;
  let pc = NOTE[m[1].toUpperCase()];
  if (m[2] === "#" || m[2] === "♯") pc = (pc + 1) % 12;
  if (m[2] === "b" || m[2] === "♭") pc = (pc + 11) % 12;
  return camelotFromPitch(pc, m[3] ? 0 : 1);
}

/** Open Key ("1d", "4m") → Camelot (1d = C major = 8B). */
export function camelotFromOpenKey(ok?: string | null): string | undefined {
  const m = ok ? /^(\d{1,2})([dm])$/i.exec(ok.trim()) : null;
  if (!m) return undefined;
  const n = ((Number(m[1]) + 6) % 12) + 1;
  return `${n}${m[2].toLowerCase() === "d" ? "B" : "A"}`;
}
