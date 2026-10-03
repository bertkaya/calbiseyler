# AI Music Sommelier — Product & Technical Architecture

> "AI that understands *why* you want music and designs the listening experience around it."
> Bir playlist şarkı listesi değil, bir **deneyimdir**.

Bu doküman, master build prompt'un 53. maddesinde istenen 10 başlığı ve risk analizini içerir.
Kod tabanı bu dokümanla birebir eşleşir; her bölümde ilgili dosyalar belirtilmiştir.

---

## 1. Product Architecture

```
┌────────────────────────────── Web App (Next.js App Router) ─────────────────────────────┐
│  Home (Sommelier / Expert)   Playlist Studio   Public share /p/:id   Taste & Theme   Import │
└───────────────┬─────────────────────────────────────────────────────────────────────────┘
                │ JSON API (/api/*) — API-first; aynı API ileride iOS/Android/PWA'ya hizmet eder
┌───────────────▼─────────────────────────────────────────────────────────────────────────┐
│                               Application services                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │Intent Parser│→ │Music Curator │→ │Playlist Engineer │→ │Transition Opt.│→ │Explainer │ │
│  │rules + LLM  │  │candidates    │  │flow, roles, dur. │  │annealing      │  │          │ │
│  └─────────────┘  └──────────────┘  └──────────────────┘  └───────────────┘  └──────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐                                  │
│  │Taste Model  │  │Feedback Proc.│  │Platform Matcher  │                                  │
│  └─────────────┘  └──────────────┘  └──────────────────┘                                  │
└───────────────┬───────────────────────────────┬─────────────────────────────────────────┘
                │                               │
     ┌──────────▼─────────┐        ┌────────────▼──────────────────────────────────┐
     │ SQLite (node:sqlite)│        │ MusicProvider adapters                        │
     │ users, playlists,   │        │  Catalog (local, metadata-rich) · Deezer      │
     │ feedback, taste ... │        │  Spotify · Apple Music · YouTube Music · ...  │
     └─────────────────────┘        └───────────────────────────────────────────────┘
```

**Temel kararlar**

| Karar | Neden |
|---|---|
| Playlist engine provider'dan bağımsız (`src/lib/engine`) | Aynı algoritma Spotify, Apple, YouTube için çalışır; provider yalnızca *eşleme* ve *kaydetme* yapar. |
| Kendi metadata katmanımız (`src/lib/catalog`) | Spotify Audio Features (Kasım 2024) ve `popularity` alanı (Şubat 2026) kaldırıldı. Akış mühendisliği için gereken enerji/BPM/dans verisini kendimiz tutmak zorundayız. |
| LLM yalnızca anlam gerektiren yerde | Niyet çözümleme, belirsiz doğal dil düzenlemeleri, isteğe bağlı küratörlük. Skorlama, sıralama, süre ve shuffle **deterministik** koddur (ucuz, hızlı, test edilebilir). |
| Kural tabanlı parser her zaman çalışır | `ANTHROPIC_API_KEY` yoksa da uygulama tam işlevseldir (fail-safe). |
| Public mode varsayılan | Hesap bağlamadan üret, düzenle, DNA gör, değiştir, paylaş. Yalnızca platforma kaydetmek için OAuth. |

**Ana akış (pipeline)** — `src/lib/engine/generate.ts`

```
USER INTENT → PLAYLIST BRIEF → CANDIDATE GENERATION → FILTERING → SCORING → DIVERSITY
→ FLOW OPTIMIZATION → TRANSITION OPTIMIZATION → DURATION FIT → FINAL ORDER → PLATFORM MATCHING
```

---

## 2. Recommended Tech Stack

| Katman | Seçim | Gerekçe |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | SSR + API route'ları tek repoda; PWA'ya kolay geçiş; React Native'e paylaşılabilir domain kodu (`src/lib` framework'süz). |
| Stil | Saf CSS + design tokens (`globals.css`) | Kendi kimliği; ağır UI kit yok; light/dark. |
| API | Next.js Route Handlers (`/api/*`), JSON | API-first. Mobil uygulama aynı endpoint'leri kullanır. |
| DB (MVP) | **SQLite — Node 22 yerleşik `node:sqlite`** | Sıfır native bağımlılık. `src/lib/db` tek bir repository katmanı arkasında; Postgres'e geçiş yalnızca bu katmanı etkiler. |
| DB (ölçek) | PostgreSQL + `pgvector` | Büyük katalogda embedding tabanlı aday üretimi, çok kullanıcı. |
| AI | **Anthropic Claude (`@anthropic-ai/sdk`)**, structured outputs (Zod) | Niyet → JSON brief; sunucu taraflı refusal fallback. |
| Test | Vitest | Engine saf fonksiyonlardan oluşur → hızlı birim testleri. |
| Secrets | `.env` (`.env.example` şablon) | Hiçbir anahtar koda gömülmez. OAuth token'ları AES-256-GCM ile şifreli saklanır. |

---

## 3. Music API / Provider Seçenekleri

| Provider | Ne verir | Auth | Not |
|---|---|---|---|
| **Spotify Web API** | Arama, playlist oluşturma/okuma | OAuth (PKCE/Code), Client Credentials | Audio features & `popularity` **yok** (aşağıya bkz). Dev mode: 5 kullanıcı. |
| **Apple Music API** | Katalog arama, kütüphaneye playlist | Developer token (JWT ES256, .p8) + MusicKit user token | Apple Developer Program ($99/yıl). |
| **YouTube Data API v3** | YouTube (Music dahil) playlist oluşturma | Google OAuth | YouTube Music'in resmi API'si yok. Quota: 10.000 birim/gün, `search` = 100 birim → ~100 arama/gün. |
| **Deezer API** | Arama, 30 sn preview, `bpm`, `gain` (track endpoint) | Public arama key'siz | Public mode preview ve doğrulama için ideal. Yeni OAuth app kaydı kapalı. |
| **ReccoBeats / GetSongBPM** | Audio-feature benzeri veriler (BPM, energy, key) | API key | Spotify audio-features boşluğunu doldurmak için aday. |
| **MusicBrainz / ListenBrainz** | Kanonik kimlik (ISRC/MBID), yıl, ilişki; ListenBrainz benzer kayıt | Key'siz (rate limit) | Cross-platform eşleştirmede ISRC çok değerli. |
| **Last.fm** | Tag'ler, benzer sanatçı/şarkı, dinleme geçmişi | API key | Tür/mood tag'leri için. |
| **Fizy / Muud (TR)** | Türkiye kataloğu | Public API yok | Bölgesel ama entegrasyon şu an mümkün değil. |
| **Tidal / Deezer OAuth / SoundCloud** | Playlist kaydı | OAuth | Phase 3 adayları. |

**Öneri:** Kanonik kimlik = ISRC (MusicBrainz), metadata = kendi katalog + ReccoBeats/GetSongBPM/Deezer BPM,
kayıt hedefi = Spotify (MVP) → Apple Music → YouTube.

---

## 4. Spotify / Apple Music / YouTube Music — Entegrasyon Gerçekleri (Ekim 2026)

### Spotify
- **Kasım 2024:** Yeni uygulamalar için `audio-features`, `audio-analysis`, `recommendations`, `related-artists`, editoryal playlistler kapatıldı.
- **Şubat 2026 Dev Mode değişiklikleri** (mevcut uygulamalar 9 Mart 2026'da taşındı):
  - `POST /users/{id}/playlists` **kaldırıldı → `POST /me/playlists`**
  - `/playlists/{id}/tracks` → **`/playlists/{id}/items`** (GET ve POST)
  - Track/artist/album nesnelerinden `popularity`, `available_markets`, artist `genres`/`followers` kaldırıldı.
  - `GET /search` `limit` maksimumu 50 → **10**.
  - Development mode: uygulama sahibinin **Premium** üyeliği şart, **5 kullanıcı** sınırı, geliştirici başına 1 client ID.
  - Extended Quota: Mayıs 2025'ten beri yalnızca tüzel kişiler ve yüksek MAU eşiği.
- **Sonuç:** Spotify bir *metadata kaynağı* değil, bir *hedef platformdur*. Kod bu gerçeğe göre yazıldı (`src/lib/providers/spotify.ts`).

### Apple Music
- MusicKit JS + Developer Token (ES256 JWT, en fazla 6 ay geçerli) + kullanıcı başına Music User Token.
- Katalog araması sadece developer token ile çalışır → public mode eşleştirme mümkün.
- Playlist oluşturma: `POST /v1/me/library/playlists` (user token gerekir).
- Audio feature yok; ISRC ile eşleştirme mümkün (`filter[isrc]`).

### YouTube Music
- Resmi API yok. `ytmusicapi` gibi gayri resmi kütüphaneler ToS riski taşır → **kullanılmaz**.
- YouTube Data API v3 ile oluşturulan playlist YouTube Music'te görünür. Quota çok dar: aramayı önbelleğe almak şart.
- Uygulandı: Data API v3 ile kayıt (`src/lib/providers/youtube.ts`). 40 şarkılık playlist ≈ 6.050 kota birimi; eşlemeler 30 gün cache'lenir.

---

## 5. AI Architecture

Tek dev prompt yok. Mantıksal servisler (`src/lib/ai`, `src/lib/engine`, `src/lib/taste`):

| Servis | Dosya | LLM? | Görev |
|---|---|---|---|
| **Intent Parser** | `ai/intent-rules.ts`, `ai/intent.ts`, `ai/llm.ts` | Opsiyonel | Doğal dil → `PlaylistBrief`. Önce kural tabanlı (TR/EN lexicon, süre, dönem, tür, olumsuzlama, sanatçı tanıma). LLM varsa structured output ile zenginleştirir; kural sonuçları (katalog eşleşmeleri) korunur. |
| **Question Planner** | `ai/questions.ts` | Hayır | Sadece *önemli ve belirsiz* bilgi için ≤2 soru. Yeterli bilgi varsa hiç sormaz. |
| **Music Curator** | `engine/candidates.ts`, `ai/llm.ts#curate` | Opsiyonel | Katalogdan aday havuzu; LLM varsa katalog dışı öneriler (provider'da doğrulanır, doğrulanmazsa işaretlenir). |
| **Playlist Engineer** | `engine/flow.ts`, `engine/select.ts`, `engine/roles.ts` | Hayır | Enerji eğrisi, roller, çeşitlilik, süre. |
| **Transition Optimizer** | `engine/transition.ts`, `engine/order.ts` | Hayır | A→B geçiş skoru + simulated annealing. |
| **Taste Model** | `taste/model.ts` | Hayır | Şeffaf, durdurulabilir, sıfırlanabilir tercih profili. |
| **Feedback Processor** | `taste/feedback.ts` | Hayır | Like/dislike/never/replace/remove → profil güncellemesi + yön (ör. "daha az slow"). |
| **Edit Interpreter** | `ai/edit-rules.ts` | Opsiyonel | "İlk 30 dk daha sakin", "Tarkan kalsın Sezen olmasın" → `BriefPatch`. Kural bulamazsa LLM. |
| **Platform Matcher** | `providers/matcher.ts` | Hayır | Başlık/sanatçı/süre benzerliği ile eşleme; alternatifleri kullanıcı onayına sunar, **sessizce değiştirmez**. |
| **Explainer** | `engine/explain.ts` | Hayır (şablon) | "Why this playlist?" kısa açıklama. |

**AI maliyet politikası:** Bir playlist üretimi en fazla 1 (parse) + 1 (opsiyonel curate) LLM çağrısı. Düzenleme,
değiştirme, geri bildirim, shuffle, DNA, eşleme → 0 LLM çağrısı (kural bulamayan serbest düzenlemeler hariç).

---

## 6. Database Schema

`src/lib/db/schema.ts` — SQLite, Postgres'e taşınabilir tipler.

```
users(id PK, created_at, display_name, learning_paused INT, settings JSON)
taste_profiles(user_id PK→users, data JSON, updated_at)            -- artist/genre/tag affinities, feature bias
themes(id PK, user_id→users, statement, principles JSON, discovery INT, created_at, updated_at)
playlists(id PK, user_id→users, title, prompt, brief JSON, interpretation, explanation,
          dna JSON, stats JSON, saved INT, share_id UNIQUE, parent_id, created_at, updated_at)
playlist_tracks(playlist_id→playlists, position, track_id, role, transition_in REAL,
                locked INT, PRIMARY KEY(playlist_id, position))
music_tracks(id PK, source, title, artist, year, duration_sec, features JSON, genres JSON,
             language, explicit INT, tags JSON, isrc, created_at)    -- AI/import/provider kaynaklı katalog dışı parçalar
artists(id PK, name, normalized, genres JSON)                        -- seed katalogdan türetilir
music_providers(id PK, name, kind, enabled)                          -- spotify|apple|youtube|deezer|catalog
provider_connections(user_id, provider, access_token_enc, refresh_token_enc, expires_at,
                     account_id, scope, PRIMARY KEY(user_id, provider))
provider_matches(track_id, provider, status, provider_track_id, url, confidence, alt JSON,
                 checked_at, PRIMARY KEY(track_id, provider))        -- eşleme cache'i
feedback(id PK, user_id, playlist_id, track_id, artist, kind, context JSON, created_at)
playlist_sessions(id PK, playlist_id, kind, input, summary, snapshot JSON, created_at)  -- düzenleme geçmişi + undo
journal_entries(id PK, user_id, playlist_id, text, signals JSON, created_at)
```

Seed katalog (`src/lib/catalog/seed.ts`) koddadır (versiyonlanır); `music_tracks` yalnızca dinamik parçaları tutar.

---

## 7. MVP Scope

**Bu repoda çalışır durumda (MVP):** Doğal dil isteği · süre · mood · tür · dönem · dil · enerji · explicit ·
include/exclude (sanatçı/şarkı/tür/etiket) · sıralama · geçiş optimizasyonu · shuffle-friendly · Playlist DNA ·
rol koruyan şarkı değiştirme · doğal dil düzenleme ("Make it…" dahil) · Spotify entegrasyonu (OAuth, eşleme, kayıt) ·
public mode · kaydet/çoğalt/paylaş/export · Sommelier & Expert mode · akıllı (az) soru · sommelier önerileri (Allow/Keep) ·
Why this playlist · undo.

**Phase 2'den erken eklenenler (hafif sürümler):** Taste learning (pause/reset) · Surprise me (discovery %) ·
metin/Spotify playlist import + DNA · referans playlist(ler) · müzik günlüğü · Music Theme · nazik gamification ·
Deezer preview · Apple Music arama/eşleme (token varsa).

**v2'de eklenenler:** Özellik zenginleştirme hattı (ReccoBeats → GetSongBPM → Deezer) + `catalog:enrich` / `catalog:grow` CLI ·
LLM varsayılan mod (`SOMMELIER_LLM_MODE=always`) · Apple Music bağlantısı (MusicKit JS) ve kütüphaneye kayıt · TR/EN çift dilli arayüz.

**v3:** YouTube Music kaydı — YouTube Data API v3 + Google OAuth (PKCE, offline), resmi ses (Topic/VEVO) öncelikli eşleme, 30 gün eşleme cache'i, kota tahmini.

**Açıkça placeholder olanlar:** listening behavior (skip/replay) — API'ler izin vermediği için yok.

---

## 8. UI Structure

```
/                 Home — tek büyük input, Mood/Activity/Duration chip'leri, Sommelier ↔ Expert,
                  (gerekirse) 1-2 soru kartı, son playlistler, referans seçimi
/playlist/:id     Studio — başlık + DNA şeritleri, Sommelier yorumu, Brief chip'leri (tıkla→slider),
                  FLOW grafiği (hedef eğri vs gerçek), parça listesi (rol, enerji, geçiş %, aksiyonlar),
                  Make it…, doğal dil düzenleme, Include/Exclude, Platform paneli, Why?, Journal
/p/:shareId       Public, salt-okunur paylaşım sayfası (+ "Remix this")
/import           Metin/Spotify linki → DNA → "2 saatlik daha enerjik versiyon"
/me               Taste profile (şeffaf), Pause/Reset, Music Theme, Journal, istatistikler, bağlı hesaplar, veriyi sil
```

---

## 9. Playlist Scoring Model

Her aday parça için brief'e uyum skoru `fit ∈ [0,1]` (`engine/scoring.ts`):

```
fit = Σ wᵢ·sᵢ / Σ wᵢ     (yalnızca verisi olan bileşenler; veri yoksa bileşen atlanır → graceful degradation)

s_genre      = max_g∈brief  genreSimilarity(track.genres, g)            w=3.0  (tür grafiği, 0..1)
s_era        = 1 içinde; dışında exp(-(mesafe/5)²)                      w=2.0
s_language   = tr payı hedefi ile uyum                                   w=2.5
s_mood       = valence/energy/acoustic → mood prototiplerine yakınlık    w=2.0
s_energy     = 1 - |energy - target|                                     w=1.5  (pozisyona özel uyum sıralamada)
s_dance      = 1 - |dance - target|                                      w=1.0
s_mainstream = 1 - |popularity - target|                                 w=1.5
s_nostalgia  = yaş(yıl) ve 'classic' etiketinden nostalji ↔ hedef        w=1.5
s_tags       = singalong/anthem bonusu, 'avoid' etiket cezası            w=1.0..2.0

final = fit + taste_boost(±0.25) + reference_similarity·0.3 + focus_artist·0.25 + keep_bonus (düzenlemede)
```

**Geçiş skoru** `transition(A,B) ∈ [0,1]` (`engine/transition.ts`):

```
bpm      : oran (yarım/çift tempo dahil) → |Δ|≤4%:1, 4–8%:0.8, 8–15%:0.5, sonra azalır   w=1.5
key      : Camelot uyumu (aynı/±1/relative)                                             w=0.8 (veri varsa)
energy   : 1 - |ΔE|·1.6 ; sert DÜŞÜŞ ekstra ceza                                         w=2.0
genre    : genreSimilarity                                                             w=1.8
era      : exp(-(Δyıl/12)²)                                                            w=0.8
valence  : 1 - |ΔV|                                                                    w=0.7
language : aynı 1, farklı 0.7                                                          w=0.5
```

**Shuffle uyumu** = rastgele sıralamada ardışık iki parçanın beklenen uyumu ≈ tüm çiftlerin
*cohesion* skorlarının ortalaması (BPM hariç: shuffle'da tempo eşlemesi anlamsız) ile en kötü %10'luk dilimin karışımı.

---

## 10. Playlist Optimization Algorithm

`engine/generate.ts` — deterministik (seed'li RNG), O(n²·iter), n≤120 için <50 ms.

1. **Brief normalize** — varsayılanlar, aktivite profilleri (parti/yemek/rakı/düğün…), tema, taste bias.
2. **Hard filter** — exclude (sanatçı/şarkı/tür/etiket), never-play, explicit, katı dil/dönem.
3. **Scoring** — §9.
4. **Sommelier önerisi** — Havuz süresi hedefin ~1.3 katından azsa kısıtı gevşetme önerisi üret
   (ör. "2000–2003'ten 4 şarkı"); kullanıcı *Allow / Keep strict* der.
5. **Selection (Diversity + Duration)** — Greedy: skor sırasıyla ekle; sanatçı limiti (tekrar ayarı, focus sanatçılar hariç),
   tür kotaları (çoklu tür isteğinde orantılı), discovery kotası. Must-include parçalar önce kilitlenir.
6. **Duration fit** — Toplam hedefe yaklaşana kadar swap/ekle/çıkar local search; tolerans normalde ±%3 (min ±3 dk),
   "tam" denildiyse ±1 dk.
7. **Flow** — Hedef eğri `E(t)`, t∈[0,1] (flat, gradual rise, party curve, rollercoaster, peak early/late, custom +
   segment override'ları, ör. "ilk 30 dk sakin"). Kullanıcının enerji seviyesi eğrinin ortasını belirler.
8. **Initial order** — Rank matching: slot hedef enerjileri ile parça enerjileri sıra bazında eşlenir.
9. **Transition optimization** — Simulated annealing (swap + segment-reverse hamleleri). Amaç fonksiyonu:
   `Σ flowErr² · wF + Σ (1-transition) · wT + aynı-sanatçı-yakınlığı · wA + rol uyumu (opener/finale) · wR`.
   Shuffle modunda wT düşük, eğri düzleştirilir; seçimde cohesion ağırlığı artar.
10. **Roles** — Eğri konumundan: Opener, Warm-up, Builder, Sing-along, Bridge, Peak, Reset, Cooldown, Finale.
11. **Platform matching** — Hedef platformda ✓ / ⚠ alternatif / ✕ yok; alternatif **onayla** değiştirilir.

**Replace (rol koruyan):** aynı slot için `fit + slotEnergyFit + transition(prev,·) + transition(·,next) + rolEtiketi + benzerlik(eski)`,
dislike ise eski parçanın "neden sevilmediği" yönünde kaydırma (ör. slow → daha enerjik).

**Edit (koruyarak):** Brief patch uygulanır, mevcut parçalara `keep_bonus` verilir → minimum değişiklik; diff (kalan/eklenen/çıkan) raporlanır.

---

## Riskler ve Zor Kısımlar

| Risk | Seviye | Etki | Azaltma |
|---|---|---|---|
| **Audio feature verisinin yokluğu** (Spotify kapattı) | 🔴 Yüksek | Akış kalitesi metadata'ya bağlı | Kendi kürasyonlu katalog (değerler editoryal tahmin), ReccoBeats/GetSongBPM/Deezer BPM entegrasyonu, LLM tahmini "estimated" etiketiyle. |
| **Spotify Dev Mode 5 kullanıcı + Premium** | 🔴 Yüksek | Halka açık lansman engeli | Extended quota başvurusu (tüzel kişi), public mode + export (M3U/TXT) ile değer sunmak. |
| **Katalog kapsamı** (seed ~250 parça) | 🟠 Orta | Uzun/niş isteklerde tekrar | LLM curator + provider doğrulama; ileride MusicBrainz + feature API ile katalog büyütme pipeline'ı. |
| **Cross-platform eşleştirme hatası** (remaster/live/cover) | 🟠 Orta | Yanlış versiyon | ISRC öncelikli eşleme, süre toleransı, ⚠ alternatif onayı. |
| **YouTube quota** | 🟠 Orta | Günlük ~100 arama | Agresif cache, kullanıcıya bağlı OAuth quota yok → Phase 2. |
| **LLM halüsinasyonu** (olmayan şarkı) | 🟠 Orta | Güven kaybı | Katalog dışı her öneri provider'da doğrulanır; doğrulanmayan "unverified" görünür ve platforma gönderilmez. |
| **Kültürel nüans** (arabesk ≠ fantezi, "cheesy") | 🟡 Düşük-Orta | Yanlış yorum | Etiket sistemi (`cheesy`, `arabesk`, `slow`), kullanıcı düzeltmesi + taste model. |
| **Apple Music developer hesabı** | 🟡 Düşük | Maliyet/onay | Phase 2. |
| **Kişisel veri** | 🟡 | KVKK/GDPR | Öğrenmeyi durdur, sıfırla, tüm veriyi sil; token'lar şifreli. |
