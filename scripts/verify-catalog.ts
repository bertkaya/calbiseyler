/**
 * Katalog doğrulaması: her seed şarkının (şarkı + sanatçı + yıl) gerçekten var olduğunu ve yılının makul olduğunu
 * iki açık kaynağa karşı kontrol eder ve docs/CATALOG_VERIFICATION.md raporunu yazar. Kataloğu DEĞİŞTİRMEZ.
 *
 *   npx tsx scripts/verify-catalog.ts            (≈ 256 şarkı × ~1.2 sn ≈ 5-6 dk; MusicBrainz 1 istek/sn kuralı)
 *
 * Kaynaklar: MusicBrainz (ilk yayın yılı) ve Deezer arama (var mı?). Bir şarkının bulunamaması "yanlış" demek
 * değildir (Türkçe arşivler eksik olabilir); rapor bunları "doğrulanamadı" olarak ayırır.
 */
import fs from "node:fs";
import path from "node:path";
import { allSeedTracks, norm } from "../src/lib/catalog";

const UA = "AI-Music-Sommelier-catalog-check/1.0 ( https://bertkaya.com )";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Verdict = "ok" | "year_mismatch" | "artist_mismatch" | "not_found" | "check_failed";
const FAILED = Symbol("failed"); // ağ/limit hatası: "bulunamadı" ile karıştırılmaz
interface Row { id: string; title: string; artist: string; year: number; verdict: Verdict; mbYear?: number; source: string; note: string }

async function getJson(url: string): Promise<unknown | null | typeof FAILED> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.status === 503 || r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(2000); }
  }
  return FAILED;
}

const quote = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;

async function musicBrainz(title: string, artist: string) {
  const q = `recording:${quote(title)} AND artist:${quote(artist.split(/\s*&\s*/)[0])}`;
  const raw = await getJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=10`);
  if (raw === FAILED) return FAILED;
  const j = raw as
    | { recordings?: { score?: number; title?: string; "first-release-date"?: string; "artist-credit"?: { name?: string }[] }[] }
    | null;
  if (!j?.recordings) return null;
  const hits = j.recordings.filter((r) => (r.score ?? 0) >= 85 && norm(r.title ?? "").startsWith(norm(title).slice(0, 12)));
  if (!hits.length) return { found: false as const };
  const artistOk = hits.some((h) => (h["artist-credit"] ?? []).some((c) => norm(c.name ?? "").includes(norm(artist.split(/\s*&\s*/)[0]))));
  const years = hits.map((h) => Number((h["first-release-date"] ?? "").slice(0, 4))).filter((y) => y > 1900);
  return { found: true as const, artistOk, year: years.length ? Math.min(...years) : undefined };
}

async function deezer(title: string, artist: string) {
  const raw = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:${quote(artist.split(/\s*&\s*/)[0])} track:${quote(title)}`)}&limit=5`);
  if (raw === FAILED) return FAILED;
  const j = raw as
    | { data?: { title?: string; artist?: { name?: string } }[] }
    | null;
  return !!j?.data?.some((d) => norm(d.title ?? "").startsWith(norm(title).slice(0, 10)) && norm(d.artist?.name ?? "").includes(norm(artist.split(/\s*&\s*/)[0]).slice(0, 8)));
}

async function main() {
  const tracks = allSeedTracks();
  const rows: Row[] = [];
  let i = 0;
  for (const t of tracks) {
    i++;
    const year = t.year ?? 0;
    const mb = await musicBrainz(t.title, t.artist);
    await sleep(1100);
    let verdict: Verdict = "not_found", note = "", source = "—";
    if (mb === FAILED) {
      verdict = "check_failed"; note = "MusicBrainz'e ulaşılamadı (ağ/limit); tekrar çalıştırın";
    } else if (mb?.found) {
      source = "MusicBrainz";
      if (!mb.artistOk) { verdict = "artist_mismatch"; note = "Şarkı adı bulundu ama bu sanatçıyla değil"; }
      else if (mb.year && year && Math.abs(mb.year - year) > 2) { verdict = "year_mismatch"; note = `Katalog ${year}, MusicBrainz ilk yayın ${mb.year}`; }
      else verdict = "ok";
    } else {
      const dz = await deezer(t.title, t.artist);
      if (dz === FAILED) { verdict = "check_failed"; note = "Deezer'a ulaşılamadı; tekrar çalıştırın"; }
      else if (dz) { source = "Deezer"; verdict = "ok"; note = "Varlığı doğrulandı; yıl doğrulanamadı"; }
      else note = "İki kaynakta da bulunamadı (arşiv eksik olabilir)";
    }
    rows.push({ id: t.id, title: t.title, artist: t.artist, year, verdict, mbYear: mb && mb !== FAILED && mb.found ? mb.year : undefined, source, note });
    if (i % 25 === 0) console.log(`${i}/${tracks.length}`);
  }
  const by = (v: Verdict) => rows.filter((r) => r.verdict === v);
  const table = (list: Row[]) => list.length ? ["| Şarkı | Sanatçı | Katalog yılı | Not |", "|---|---|---:|---|", ...list.map((r) => `| ${r.title} | ${r.artist} | ${r.year || "?"} | ${r.note} |`)].join("\n") : "_Yok._";
  const md = `# Katalog doğrulama raporu

Tarih: ${new Date().toISOString().slice(0, 10)} · Şarkı: ${rows.length} · Kaynak: MusicBrainz (yıl), Deezer (varlık)

| Sonuç | Adet |
|---|---:|
| Doğrulandı | ${by("ok").length} |
| Yıl farkı > 2 | ${by("year_mismatch").length} |
| Sanatçı uyuşmuyor | ${by("artist_mismatch").length} |
| Bulunamadı | ${by("not_found").length} |
| Kontrol edilemedi (ağ) | ${by("check_failed").length} |

Yıl farkı listesi bir İNCELEME listesidir: MusicBrainz bazen aynı adlı başka bir kaydı ya da derleme/yeniden basım tarihini getirir (ör. 'Öp' 2010 doğru, 'Kim Bilebilir Aşkı' 2000 doğru). "Bulunamadı" yanlış demek değildir: MusicBrainz ve Deezer'da Türkçe arşiv eksik olabilir. Yıl farkında katalog bilerek orijinal yılı tutuyor olabilir; elle kontrol edin.

## Sanatçı uyuşmuyor (önce bunlara bakın)
${table(by("artist_mismatch"))}

## Yıl farkı > 2
${table(by("year_mismatch"))}

## Bulunamadı
${table(by("not_found"))}

## Kontrol edilemedi (ağ/limit)
${table(by("check_failed"))}
`;
  const out = path.join(__dirname, "..", "docs", "CATALOG_VERIFICATION.md");
  fs.writeFileSync(out, md);
  console.log(`Yazıldı: ${out}`, { ok: by("ok").length, year: by("year_mismatch").length, artist: by("artist_mismatch").length, notFound: by("not_found").length });
}

main().catch((e) => { console.error(e); process.exit(1); });
