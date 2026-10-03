"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HydratedPlaylist } from "@/lib/server/playlists";
import { api, ApiError } from "./api";
import { DNABars, Seg, Toast } from "./ui";
import { useT } from "./LangProvider";

export function ImportClient() {
  const router = useRouter();
  const { t, lang } = useT();
  const [tab, setTab] = useState<"text" | "spotify">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pl, setPl] = useState<HydratedPlaylist | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dur, setDur] = useState(120);
  const [ask, setAsk] = useState("");

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await api<{ playlist: HydratedPlaylist }>("/api/import", { method: "POST", body: tab === "text" ? { name, text } : { name, url } });
      setPl(r.playlist);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToast(t("imp.connectFirst"));
      else setToast(e instanceof ApiError ? e.message : t("imp.failed"));
    } finally { setBusy(false); }
  };

  const remake = async (prompt: string, overrides: Record<string, unknown>) => {
    if (!pl) return;
    setBusy(true);
    try {
      const r = await api<{ status: string; playlist?: { id: string } }>("/api/playlists", { method: "POST", body: { prompt, overrides: { durationMin: dur, ...overrides }, referencePlaylistIds: [pl.id], skipQuestions: true, uiLang: lang } });
      if (r.playlist) router.push(`/playlist/${r.playlist.id}`);
    } catch (e) { setToast(e instanceof ApiError ? e.message : t("imp.failed")); setBusy(false); }
  };
  const e10 = pl ? pl.dna.energy / 10 : 6;
  const n10 = pl ? pl.dna.nostalgia / 10 : 5;

  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">{t("imp.eyebrow")}</p>
        <h1 className="display pl-title">{t("imp.title")}</h1>
        <p className="muted" style={{ maxWidth: 620 }}>{t("imp.lede")}</p>
      </section>
      <div className="grid-2 section">
        <div className="card pad stack">
          <Seg value={tab} onChange={setTab} options={[{ value: "text", label: t("imp.paste") }, { value: "spotify", label: t("imp.spotify") }]} />
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("imp.name")} />
          {tab === "text" ? (
            <textarea className="textarea" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Tarkan - Şımarık\nSezen Aksu - Hadi Bakalım\nMFÖ - Ele Güne Karşı"} />
          ) : (
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" />
          )}
          <button className="btn btn-primary" disabled={busy || (tab === "text" ? !text.trim() : !url.trim())} onClick={doImport}>{busy ? t("imp.analysing") : t("imp.analyse")}</button>
          {tab === "spotify" && <p className="tiny faint">{t("imp.spotifyNote")}</p>}
        </div>
        <aside className="stack">
          {pl ? (
            <>
              <div className="card pad">
                <span className="eyebrow">{pl.title} · {pl.items.length} {t("pl.tracks")}</span>
                <div style={{ marginTop: 10 }}><DNABars dna={pl.dna} /></div>
                <p className="small mono" style={{ marginTop: 10 }}>{t("dna.energy")} {e10.toFixed(1)} · {t("dna.nostalgia")} {n10.toFixed(1)} · {t("dna.dance")} {(pl.dna.dance / 10).toFixed(1)} · {t("dna.mainstream")} {(pl.dna.mainstream / 10).toFixed(1)}</p>
                {pl.warnings.map((w) => <p key={w} className="tiny faint">{w}</p>)}
              </div>
              <div className="card pad stack">
                <span className="eyebrow">{t("imp.newVersion")}</span>
                <Seg value={String(dur) as "60" | "120" | "180"} onChange={(v) => setDur(Number(v))} options={[{ value: "60", label: "1h" }, { value: "120", label: "2h" }, { value: "180", label: "3h" }]} />
                <div className="chips">
                  <button className="chip" disabled={busy} onClick={() => remake(lang === "en" ? "A more energetic version of this" : "Bunun daha enerjik versiyonu", { energy: Math.min(10, e10 + 1.5), danceability: Math.min(10, pl.dna.dance / 10 + 1) })}>{t("imp.moreEnergetic")}</button>
                  <button className="chip" disabled={busy} onClick={() => remake(lang === "en" ? "A more nostalgic version of this" : "Bunun daha nostaljik versiyonu", { nostalgia: Math.min(10, n10 + 2.5) })}>{t("imp.moreNostalgic")}</button>
                  <button className="chip" disabled={busy} onClick={() => remake(lang === "en" ? "A more modern version of this" : "Bunun daha modern versiyonu", { nostalgia: Math.max(1, n10 - 3) })}>{t("imp.moreModern")}</button>
                  <button className="chip" disabled={busy} onClick={() => remake(lang === "en" ? "Like this but surprise me" : "Bunun gibi ama beni şaşırt", { discovery: 40 })}>{t("imp.surprise")}</button>
                  <button className="chip" disabled={busy} onClick={() => remake(lang === "en" ? "Like this, 70% Turkish" : "Bunun gibi, Türkçe %70", { turkishShare: 0.7 })}>{t("imp.turkish70")}</button>
                </div>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) remake(ask, {}); }}>
                  <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("imp.askPh")} />
                  <button className="btn btn-primary" disabled={busy || !ask.trim()}>{t("imp.go")}</button>
                </form>
              </div>
            </>
          ) : (
            <div className="card empty">{t("imp.empty")}</div>
          )}
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
