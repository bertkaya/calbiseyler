# AI Music Sommelier 🍷🎶

> Not "AI that finds songs" — **AI that understands why you want music and designs the listening experience around it.**

Tell it the moment ("3 saatlik rakı sofrası. Türkçe. Herkes eşlik etsin. İlk başta sakin sonra coşsun.") and it builds a
playlist with an energy story — warm-up → build → peak → finale — optimised transitions, shuffle-friendliness, a
Playlist DNA, and role-preserving replacements. Then you steer it in plain language ("İlk 30 dakika biraz daha sakin olsun",
"Tarkan kalsın ama Sezen Aksu olmasın") and send it to Spotify.

📐 **Architecture, provider realities, scoring model, optimisation algorithm, risks:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Quick start

```bash
cp .env.example .env        # set APP_SECRET (required in production)
npm install
npm run dev                 # http://127.0.0.1:3000
npm test                    # 62 unit/integration tests
npm run build && npm start
```

Requires **Node ≥ 20.9**. Local data lives in `data/sommelier.db`; on Vercel use a free Turso database.

**Deploy for free (Vercel + Turso + Google):** step-by-step guide in Turkish → [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Free mode ($0)

Everything below runs without paying for anything:

| Part | Service | Cost |
|---|---|---|
| Understanding requests & edits | Built-in TR/EN rule parser | Free (no LLM key needed) |
| Playlist engine, DNA, flow, shuffle, replace, edit | Local code | Free |
| Database | SQLite file locally / Turso on Vercel (libSQL) | Free (Turso free plan, no card) |
| Hosting | Vercel Hobby | Free |
| Save to a streaming account | **YouTube Music** via YouTube Data API v3 | Free (Google Cloud project, no billing; 10k quota units/day) |
| 30-second previews, BPM | Deezer public API | Free, no key |
| Tempo/key fallback | GetSongBPM | Free key (backlink required) |
| Export | TXT / CSV / M3U / JSON, share links | Free |

Paid, optional — the code stays but nothing needs them:
**Spotify** (2026 Dev Mode requires the app owner to have Premium), **Apple Music** (Apple Developer Program, $99/yr),
**Claude API** (pay per use). ReccoBeats itself is free but needs Spotify IDs, so measured energy/valence only arrive with Spotify credentials.

Everything works **without any API keys** (public mode, rule-based TR/EN intent parser, local catalog, exports).
Optional keys unlock more:

| Env | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Claude for rich/ambiguous requests, free-form edits, curation beyond the catalog (verified before export) |
| `SPOTIFY_CLIENT_ID` (+ `SPOTIFY_CLIENT_SECRET`) | Connect account, availability check, create playlist on Spotify (Feb-2026 API) |
| `APPLE_MUSIC_*` | Apple Music availability + Connect (MusicKit JS) + save to library |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (+ `YOUTUBE_API_KEY`) | Connect YouTube, availability check, save to YouTube Music (YouTube Data API v3; ~6k of the 10k daily quota units per 40-track playlist) |
| `GETSONGBPM_API_KEY` | Tempo/key fallback for catalog enrichment |
| `SOMMELIER_LLM_MODE` | `always` (default: Claude reads every request/edit) or `auto` (only rich/ambiguous ones) |

### Growing the catalog with measured features

Spotify no longer exposes audio features, so the engine enriches tracks itself:
Spotify ID → **ReccoBeats** (energy, valence, danceability, tempo, key, popularity; keyless) → **GetSongBPM** (tempo/key) → **Deezer** (BPM).
Every step is optional and fail-safe.

```bash
npm run catalog:enrich               # measure the seed catalog → src/lib/catalog/enriched.json (commit it)
npm run catalog:grow -- tracks.txt   # add tracks: "Artist - Title | genre,genre | tags | lang"
```

AI-curated and imported tracks are enriched automatically (time-boxed by `ENRICH_BUDGET_MS`).

### Languages

The interface is bilingual (Türkçe / English) with a toggle in the header; the first visit follows the browser language.
Sommelier replies follow the language of each request.

## What's in the MVP

- **Sommelier mode** (natural language + chips) and **Expert mode** (all sliders)
- Smart, minimal questions (≤2, always skippable — "AI yormasın")
- Editable **brief** chips: duration, language, era, energy/dance/happiness/nostalgia/popularity/discovery, flow + peak, shuffle, explicit, repetition
- **Engine:** hard filters → scoring → diversity & quotas → duration fit (±2.5 %, "tam" = ±1 min) → simulated-annealing ordering (flow + transitions + artist spacing + opener/finale) → roles
- Transition scores (Expert), **shuffle-friendliness**, **Playlist DNA**, flow chart (target vs actual)
- 👍 ❤️ 👎 🚫 🔄 📌 ✕ per track; dislike → same-role alternative nudged in the right direction
- Natural-language editing & **Make it…** presets that *preserve* the playlist (diff reported), undo
- Sommelier suggestions ("2000–2003'ten 4 şarkı eklememe izin verir misin?" → Allow / Keep strictly 90s)
- Include / exclude (artists, tracks, genres, tags)
- Platform matching (✓ / ⚠ alternative / ✕) — never silently substitutes; alternatives need approval
- Spotify OAuth (PKCE) + push, export TXT/CSV/M3U/JSON, public share links `/p/:id` + remix
- Taste model (transparent, pause, reset), import + DNA + reference playlists, Music Theme, weekly reflection, journal, gentle stats
- Privacy: delete all data; OAuth tokens AES-256-GCM encrypted; signed httpOnly cookies

## Placeholders (explicit)

- YouTube Music has no official API of its own; saving uses the YouTube Data API v3 (playlists appear in YouTube Music). Quota-bound.
- Seed catalog (~230 tracks) metadata are **editorial estimates**; production should enrich via a features API

## Layout

```
src/lib/engine      platform-independent playlist engine (pure, tested)
src/lib/ai          intent parser (rules), question planner, edit planner, optional Claude layer
src/lib/taste       taste model, feedback processor, music theme
src/lib/providers   MusicProvider adapters (Spotify, Apple, YouTube, Deezer) + matcher
src/lib/server      services, repository (SQLite), session, crypto
src/app             Next.js pages + /api routes
```
