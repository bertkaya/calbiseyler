"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HydratedPlaylist } from "@/lib/server/playlists";
import type { MusicTrack, PlaylistBrief, TrackRole } from "@/lib/types";
import { MAKE_IT, type MakeItPreset } from "@/lib/engine/presets";
import { ROLE_LABEL } from "@/lib/engine/roles";
import { GENRE_LABEL } from "@/lib/i18n";
import { formatDuration, formatTrackTime } from "@/lib/engine/util";
import { api, ApiError } from "./api";
import { BriefEditor } from "./BriefEditor";
import { FlowChart } from "./FlowChart";
import { DNABars, Dots, Toast, coverStyle, initials } from "./ui";
import { useT } from "./LangProvider";
import { connectAppleMusic } from "./musickit";

type ProviderId = "spotify" | "apple" | "youtube" | "deezer";
interface Change { playlist: HydratedPlaylist; message: string; diff?: { kept: number; added: number; removed: number } }
interface MatchRes {
  provider: ProviderId; configured: boolean; needsConnect?: boolean;
  matches: { trackId: string; status: "available" | "alternative" | "unavailable" | "unknown"; confidence: number; note?: string; searchUrl: string; ref?: { url: string; title: string; artist: string } }[];
  summary: { total: number; available: number; alternative: number; unavailable: number; unknown: number };
  suggestions: { position: number; trackId: string; alternative: MusicTrack; message: string }[];
}
interface Msg { who: "ai" | "me"; text: string }

export function PlaylistStudio({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pl, setPl] = useState<HydratedPlaylist | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [edit, setEdit] = useState("");
  const [expert, setExpert] = useState(false);
  const [why, setWhy] = useState(false);
  const [match, setMatch] = useState<MatchRes | null>(null);
  const [matching, setMatching] = useState(false);
  const [target, setTarget] = useState<ProviderId>("youtube");
  const [acceptAlt, setAcceptAlt] = useState<string[]>([]);
  const [pushed, setPushed] = useState<string | null>(null);
  const [alts, setAlts] = useState<{ pos: number; items: MusicTrack[] } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [shuffleView, setShuffleView] = useState<number[] | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Interface chrome follows the UI language; sommelier replies follow the request language (server).
  const { lang: uiLang, t: tt } = useT();
  const L = (tr: string, en: string) => (uiLang === "en" ? en : tr);

  useEffect(() => {
    try { setExpert(localStorage.getItem("ams_expert") === "1"); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ams_expert", expert ? "1" : "0"); } catch { /* ignore */ }
  }, [expert]);

  useEffect(() => {
    api<{ playlist: HydratedPlaylist }>(`/api/playlists/${id}`)
      .then((r) => { setPl(r.playlist); setMsgs([{ who: "ai", text: r.playlist.interpretation }]); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 404 ? "404" : "load"));
  }, [id]);

  useEffect(() => {
    const s = search.get("spotify");
    if (s === "connected") setToast(tt("pl.spotifyConnected"));
    else if (s) setToast(`Spotify: ${s}`);
    const y = search.get("youtube");
    if (y === "connected") setToast(tt("pl.youtubeConnected"));
    else if (y) setToast(`YouTube: ${y}`);
  }, [search]);

  const act = useCallback(async (body: Record<string, unknown>, opts: { echo?: string } = {}) => {
    setBusy(true);
    if (opts.echo) setMsgs((m) => [...m, { who: "me", text: opts.echo! }]);
    try {
      const r = await api<Change>(`/api/playlists/${id}/actions`, { method: "POST", body });
      if (r.playlist) setPl(r.playlist);
      if (r.message) setMsgs((m) => [...m, { who: "ai", text: r.message }]);
      setMatch(null); setShuffleView(null);
      return r;
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : tt("pl.error"));
    } finally {
      setBusy(false);
    }
  }, [id]);

  const patchBrief = useCallback(async (patch: Partial<PlaylistBrief>) => {
    setBusy(true);
    try {
      const r = await api<Change>(`/api/playlists/${id}`, { method: "PATCH", body: { brief: patch } });
      setPl(r.playlist);
      if (r.message) setMsgs((m) => [...m, { who: "ai", text: r.message }]);
      setMatch(null);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : tt("pl.error"));
    } finally { setBusy(false); }
  }, [id]);

  const play = useCallback(async (trackId: string) => {
    if (playing === trackId) { audio.current?.pause(); setPlaying(null); return; }
    try {
      const r = await api<{ previewUrl: string | null; url: string | null }>(`/api/preview?trackId=${encodeURIComponent(trackId)}`);
      if (!r.previewUrl) { setToast(tt("pl.noPreview")); return; }
      audio.current?.pause();
      const a = new Audio(r.previewUrl);
      audio.current = a;
      a.volume = 0.8;
      a.onended = () => setPlaying(null);
      await a.play();
      setPlaying(trackId);
    } catch { setToast(tt("pl.previewBlocked")); }
  }, [playing]);

  const runMatch = useCallback(async (provider: ProviderId) => {
    setMatching(true); setTarget(provider); setPushed(null);
    try {
      const r = await api<MatchRes>(`/api/playlists/${id}/match`, { method: "POST", body: { provider } });
      setMatch(r);
      setAcceptAlt([]);
    } catch (e) { setToast(e instanceof ApiError ? e.message : tt("pl.matchFailed")); }
    finally { setMatching(false); }
  }, [id]);

  const push = useCallback(async (provider: "spotify" | "apple" | "youtube", retried = false): Promise<void> => {
    setBusy(true);
    try {
      const r = await api<{ url: string; added: number; skipped: number }>(`/api/playlists/${id}/push`, { method: "POST", body: { provider, acceptAlternatives: acceptAlt } });
      setPushed(r.url);
      const name = provider === "spotify" ? "Spotify" : provider === "apple" ? "Apple Music" : "YouTube Music";
      setMsgs((m) => [...m, { who: "ai", text: tt("pl.pushed", { p: name, n: r.added, s: r.skipped ? tt("pl.skipped", { n: r.skipped }) : "" }) }]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (provider !== "apple") { const u = (e.data as { connectUrl: string | null }).connectUrl; if (u) window.location.href = u; return; }
        if (!retried) {
          // Apple: sign in with MusicKit JS in place, then retry once.
          setToast(tt("pl.appleConnecting"));
          try { await connectAppleMusic(); setBusy(false); return push("apple", true); } catch (err) { setToast((err as Error).message); }
        }
        return;
      }
      setToast(e instanceof ApiError ? e.message : tt("pl.exportFailed"));
    } finally { setBusy(false); }
  }, [id, acceptAlt, tt]);

  const items = pl?.items ?? [];
  const order = shuffleView ?? items.map((_, i) => i);
  const totalSec = pl?.stats.totalSec ?? 0;
  const points = useMemo(() => {
    let acc = 0;
    return items.map((it) => { const mid = (acc + it.track.durationSec / 2) / Math.max(1, totalSec); acc += it.track.durationSec; return { t: mid, e: (it.track.features.energy ?? 0.5) * 10, title: it.track.title }; });
  }, [items, totalSec]);
  const matchBy = useMemo(() => new Map(match?.matches.map((m) => [m.trackId, m]) ?? []), [match]);

  if (err) return <div className="card empty section">{tt(err === "404" ? "pl.notFound" : "pl.loadError")} <Link href="/">{tt("pl.createNew")}</Link></div>;
  if (!pl) return <div className="section"><div className="skeleton" style={{ height: 60, width: "60%" }} /><div className="skeleton" style={{ height: 300, marginTop: 20 }} /></div>;

  const lang = uiLang;
  const fb = pl.feedback ?? {};

  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">{L("Playlist", "Playlist")} · {pl.saved ? L("Kaydedildi", "Saved") : L("Taslak", "Draft")}</p>
        <h1 className="display pl-title">{pl.title}</h1>
        <div className="stat-row mono">
          <span>{formatDuration(totalSec)} · {pl.stats.trackCount} {L("şarkı", "tracks")}</span>
          <span>🔥 {pl.stats.energyAvg.toFixed(1)} {tt("pl.energy")}</span>
          <span>❤️ {(pl.dna.nostalgia / 10).toFixed(1)} {tt("pl.nostalgia")}</span>
          <span>💃 {(pl.dna.dance / 10).toFixed(1)} {tt("pl.dance")}</span>
          <span>🎲 {Math.round(pl.stats.shuffleFriendly * 100)}% {tt("pl.shuffleFriendly")}</span>
          {expert && <span>🔗 {Math.round(pl.stats.avgTransition * 100)}% {tt("pl.transitions")}</span>}
        </div>
        <div className="row wrap" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={() => items[0] && play(items[0].trackId)}>▶ {L("Önizle", "Play preview")}</button>
          <button className="btn" onClick={() => setShuffleView(shuffleView ? null : [...order].sort(() => Math.random() - 0.5))} aria-pressed={!!shuffleView} title={L("Shuffle'da nasıl akar?", "How does it flow on shuffle?")}>🔀 {shuffleView ? L("Sıralıya dön", "Back to order") : L("Shuffle testi", "Shuffle test")}</button>
          <button className="btn" onClick={async () => { const r = await api<{ playlist: HydratedPlaylist }>(`/api/playlists/${id}`, { method: "PATCH", body: { saved: !pl.saved } }); setPl(r.playlist); setToast(r.playlist.saved ? L("Kaydedildi ✓", "Saved ✓") : L("Kayıttan çıkarıldı", "Unsaved")); }}>{pl.saved ? "★ " + L("Kaydedildi", "Saved") : "☆ " + L("Kaydet", "Save")}</button>
          <ExportMenu id={id} lang={lang} />
          <button className="btn" onClick={async () => { const r = await act({ action: "share" }) as unknown as { shareId?: string }; const sid = r?.shareId; if (sid) { const url = `${location.origin}/p/${sid}`; try { await navigator.clipboard.writeText(url); setToast(L("Paylaşım linki kopyalandı", "Share link copied")); } catch { setToast(url); } } }}>↗ {L("Paylaş", "Share")}</button>
          <button className="btn btn-ghost" onClick={async () => { const r = await act({ action: "duplicate" }); if (r?.playlist) router.push(`/playlist/${r.playlist.id}`); }}>⧉ {L("Çoğalt", "Duplicate")}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: "undo" }).then((r) => r && setMsgs((m) => [...m, { who: "ai", text: L("Bir önceki versiyona döndüm.", "Restored the previous version.") }]))}>↶ {L("Geri al", "Undo")}</button>
          <label className="row small muted" style={{ marginLeft: "auto", cursor: "pointer" }}><input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} /> {tt("pl.expert")}</label>
        </div>
      </section>

      <div className="grid-2 section">
        {/* ── Left: conversation + tracks ── */}
        <div className="stack">
          <div className="stack" aria-live="polite">
            {msgs.slice(-4).map((m, i) => (
              <div key={i} className={`bubble ${m.who === "me" ? "me" : ""}`}>
                {m.who === "ai" && <div className="who">Sommelier</div>}
                {m.text}
              </div>
            ))}
            {busy && <div className="bubble"><div className="who">Sommelier</div><Dots /></div>}
            {pl.warnings.map((w) => <div key={w} className="bubble small" style={{ borderLeft: "3px solid var(--warn)" }}>⚠️ {w}</div>)}
            {pl.suggestions.map((s) => (
              <div key={s.id} className="card pad suggestion">
                <p style={{ margin: "0 0 12px" }}>💡 {s.message}</p>
                <div className="row wrap">
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act({ action: "suggestion", suggestionId: s.id, accept: true })}>{s.acceptLabel}</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "suggestion", suggestionId: s.id, accept: false })}>{s.declineLabel}</button>
                </div>
              </div>
            ))}
          </div>

          <form className="row" onSubmit={(e) => { e.preventDefault(); if (edit.trim()) { act({ action: "edit", text: edit.trim() }, { echo: edit.trim() }); setEdit(""); } }}>
            <input className="input" value={edit} onChange={(e) => setEdit(e.target.value)} placeholder={L("“İlk 30 dakika biraz daha sakin olsun” · “Tarkan kalsın, Sezen olmasın”", "“First 30 minutes calmer” · “more 2000s”")} aria-label="Edit with natural language" />
            <button className="btn btn-primary" disabled={busy || !edit.trim()}>{L("Uygula", "Apply")}</button>
          </form>

          <div className="card" style={{ padding: 8 }}>
            {shuffleView && <p className="small muted" style={{ margin: "8px 10px" }}>🔀 {L("Rastgele sıra önizlemesi — shuffle uyumu", "Random-order preview — shuffle friendliness")} {Math.round(pl.stats.shuffleFriendly * 100)}%</p>}
            <ol className="tracks">
              {order.map((idx, row) => {
                const it = items[idx];
                if (!it) return null;
                const t = it.track;
                const m = matchBy.get(t.id);
                const tr = it.transitionIn;
                const kind = fb[t.id];
                return (
                  <li key={`${t.id}-${idx}`} className="track">
                    <span className="num">{row + 1}</span>
                    <button className={`cover ${playing === t.id ? "playing" : ""}`} style={coverStyle(t.artist)} onClick={() => play(t.id)} aria-label={`Preview ${t.title}`}>
                      {initials(t.artist)}<span className="play">{playing === t.id ? "❚❚" : "▶"}</span>
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div className="t-title">
                        {t.title}
                        {it.locked && <span className="locked-dot" title="Must include">📌</span>}
                        {(expert || ["peak", "finale", "opener"].includes(it.role)) && !shuffleView && <span lang={lang} className={`role ${it.role}`}>{ROLE_LABEL[it.role as TrackRole][lang]}</span>}
                        {t.estimated && <span className="role" title="Features estimated">est.</span>}
                      </div>
                      <div className="t-meta">
                        {t.artist} · {t.year ?? "—"} · {formatTrackTime(t.durationSec)}
                        {expert && <> · <span className="ebar" title={`Energy ${(t.features.energy ?? 0) * 10}`}><i style={{ width: `${(t.features.energy ?? 0.5) * 100}%` }} /></span>{t.features.bpm ? ` ${t.features.bpm} bpm` : ""}</>}
                        {expert && tr !== null && !shuffleView && <span className={`trans ${tr >= 0.85 ? "good" : tr >= 0.65 ? "mid" : "bad"}`}>{tr >= 0.85 ? "🔥" : tr >= 0.65 ? "" : "⚠️"} {Math.round(tr * 100)}%</span>}
                        {m && <span className={`avail ${m.status}`} style={{ marginLeft: 8 }}>{m.status === "available" ? "✓" : m.status === "alternative" ? `⚠ ${m.note ?? "alt"}` : m.status === "unavailable" ? "✕" : "?"}</span>}
                      </div>
                    </div>
                    <div className="acts">
                      <button className="icon-btn" title={tt("pl.like")} aria-pressed={kind === "like"} onClick={() => act({ action: "feedback", position: idx, kind: "like" })}>👍</button>
                      <button className="icon-btn" title={tt("pl.love")} aria-pressed={kind === "love"} onClick={() => act({ action: "feedback", position: idx, kind: "love" })}>❤️</button>
                      <button className="icon-btn" title={L("Sevmedim — rolü koruyan alternatif bul", "Dislike — find a same-role alternative")} onClick={() => act({ action: "feedback", position: idx, kind: "dislike" }, { echo: `👎 ${t.title}` })}>👎</button>
                      <button className="icon-btn" title={tt("pl.never")} onClick={() => act({ action: "feedback", position: idx, kind: "never" }, { echo: `🚫 ${t.title}` })}>🚫</button>
                      <button className="icon-btn" title={L("Değiştir (aynı rol)", "Replace (same role)")} onClick={() => act({ action: "replace", position: idx })}>🔄</button>
                      <button className="icon-btn" title={L("Alternatifler", "Alternatives")} onClick={async () => { const r = await api<{ alternatives: MusicTrack[] }>(`/api/playlists/${id}/actions`, { method: "POST", body: { action: "alternatives", position: idx } }); setAlts({ pos: idx, items: r.alternatives }); }}>⋯</button>
                      <button className="icon-btn" title={L("Kesin olsun", "Must include")} aria-pressed={it.locked} onClick={() => act({ action: "lock", position: idx })}>📌</button>
                      <button className="icon-btn" title={L("Çıkar", "Remove")} onClick={() => act({ action: "remove", position: idx, replace: true }, { echo: L(`“${t.title}” çıkar`, `Remove “${t.title}”`) })}>✕</button>
                    </div>
                    {alts?.pos === idx && (
                      <div className="card" style={{ gridColumn: "1 / -1", padding: 10, marginTop: 6 }}>
                        <div className="row between"><span className="small muted">{L("Bu slota uyan alternatifler", "Alternatives that fit this slot")}</span><button className="icon-btn" onClick={() => setAlts(null)}>×</button></div>
                        {alts.items.map((a) => (
                          <button key={a.id} className="btn btn-ghost btn-sm" style={{ display: "flex", width: "100%", justifyContent: "flex-start" }} onClick={() => { setAlts(null); act({ action: "replace", position: idx, choiceId: a.id }); }}>
                            {a.title} <span className="muted">— {a.artist} · {a.year}</span>
                          </button>
                        ))}
                        {!alts.items.length && <p className="small muted">{L("Alternatif bulunamadı.", "No alternatives found.")}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <div className="chip-group-label">{tt("pl.makeIt")}</div>
            <div className="chips">
              {MAKE_IT.map((p) => <button key={p.id} className="chip" disabled={busy} onClick={() => act({ action: "preset", preset: p.id as MakeItPreset }, { echo: p[lang] })}>{p[lang]}</button>)}
            </div>
          </div>
        </div>

        {/* ── Right: brief, flow, DNA, platforms ── */}
        <aside className="stack">
          <div className="card pad">
            <div className="row between"><span className="eyebrow">{L("Brief", "Your playlist")}</span>{busy && <span className="spinner" style={{ color: "var(--accent)" }} />}</div>
            <div style={{ marginTop: 12 }}><BriefEditor brief={pl.brief} onChange={patchBrief} busy={busy} /></div>
          </div>

          <div className="card pad">
            <span className="eyebrow">Flow</span>
            <div style={{ marginTop: 10 }}><FlowChart target={pl.flowTarget} points={points} roles={items.map((i) => i.role)} /></div>
          </div>

          <div className="card pad">
            <span className="eyebrow">Playlist DNA</span>
            <div style={{ marginTop: 10 }}><DNABars dna={pl.dna} /></div>
            {pl.stats.estimatedShare > 0 && <p className="tiny faint" style={{ marginTop: 8 }}>{Math.round(pl.stats.estimatedShare * 100)}% {L("parçanın özellikleri tahmini.", "of tracks have estimated features.")}</p>}
          </div>

          <IncludeExclude pl={pl} busy={busy} act={act} lang={lang} />

          <div className="card pad">
            <span className="eyebrow">{L("Platformlar", "Platforms")}</span>
            <div className="chips" style={{ marginTop: 10 }}>
              {/* Free platforms first; paid ones stay available for people who already have the account. */}
              {(["youtube", "deezer", "spotify", "apple"] as ProviderId[]).map((p) => (
                <button key={p} className="chip" aria-pressed={target === p && !!match} disabled={matching} onClick={() => runMatch(p)}
                  title={tt(p === "spotify" ? "cost.premium" : p === "apple" ? "cost.paid" : "cost.free")}>
                  {p === "spotify" ? "Spotify" : p === "apple" ? "Apple Music" : p === "youtube" ? "YouTube Music" : "Deezer"}
                  {p === "spotify" || p === "apple" ? <span className="x">💳</span> : null}
                </button>
              ))}
            </div>
            <p className="tiny faint" style={{ margin: "8px 0 0" }}>💳 = {tt("cost.premium")} / {tt("cost.paid")}. {tt("pl.freeExport")}</p>
            {matching && <p className="small muted" style={{ marginTop: 10 }}><Dots /> {L("Her şarkıyı kontrol ediyorum…", "Checking every track…")}</p>}
            {match && (
              <div style={{ marginTop: 12 }} className="stack">
                {!match.configured && match.needsConnect ? (
                  <a className="btn btn-primary btn-sm" href={`/api/auth/google/login?return=/playlist/${id}`}>{tt("pl.connectYoutube")}</a>
                ) : !match.configured ? (
                  <p className="small muted">{tt("pl.notConfigured")}</p>
                ) : (
                  <div className="mono small" style={{ fontWeight: 700 }}>
                    <div>{match.summary.total} {tt("pl.tracks")}</div>
                    <div className="avail available">{match.summary.available} ✓ {tt("pl.available")}</div>
                    <div className="avail alternative">{match.summary.alternative} ⚠ {tt("pl.alternative")}</div>
                    <div className="avail unavailable">{match.summary.unavailable} ✕ {tt("pl.unavailable")}</div>
                    {match.summary.unknown > 0 && <div className="avail unknown">{match.summary.unknown} ? {tt("pl.unknown")}</div>}
                  </div>
                )}
                {match.suggestions.map((s) => (
                  <div key={s.trackId} className="card pad suggestion small">
                    <p style={{ margin: "0 0 8px" }}>{s.message}</p>
                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={() => act({ action: "replace", position: s.position, choiceId: s.alternative.id })}>{L("Kabul et", "Accept")}</button>
                      <button className="btn btn-sm" onClick={() => setMatch({ ...match, suggestions: match.suggestions.filter((x) => x !== s) })}>{L("Hayır", "No")}</button>
                    </div>
                  </div>
                ))}
                {match.matches.filter((m) => m.status === "alternative").map((m) => {
                  const t = items.find((i) => i.trackId === m.trackId)?.track;
                  return (
                    <label key={m.trackId} className="row small" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={acceptAlt.includes(m.trackId)} onChange={() => setAcceptAlt(acceptAlt.includes(m.trackId) ? acceptAlt.filter((x) => x !== m.trackId) : [...acceptAlt, m.trackId])} />
                      <span>⚠ {t?.title} → “{m.ref?.title}” ({m.note})</span>
                    </label>
                  );
                })}
                {match.provider === "spotify" && match.configured && (
                  <button className="btn btn-primary" disabled={busy} onClick={() => push("spotify")}>{tt("pl.sendSpotify")}</button>
                )}
                {match.provider === "apple" && match.configured && (
                  <button className="btn btn-primary" disabled={busy} onClick={() => push("apple")}>{tt("pl.sendApple")}</button>
                )}
                {match.provider === "youtube" && match.configured && (
                  <>
                    <button className="btn btn-primary" disabled={busy} onClick={() => push("youtube")}>{tt("pl.sendYoutube")}</button>
                    <p className="tiny faint" style={{ margin: 0 }}>{tt("pl.ytQuota", { n: 50 + items.length * 50 })}</p>
                  </>
                )}
                {pushed && <a className="btn" href={pushed} target="_blank" rel="noreferrer">{tt("pl.openOn")}</a>}
                <details className="disclosure">
                  <summary className="small">{L("Şarkı şarkı aç", "Open track by track")}</summary>
                  <ul className="small" style={{ paddingLeft: 18 }}>
                    {match.matches.map((m) => {
                      const t = items.find((i) => i.trackId === m.trackId)?.track;
                      return <li key={m.trackId}><a href={m.ref?.url ?? m.searchUrl} target="_blank" rel="noreferrer">{t?.artist} – {t?.title}</a></li>;
                    })}
                  </ul>
                </details>
              </div>
            )}
          </div>

          <div className="card pad">
            <button className="btn btn-ghost btn-sm" onClick={() => setWhy(!why)} aria-expanded={why} style={{ paddingLeft: 0 }}>💬 {L("Neden bu playlist?", "Why this playlist?")}</button>
            {why && <p className="small" style={{ marginTop: 8 }}>{pl.explanation}</p>}
          </div>

          <Journal id={id} lang={lang} onSaved={(s) => setToast(s)} />

          <button className="btn btn-ghost btn-sm" style={{ color: "var(--bad)" }} onClick={async () => { if (confirm(L("Bu playlist silinsin mi?", "Delete this playlist?"))) { await api(`/api/playlists/${id}`, { method: "DELETE" }); router.push("/"); } }}>🗑 {L("Playlisti sil", "Delete playlist")}</button>
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}

function ExportMenu({ id, lang }: { id: string; lang: "tr" | "en" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rel">
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>⤓ {lang === "en" ? "Export" : "Dışa aktar"}</button>
      {open && (
        <div className="card popover" style={{ minWidth: 200 }} onMouseLeave={() => setOpen(false)}>
          {[["txt", lang === "en" ? "Text list" : "Metin listesi"], ["csv", "CSV (Soundiiz / TuneMyMusic)"], ["m3u", "M3U"], ["json", "JSON"]].map(([f, l]) => (
            <a key={f} className="btn btn-ghost btn-sm" style={{ display: "flex", justifyContent: "flex-start" }} href={`/api/playlists/${id}/export?format=${f}`}>{l}</a>
          ))}
        </div>
      )}
    </div>
  );
}

function IncludeExclude({ pl, busy, act, lang }: { pl: HydratedPlaylist; busy: boolean; act: (b: Record<string, unknown>, o?: { echo?: string }) => Promise<unknown>; lang: "tr" | "en" }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ tracks: MusicTrack[]; artists: string[] } | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => api<{ tracks: MusicTrack[]; artists: string[] }>(`/api/catalog/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const inc = pl.brief.include, exc = pl.brief.exclude;
  const title = (id: string) => pl.items.find((i) => i.trackId === id)?.track.title ?? id.split("--").pop()?.replace(/-/g, " ");
  const setIE = (which: "include" | "exclude", value: typeof inc) => act({ action: "includeExclude", which, value });
  const L = (tr: string, en: string) => (lang === "en" ? en : tr);
  return (
    <div className="card pad">
      <span className="eyebrow">{L("Kesin olsun / Kesin olmasın", "Must include / Must exclude")}</span>
      <div className="chips" style={{ marginTop: 10 }}>
        {inc.artists.map((a) => <button key={a} className="chip chip-accent" onClick={() => setIE("include", { ...inc, artists: inc.artists.filter((x) => x !== a) })}>✓ {a} <span className="x">×</span></button>)}
        {inc.trackIds.map((t) => <button key={t} className="chip chip-accent" onClick={() => setIE("include", { ...inc, trackIds: inc.trackIds.filter((x) => x !== t) })}>✓ {title(t)} <span className="x">×</span></button>)}
        {exc.artists.map((a) => <button key={a} className="chip" onClick={() => setIE("exclude", { ...exc, artists: exc.artists.filter((x) => x !== a) })}>🚫 {a} <span className="x">×</span></button>)}
        {exc.trackIds.map((t) => <button key={t} className="chip" onClick={() => setIE("exclude", { ...exc, trackIds: exc.trackIds.filter((x) => x !== t) })}>🚫 {title(t)} <span className="x">×</span></button>)}
        {exc.genres.map((g) => <button key={g} className="chip" onClick={() => setIE("exclude", { ...exc, genres: exc.genres.filter((x) => x !== g) })}>🚫 {GENRE_LABEL[g]?.[lang] ?? g} <span className="x">×</span></button>)}
        {exc.tags.map((g) => <button key={g} className="chip" onClick={() => setIE("exclude", { ...exc, tags: exc.tags.filter((x) => x !== g) })}>🚫 {g} <span className="x">×</span></button>)}
        {!inc.artists.length && !inc.trackIds.length && !exc.artists.length && !exc.trackIds.length && !exc.genres.length && !exc.tags.length && <span className="small muted">{L("Henüz yok.", "Nothing yet.")}</span>}
      </div>
      <input className="input" style={{ marginTop: 12 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Sanatçı veya şarkı ara…", "Search artist or song…")} />
      {res && (
        <div style={{ marginTop: 8 }}>
          {res.artists.map((a) => (
            <div key={a} className="row between small" style={{ padding: "4px 0" }}>
              <span>🎤 {a}</span>
              <span className="row">
                <button className="btn btn-sm" disabled={busy} onClick={() => { setQ(""); setIE("include", { ...inc, artists: [...inc.artists, a] }); }}>✓ {L("Olsun", "Include")}</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => { setQ(""); setIE("exclude", { ...exc, artists: [...exc.artists, a] }); }}>🚫 {L("Olmasın", "Exclude")}</button>
              </span>
            </div>
          ))}
          {res.tracks.slice(0, 6).map((t) => (
            <div key={t.id} className="row between small" style={{ padding: "4px 0" }}>
              <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title} <span className="muted">— {t.artist}</span></span>
              <span className="row">
                <button className="btn btn-sm" disabled={busy} onClick={() => { setQ(""); act({ action: "include", trackId: t.id }); }}>✓</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => { setQ(""); setIE("exclude", { ...exc, trackIds: [...exc.trackIds, t.id] }); }}>🚫</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="chips" style={{ marginTop: 10 }}>
        {(["slow", "cheesy", "sad"] as const).filter((tg) => !exc.tags.includes(tg)).map((tg) => (
          <button key={tg} className="chip chip-soft" disabled={busy} onClick={() => setIE("exclude", { ...exc, tags: [...exc.tags, tg] })}>🚫 {tg === "slow" ? "Slow" : tg === "cheesy" ? "Cheesy" : L("Hüzünlü", "Sad")}</button>
        ))}
        {(["arabesk", "tr-rap"] as const).filter((g) => !exc.genres.includes(g)).map((g) => (
          <button key={g} className="chip chip-soft" disabled={busy} onClick={() => setIE("exclude", { ...exc, genres: [...exc.genres, g] })}>🚫 {GENRE_LABEL[g][lang]}</button>
        ))}
      </div>
    </div>
  );
}

function Journal({ id, lang, onSaved }: { id: string; lang: "tr" | "en"; onSaved: (s: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="card pad disclosure">
      <summary className="small">📓 {lang === "en" ? "Journal — how did it work?" : "Günlük — nasıl gitti?"}</summary>
      <textarea className="textarea" style={{ marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === "en" ? "“Worked great at the birthday.” · “First half was too slow.”" : "“Doğum günü partisinde çok iyi çalıştı.” · “İlk yarı fazla yavaştı.”"} />
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="tiny faint">{lang === "en" ? "Notes gently tune future playlists." : "Notların gelecekteki playlistleri hafifçe ayarlar."}</span>
        <button className="btn btn-sm btn-primary" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); try { await api(`/api/playlists/${id}/actions`, { method: "POST", body: { action: "journal", text } }); setText(""); onSaved(lang === "en" ? "Noted ✓" : "Not edildi ✓"); } finally { setBusy(false); } }}>{lang === "en" ? "Save note" : "Kaydet"}</button>
      </div>
    </details>
  );
}
