"use client";
import { useCallback, useEffect, useState } from "react";
import { GENRE_LABEL } from "@/lib/i18n";
import type { GenreId } from "@/lib/types";
import { api } from "./api";
import { Dots, Slider, Toast } from "./ui";
import { useT } from "./LangProvider";
import { connectAppleMusic } from "./musickit";

interface Me {
  learningPaused: boolean;
  taste: { events: number; lovedArtists: { name: string; score: number }[]; avoidedArtists: { name: string; score: number }[]; genres: { genre: string; score: number }[]; neverCount: number; energyBias: number; discoveryBias: number };
  theme: { statement: string; principles: string[]; discovery: number | null } | null;
  connections: { provider: string; accountName: string | null }[];
  stats: { playlistsThisWeek: number; newArtistsThisMonth: number; tasteExpansion: { genre: string; likes: number } | null };
  providers: { id: string; name: string; configured: boolean }[];
  llm: boolean;
  enrichment: string[];
  youtube: { oauth: boolean; apiKey: boolean };
  reflection: { tr: string[]; en: string[] };
}
interface Entry { id: number; playlistId: string | null; playlistTitle: string | null; text: string; createdAt: number }

export function ProfileClient() {
  const { t, lang } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [journal, setJournal] = useState<Entry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [principles, setPrinciples] = useState("");
  const [discovery, setDiscovery] = useState(20);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const m = await api<Me>("/api/me");
    setMe(m);
    setStatement(m.theme?.statement ?? "");
    setPrinciples((m.theme?.principles ?? []).join("\n"));
    setDiscovery(m.theme?.discovery ?? 20);
    setJournal((await api<{ entries: Entry[] }>("/api/journal")).entries);
  }, []);
  useEffect(() => { load().catch(() => setToast(t("me.loadError"))); }, [load, t]);

  if (!me) return <div className="section"><Dots /></div>;
  const prompts = me.reflection[lang];
  const prompt = prompts[new Date().getDay() % prompts.length];
  const conn = (p: string) => me.connections.find((c) => c.provider === p);
  const configured = (p: string) => !!me.providers.find((x) => x.id === p)?.configured;
  const genreName = (g: string) => GENRE_LABEL[g as GenreId]?.[lang] ?? g;
  const disconnect = async (p: "spotify" | "apple" | "google", name: string) => { await api(`/api/auth/${p}/disconnect`, { method: "POST" }); await load(); setToast(t("me.disconnected", { p: name })); };

  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">{t("me.eyebrow")}</p>
        <h1 className="display pl-title">{t("me.title")}</h1>
        <p className="muted" style={{ maxWidth: 640 }}>{t("me.lede")}</p>
      </section>

      <div className="grid-2 section">
        <div className="stack">
          <div className="card pad">
            <div className="row between wrap">
              <h2 className="display" style={{ fontSize: 22 }}>{t("me.taste")}</h2>
              <div className="row">
                <button className="chip" aria-pressed={me.learningPaused} onClick={async () => { await api("/api/me", { method: "PATCH", body: { learningPaused: !me.learningPaused } }); setMe({ ...me, learningPaused: !me.learningPaused }); setToast(t(!me.learningPaused ? "me.pausedToast" : "me.resumedToast")); }}>
                  {me.learningPaused ? t("me.paused") : t("me.on")}
                </button>
                <button className="btn btn-sm" onClick={async () => { if (confirm(t("me.resetConfirm"))) { await api("/api/me/reset-taste", { method: "POST" }); await load(); setToast(t("me.resetToast")); } }}>{t("me.reset")}</button>
              </div>
            </div>
            <p className="small muted">{t("me.basedOn", { n: me.taste.events })}{me.taste.neverCount ? t("me.never", { n: me.taste.neverCount }) : ""}.</p>
            {me.taste.events === 0 ? (
              <p className="small">{t("me.nothing")}</p>
            ) : (
              <>
                <div className="chip-group-label">{t("me.love")}</div>
                <div className="chips">{me.taste.lovedArtists.map((a) => <span key={a.name} className="chip chip-accent chip-static">{a.name}</span>)}{!me.taste.lovedArtists.length && <span className="small muted">—</span>}</div>
                <div className="chip-group-label">{t("me.less")}</div>
                <div className="chips">{me.taste.avoidedArtists.map((a) => <span key={a.name} className="chip chip-static">{a.name}</span>)}{!me.taste.avoidedArtists.length && <span className="small muted">—</span>}</div>
                <div className="chip-group-label">{t("me.genres")}</div>
                <div className="chips">{me.taste.genres.map((g) => <span key={g.genre} className="chip chip-soft chip-static">{genreName(g.genre)} · {Math.round(g.score * 100)}</span>)}</div>
                {me.taste.energyBias !== 0 && <p className="small muted" style={{ marginTop: 12 }}>{t("me.bias", { dir: t(me.taste.energyBias > 0 ? "me.more" : "me.lessE"), n: Math.abs(me.taste.energyBias).toFixed(1) })}</p>}
              </>
            )}
          </div>

          <div className="card pad">
            <h2 className="display" style={{ fontSize: 22 }}>{t("me.theme")}</h2>
            <p className="small muted">{t("me.themeLede")}</p>
            <label className="small" style={{ fontWeight: 700 }}>{t("me.feel")}</label>
            <input className="input" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder={t("me.feelPh")} />
            <label className="small" style={{ fontWeight: 700, display: "block", marginTop: 12 }}>{t("me.should")}</label>
            <textarea className="textarea" value={principles} onChange={(e) => setPrinciples(e.target.value)} placeholder={t("me.shouldPh")} />
            <Slider label={t("s.discovery")} value={discovery} min={0} max={50} step={5} suffix="%" onChange={setDiscovery} />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={!statement.trim()} onClick={async () => {
              const r = await api<{ appliedDefaults: Record<string, unknown> }>("/api/me/theme", { method: "PUT", body: { statement, principles: principles.split("\n").map((s) => s.trim()).filter(Boolean), discovery } });
              setToast(t("me.themeSaved", { x: Object.entries(r.appliedDefaults).map(([k, v]) => `${k}=${v}`).join(", ") || t("me.toneOnly") }));
            }}>{t("me.saveTheme")}</button>
          </div>

          <div className="card pad">
            <h2 className="display" style={{ fontSize: 22 }}>{t("me.reflection")}</h2>
            <p className="small" style={{ fontWeight: 650 }}>{prompt}</p>
            <textarea className="textarea" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder={t("me.reflectionPh")} />
            <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} disabled={!reflection.trim()} onClick={async () => { await api("/api/journal", { method: "POST", body: { text: reflection, playlistId: null } }); setReflection(""); setJournal((await api<{ entries: Entry[] }>("/api/journal")).entries); setToast(t("me.savedJournal")); }}>{t("me.save")}</button>
            {journal.length > 0 && <hr className="divider" />}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
              {journal.slice(0, 12).map((j) => (
                <li key={j.id} className="small">
                  <div className="row between"><span className="faint tiny">{new Date(j.createdAt).toLocaleDateString(lang)} {j.playlistTitle ? `· ${j.playlistTitle}` : ""}</span>
                    <button className="icon-btn" title={t("me.delete")} onClick={async () => { await api(`/api/journal?id=${j.id}`, { method: "DELETE" }); setJournal(journal.filter((x) => x.id !== j.id)); }}>×</button></div>
                  {j.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="stack">
          <div className="card pad">
            <span className="eyebrow">{t("me.discovery")}</span>
            <p style={{ margin: "8px 0 0", fontSize: 15 }}>{t("me.discovered", { n: me.stats.newArtistsThisMonth })}</p>
            {me.stats.tasteExpansion && <p className="small" style={{ margin: "6px 0 0" }}>{t("me.expanding", { g: genreName(me.stats.tasteExpansion.genre) })}</p>}
            <p className="small muted" style={{ margin: "6px 0 0" }}>{t("me.weekly", { n: me.stats.playlistsThisWeek })}</p>
          </div>

          <div className="card pad">
            <span className="eyebrow">{t("me.accounts")}</span>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="row between">
                <span>Spotify <span className="tiny faint">💳 {t("cost.premium")}</span> {conn("spotify") ? <span className="small muted">· {conn("spotify")!.accountName}</span> : null}</span>
                {conn("spotify") ? (
                  <button className="btn btn-sm" onClick={() => disconnect("spotify", "Spotify")}>{t("me.disconnect")}</button>
                ) : configured("spotify") ? (
                  <a className="btn btn-sm btn-primary" href="/api/auth/spotify/login?return=/me">{t("me.connect")}</a>
                ) : <span className="tiny faint">{t("me.notConfigured")}</span>}
              </div>
              <div className="row between">
                <span>Apple Music <span className="tiny faint">💳 {t("cost.paid")}</span> {conn("apple") ? <span className="small muted">· {conn("apple")!.accountName}</span> : null}</span>
                {conn("apple") ? (
                  <button className="btn btn-sm" onClick={() => disconnect("apple", "Apple Music")}>{t("me.disconnect")}</button>
                ) : configured("apple") ? (
                  <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => {
                    setBusy(true);
                    try { await connectAppleMusic(); await load(); setToast(t("me.connected", { p: "Apple Music" })); } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
                  }}>{t("me.connect")}</button>
                ) : <span className="tiny faint">{t("me.notConfigured")}</span>}
              </div>
              <div className="row between">
                <span>YouTube Music <span className="tiny faint">{t("cost.free")}</span> {conn("youtube") ? <span className="small muted">· {conn("youtube")!.accountName}</span> : null}</span>
                {conn("youtube") ? (
                  <button className="btn btn-sm" onClick={() => disconnect("google", "YouTube")}>{t("me.disconnect")}</button>
                ) : me.youtube.oauth ? (
                  <a className="btn btn-sm btn-primary" href="/api/auth/google/login?return=/me">{t("me.connect")}</a>
                ) : <span className="tiny faint">{t("me.ytNote")}</span>}
              </div>
              <div className="row between"><span>{t("me.deezer")}</span><span className="tiny faint">{configured("deezer") ? t("me.onOff.on") : t("me.onOff.off")}</span></div>
            </div>
          </div>

          <div className="card pad small">
            <span className="eyebrow">{t("me.ai")}</span>
            <p style={{ margin: "8px 0 0" }}>{me.llm ? t("me.aiOn") : t("me.aiOff")}</p>
            <span className="eyebrow" style={{ display: "block", marginTop: 14 }}>{t("me.enrich")}</span>
            <p style={{ margin: "8px 0 0" }}>{me.enrichment.length ? t("me.enrichOn", { s: me.enrichment.join(", ") }) : t("me.enrichOff")}</p>
            {me.enrichment.includes("GetSongBPM") && <p className="tiny faint" style={{ margin: "6px 0 0" }}>Tempo data by <a href="https://getsongbpm.com" target="_blank" rel="noreferrer">GetSongBPM</a></p>}
          </div>

          <div className="card pad small">
            <span className="eyebrow">{t("me.privacy")}</span>
            <p style={{ margin: "8px 0 12px" }}>{t("me.privacyText")}</p>
            <button className="btn btn-sm" style={{ color: "var(--bad)" }} onClick={async () => { if (confirm(t("me.deleteConfirm"))) { await api("/api/me", { method: "DELETE" }); location.href = "/"; } }}>{t("me.deleteAll")}</button>
          </div>
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
