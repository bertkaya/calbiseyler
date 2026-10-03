/** Parse "Artist - Title" / "Title — Artist" / CSV-ish lines. */
export function parseTextList(text: string): { title: string; artist: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\s+[-–—]\s+|\t|;/).map((s) => s.trim()).filter(Boolean);
      return parts.length >= 2 ? { artist: parts[0], title: parts.slice(1).join(" - ") } : null;
    })
    .filter((x): x is { title: string; artist: string } => !!x)
    .slice(0, 500);
}
