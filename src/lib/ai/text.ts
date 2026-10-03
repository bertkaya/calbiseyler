/** Text helpers for the Turkish/English rule parser. */

/** Lowercase + fold Turkish chars + strip apostrophes, keep digits, % and spaces. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[’'`´]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%+&\-–\s.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if any phrase occurs as whole words (phrases may contain spaces; suffixes allowed when `prefix`). */
export function has(text: string, phrases: string[], prefix = true): boolean {
  return phrases.some((p) => find(text, p, prefix) >= 0);
}

export function find(text: string, phrase: string, prefix = true): number {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[\\s,.;:!?+/-])${esc}${prefix ? "" : "(?=$|[\\s,.;:!?+/-])"}`);
  const m = re.exec(text);
  return m ? m.index + m[1].length : -1;
}

export function allIndexes(text: string, phrase: string): number[] {
  const out: number[] = [];
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[\\s,.;:!?+/-])${esc}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m.index + m[1].length);
  return out;
}

const TR_HINTS = /[çğıöşü]|\b(ve|bir|olsun|saat|saatlik|şarkı|sarki|yap|olmasın|olmasin|türkçe|turkce|için|icin|ama|daha|gibi|biraz|bana)\b/i;
export function detectLang(raw: string): "tr" | "en" {
  return TR_HINTS.test(raw) ? "tr" : "en";
}

export const NUM_WORDS: Record<string, number> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, an: 1, a: 1,
};
