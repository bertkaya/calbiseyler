"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HydratedPlaylist } from "@/lib/server/playlists";
import { api, ApiError } from "./api";
import { DNABars, Seg, Toast } from "./ui";

export function ImportClient() {
  const router = useRouter();
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
      if (e instanceof ApiError && e.status === 401) setToast("Connect Spotify (Taste page) to import private playlists.");
      else setToast(e instanceof ApiError ? e.message : "Import failed");
    } finally { setBusy(false); }
  };

  const remake = async (prompt: string, overrides: Record<string, unknown>) => {
    if (!pl) return;
    setBusy(true);
    try {
      const r = await api<{ status: string; playlist?: { id: string } }>("/api/playlists", { method: "POST", body: { prompt, overrides: { durationMin: dur, ...overrides }, referencePlaylistIds: [pl.id], skipQuestions: true } });
      if (r.playlist) router.push(`/playlist/${r.playlist.id}`);
    } catch (e) { setToast(e instanceof ApiError ? e.message : "Failed"); setBusy(false); }
  };
  const e10 = pl ? pl.dna.energy / 10 : 6;
  const n10 = pl ? pl.dna.nostalgia / 10 : 5;

  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">Playlist import</p>
        <h1 className="display pl-title">Bring a playlist. Get its DNA.</h1>
        <p className="muted" style={{ maxWidth: 620 }}>Paste a track list or a Spotify playlist link. I&apos;ll analyse its character, then design new versions from it — “bunun 2 saatlik daha enerjik versiyonu”.</p>
      </section>
      <div className="grid-2 section">
        <div className="card pad stack">
          <Seg value={tab} onChange={setTab} options={[{ value: "text", label: "Paste list" }, { value: "spotify", label: "Spotify link" }]} />
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
          {tab === "text" ? (
            <textarea className="textarea" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Tarkan - Şımarık\nSezen Aksu - Hadi Bakalım\nMFÖ - Ele Güne Karşı"} />
          ) : (
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" />
          )}
          <button className="btn btn-primary" disabled={busy || (tab === "text" ? !text.trim() : !url.trim())} onClick={doImport}>{busy ? "Analysing…" : "Analyse"}</button>
          {tab === "spotify" && <p className="tiny faint">Spotify&apos;s 2026 rules only allow reading playlists you own or collaborate on, via a connected account.</p>}
        </div>
        <aside className="stack">
          {pl ? (
            <>
              <div className="card pad">
                <span className="eyebrow">{pl.title} · {pl.items.length} tracks</span>
                <div style={{ marginTop: 10 }}><DNABars dna={pl.dna} /></div>
                <p className="small mono" style={{ marginTop: 10 }}>Energy {e10.toFixed(1)} · Nostalgia {n10.toFixed(1)} · Dance {(pl.dna.dance / 10).toFixed(1)} · Mainstream {(pl.dna.mainstream / 10).toFixed(1)}</p>
                {pl.warnings.map((w) => <p key={w} className="tiny faint">{w}</p>)}
              </div>
              <div className="card pad stack">
                <span className="eyebrow">Make a new version</span>
                <Seg value={String(dur) as "60" | "120" | "180"} onChange={(v) => setDur(Number(v))} options={[{ value: "60", label: "1h" }, { value: "120", label: "2h" }, { value: "180", label: "3h" }]} />
                <div className="chips">
                  <button className="chip" disabled={busy} onClick={() => remake("Bunun daha enerjik versiyonu", { energy: Math.min(10, e10 + 1.5), danceability: Math.min(10, pl.dna.dance / 10 + 1) })}>More energetic</button>
                  <button className="chip" disabled={busy} onClick={() => remake("Bunun daha nostaljik versiyonu", { nostalgia: Math.min(10, n10 + 2.5) })}>More nostalgic</button>
                  <button className="chip" disabled={busy} onClick={() => remake("Bunun daha modern versiyonu", { nostalgia: Math.max(1, n10 - 3) })}>More modern</button>
                  <button className="chip" disabled={busy} onClick={() => remake("Bunun gibi ama beni şaşırt", { discovery: 40 })}>Surprise me</button>
                  <button className="chip" disabled={busy} onClick={() => remake("Bunun gibi, Türkçe %70", { turkishShare: 0.7 })}>70% Turkish</button>
                </div>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) remake(ask, {}); }}>
                  <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="“Bunun gibi ama daha hareketli”" />
                  <button className="btn btn-primary" disabled={busy || !ask.trim()}>Go</button>
                </form>
              </div>
            </>
          ) : (
            <div className="card empty">The DNA appears here after analysis.</div>
          )}
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
