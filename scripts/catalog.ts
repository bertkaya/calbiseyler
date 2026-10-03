/**
 * Catalog tooling.
 *
 *   npm run catalog:enrich                 → measure features for the seed catalog,
 *                                            writes src/lib/catalog/enriched.json (commit it)
 *   npm run catalog:grow -- tracks.txt     → add new tracks with measured features to the DB
 *
 * tracks.txt lines:  Artist - Title [| genre,genre] [| tag tag] [| lang]
 *   Sezen Aksu - Geri Dön | tr-pop | singalong classic | tr
 *
 * Needs SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (to resolve Spotify IDs for
 * ReccoBeats); GETSONGBPM_API_KEY is an optional fallback. Network access to
 * api.spotify.com, api.reccobeats.com, api.getsong.co, api.deezer.com required.
 */
import fs from "node:fs";
import path from "node:path";
import { allSeedTracks, slugify } from "../src/lib/catalog";
import { GENRE_IDS, GENRES } from "../src/lib/catalog/genres";
import { enrichTracks, enrichmentAvailable } from "../src/lib/enrich/enrich";
import { spotifyProvider } from "../src/lib/providers/spotify";
import { scoreCandidate } from "../src/lib/providers/matcher";
import { upsertTrack } from "../src/lib/server/repo";
import type { GenreId, MusicTrack, TrackTag } from "../src/lib/types";

const OVERLAY = path.join(__dirname, "..", "src", "lib", "catalog", "enriched.json");

async function enrichSeed() {
  const seed = allSeedTracks();
  console.log(`Enriching ${seed.length} seed tracks…`);
  const { tracks, report } = await enrichTracks(seed, { concurrency: 3 });
  const overlay: Record<string, unknown> = JSON.parse(fs.readFileSync(OVERLAY, "utf8"));
  for (const t of tracks) {
    if (!t.featureSource && !t.spotifyId) continue;
    overlay[t.id] = { features: t.features, spotifyId: t.spotifyId, isrc: t.isrc, featureSource: t.featureSource };
  }
  fs.writeFileSync(OVERLAY, JSON.stringify(overlay, null, 1) + "\n");
  console.log(report, `→ ${OVERLAY}`);
}

function parseLine(line: string): { artist: string; title: string; genres: GenreId[]; tags: TrackTag[]; lang?: string } | null {
  const [main, g = "", tg = "", lang] = line.split("|").map((s) => s.trim());
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(main ?? "");
  if (!m) return null;
  const genres = g.split(/[,\s]+/).filter((x): x is GenreId => (GENRE_IDS as string[]).includes(x));
  return { artist: m[1].trim(), title: m[2].trim(), genres, tags: tg.split(/\s+/).filter(Boolean) as TrackTag[], lang: lang || undefined };
}

async function grow(file: string) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const base: MusicTrack[] = [];
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) { console.warn("skip:", line); continue; }
    const isTr = p.lang ? p.lang === "tr" : /[çğıöşüÇĞİÖŞÜ]/.test(`${p.artist} ${p.title}`);
    let t: MusicTrack = {
      id: `prv:${slugify(p.artist)}--${slugify(p.title)}`, title: p.title, artist: p.artist, durationSec: 225,
      language: p.lang ?? (isTr ? "tr" : "en"), genres: p.genres.length ? p.genres : [isTr ? "tr-pop" : "pop"],
      tags: p.tags, explicit: false, source: "provider", estimated: true, features: {},
    };
    if (spotifyProvider.isConfigured()) {
      const cands = await spotifyProvider.search({ title: p.title, artist: p.artist }).catch(() => []);
      const best = cands.map((c) => ({ c, s: scoreCandidate(t, c).score })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) {
        t = { ...t, title: best.c.title, durationSec: best.c.durationSec ?? 225, year: best.c.year, explicit: !!best.c.explicit, spotifyId: best.c.id, isrc: best.c.isrc };
        if (t.explicit && !t.tags.includes("explicit")) t.tags.push("explicit");
      } else console.warn("not found on Spotify:", line);
    }
    if (!GENRES[t.genres[0]]) t.genres = ["pop"];
    base.push(t);
  }
  const { tracks, report } = await enrichTracks(base, { concurrency: 3 });
  for (const t of tracks) upsertTrack(t);
  console.log(report, `stored ${tracks.length} tracks in the database`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!enrichmentAvailable()) console.warn("⚠ No enrichment source configured — set SPOTIFY_CLIENT_ID/SECRET and/or GETSONGBPM_API_KEY.");
  if (cmd === "enrich") return enrichSeed();
  if (cmd === "grow" && arg) return grow(arg);
  console.log("usage: catalog.ts enrich | grow <file>");
}

main().catch((e) => { console.error(e); process.exit(1); });
