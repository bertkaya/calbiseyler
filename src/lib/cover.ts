/** Deterministic colour from a string → cover gradient (no images needed). Shared by server and client components. */
export function coverStyle(seed: string): { background: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${(h + 48) % 360} 58% 34%))` };
}

export function initials(s: string): string {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toLocaleUpperCase("tr");
}
