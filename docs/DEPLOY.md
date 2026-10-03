# Kurulum ve yayınlama (ücretsiz)

Hepsi ücretsiz, kredi kartı gerekmez: **Vercel Hobby** (barındırma) + **Turso Free** (veritabanı) + **Google Cloud** (YouTube Data API).

## 1. Kendi bilgisayarında çalıştır

Gereken: Node.js 20.9+ ve git.

```bash
git clone https://github.com/bertkaya/calbiseyler
cd calbiseyler
git checkout claude/ai-music-sommelier-1ig25r   # PR birleşince: main
npm install
cp .env.example .env
npm run dev
```

http://127.0.0.1:3000 adresini aç. Yerelde veriler `data/sommelier.db` dosyasında tutulur, ek bir şey gerekmez.
`.env` içinde sadece `APP_SECRET`'ı doldurman yeterli:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 2. Turso veritabanı (Vercel için gerekli)

Vercel'in dosya sistemi kalıcı olmadığı için verileri Turso'da tutuyoruz. Turso SQLite uyumlu; kod değişmeden çalışır.

1. https://turso.tech adresinde GitHub ile ücretsiz hesap aç (kart istemez).
2. Yeni veritabanı oluştur (ör. `sommelier`, bölge: Avrupa — Frankfurt).
3. Veritabanı sayfasından şunları al:
   - **URL**: `libsql://sommelier-<kullanıcı>.turso.io` → `DATABASE_URL`
   - **Token** ("Create Token", okuma+yazma) → `DATABASE_AUTH_TOKEN`

Tablolar ilk istekte otomatik oluşturulur.

## 3. Vercel'e yükle

1. https://vercel.com adresinde GitHub ile ücretsiz **Hobby** hesap aç.
2. **Add New → Project → `bertkaya/calbiseyler`** reposunu içe aktar. Framework: Next.js (otomatik).
3. PR henüz birleşmediyse: Settings → Git → **Production Branch** = `claude/ai-music-sommelier-1ig25r`. Birleştiyse `main` kalsın.
4. **Environment Variables**:

| Değişken | Değer |
|---|---|
| `APP_SECRET` | yukarıda ürettiğin değer (yerelle aynı olmak zorunda değil) |
| `DATABASE_URL` | Turso URL'si |
| `DATABASE_AUTH_TOKEN` | Turso token'ı |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 4. adımdan (isteğe bağlı) |
| `YOUTUBE_API_KEY` | isteğe bağlı |
| `GETSONGBPM_API_KEY` | isteğe bağlı |

`APP_URL` gerekmez; Vercel alan adı otomatik kullanılır. Özel alan adı bağlarsan `APP_URL=https://alanadin.com` ekle.

5. **Deploy**. Adresin `https://<proje>.vercel.app` olur.

## 4. YouTube Music'e kaydetme (isteğe bağlı, ücretsiz)

1. https://console.cloud.google.com → yeni proje (faturalandırma hesabı gerekmez).
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **OAuth consent screen**: External, uygulama adı "Sommelier", **Test users**'a kendi Gmail adresini ekle (Test modunda kalabilir).
4. **Credentials → Create credentials → OAuth client ID → Web application**. *Authorized redirect URIs*:
   - `http://127.0.0.1:3000/api/auth/google/callback` (yerel)
   - `https://<proje>.vercel.app/api/auth/google/callback` (Vercel)
5. Client ID ve Secret'ı `.env`'e ve Vercel'e ekle, Vercel'de **Redeploy** et.

Kota: günde 10.000 birim; 40 şarkılık bir playlist yaklaşık 6.000 harcar.

## Ücretli olduğu için kapalı olanlar

Spotify (geliştirici uygulaması sahibinin Premium olması gerekiyor), Apple Music (99$/yıl), Claude API (kullanım başına).
Kodda duruyorlar; ilgili değişkenler boş kaldıkça arayüzde "yapılandırılmamış" görünürler.

## Sorun giderme

- **"DATABASE_URL is required on Vercel"** → 2. adımdaki değişkenler eksik.
- **"APP_SECRET must be set"** → Vercel'de `APP_SECRET` ekle (en az 32 karakter).
- **Google "redirect_uri_mismatch"** → 4. adımdaki adresin birebir aynı olduğundan emin ol (sonda `/` yok).
- **Google "access blocked / app not verified"** → Gmail adresini OAuth consent screen'de *Test users*'a ekle.
