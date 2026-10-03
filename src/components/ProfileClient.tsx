"use client";
import { useCallback, useEffect, useState } from "react";
import { GENRE_LABEL } from "@/lib/i18n";
import type { GenreId } from "@/lib/types";
import { api } from "./api";
import { Dots, Slider, Toast } from "./ui";

interface Me {
  learningPaused: boolean;
  taste: { events: number; lovedArtists: { name: string; score: number }[]; avoidedArtists: { name: string; score: number }[]; genres: { genre: string; score: number }[]; neverCount: number; energyBias: number; discoveryBias: number };
  theme: { statement: string; principles: string[]; discovery: number | null } | null;
  connections: { provider: string; accountName: string | null }[];
  stats: { playlistsThisWeek: number; newArtistsThisMonth: number; tasteExpansion: { genre: string; likes: number } | null };
  providers: { id: string; name: string; configured: boolean }[];
  llm: boolean;
  reflection: { tr: string[]; en: string[] };
}
interface Entry { id: number; playlistId: string | null; playlistTitle: string | null; text: string; createdAt: number }

export function ProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [journal, setJournal] = useState<Entry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [principles, setPrinciples] = useState("");
  const [discovery, setDiscovery] = useState(20);
  const [reflection, setReflection] = useState("");
  const load = useCallback(async () => {
    const m = await api<Me>("/api/me");
    setMe(m);
    setStatement(m.theme?.statement ?? "");
    setPrinciples((m.theme?.principles ?? []).join("\n"));
    setDiscovery(m.theme?.discovery ?? 20);
    setJournal((await api<{ entries: Entry[] }>("/api/journal")).entries);
  }, []);
  useEffect(() => { load().catch(() => setToast("Could not load profile")); }, [load]);

  if (!me) return <div className="section"><Dots /></div>;
  const prompt = me.reflection.tr[new Date().getDay() % me.reflection.tr.length];
  const spotify = me.connections.find((c) => c.provider === "spotify");

  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">Your music system</p>
        <h1 className="display pl-title">Taste &amp; Theme</h1>
        <p className="muted" style={{ maxWidth: 640 }}>Your taste profile learns only from your feedback and playlist edits — never hidden listening data. You can pause or reset it anytime.</p>
      </section>

      <div className="grid-2 section">
        <div className="stack">
          <div className="card pad">
            <div className="row between wrap">
              <h2 className="display" style={{ fontSize: 22 }}>Taste profile</h2>
              <div className="row">
                <button className="chip" aria-pressed={me.learningPaused} onClick={async () => { await api("/api/me", { method: "PATCH", body: { learningPaused: !me.learningPaused } }); setMe({ ...me, learningPaused: !me.learningPaused }); setToast(!me.learningPaused ? "Learning paused" : "Learning resumed"); }}>
                  {me.learningPaused ? "⏸ Learning paused" : "● Learning on"}
                </button>
                <button className="btn btn-sm" onClick={async () => { if (confirm("Reset your taste profile? Feedback history will be deleted.")) { await api("/api/me/reset-taste", { method: "POST" }); await load(); setToast("Taste profile reset"); } }}>Reset</button>
              </div>
            </div>
            <p className="small muted">Based on {me.taste.events} signals{me.taste.neverCount ? ` · ${me.taste.neverCount} never-play tracks` : ""}.</p>
            {me.taste.events === 0 ? (
              <p className="small">Nothing learned yet. Like ❤️, dislike 👎 or replace 🔄 tracks and it will show up here.</p>
            ) : (
              <>
                <div className="chip-group-label">Artists you love</div>
                <div className="chips">{me.taste.lovedArtists.map((a) => <span key={a.name} className="chip chip-accent chip-static">{a.name}</span>)}{!me.taste.lovedArtists.length && <span className="small muted">—</span>}</div>
                <div className="chip-group-label">Less of</div>
                <div className="chips">{me.taste.avoidedArtists.map((a) => <span key={a.name} className="chip chip-static">{a.name}</span>)}{!me.taste.avoidedArtists.length && <span className="small muted">—</span>}</div>
                <div className="chip-group-label">Genres leaning</div>
                <div className="chips">{me.taste.genres.map((g) => <span key={g.genre} className="chip chip-soft chip-static">{GENRE_LABEL[g.genre as GenreId]?.en ?? g.genre} · {Math.round(g.score * 100)}</span>)}</div>
                {me.taste.energyBias !== 0 && <p className="small muted" style={{ marginTop: 12 }}>You tend to want {me.taste.energyBias > 0 ? "a bit more" : "a bit less"} energy than you ask for — I adjust by {Math.abs(me.taste.energyBias).toFixed(1)}.</p>}
              </>
            )}
          </div>

          <div className="card pad">
            <h2 className="display" style={{ fontSize: 22 }}>My music theme</h2>
            <p className="small muted">A higher-level principle that quietly shapes every playlist — without overriding what you ask for.</p>
            <label className="small" style={{ fontWeight: 700 }}>When I listen to music, I want to feel…</label>
            <input className="input" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="I want music to make ordinary moments feel cinematic." />
            <label className="small" style={{ fontWeight: 700, display: "block", marginTop: 12 }}>My music should… (one per line)</label>
            <textarea className="textarea" value={principles} onChange={(e) => setPrinciples(e.target.value)} placeholder={"Prefer familiar songs\nAlways keep some Turkish classics"} />
            <Slider label="Discovery" value={discovery} min={0} max={50} step={5} suffix="%" onChange={setDiscovery} />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={!statement.trim()} onClick={async () => {
              const r = await api<{ appliedDefaults: Record<string, unknown> }>("/api/me/theme", { method: "PUT", body: { statement, principles: principles.split("\n").map((s) => s.trim()).filter(Boolean), discovery } });
              setToast(`Theme saved · applies: ${Object.entries(r.appliedDefaults).map(([k, v]) => `${k}=${v}`).join(", ") || "tone only"}`);
            }}>Save theme</button>
          </div>

          <div className="card pad">
            <h2 className="display" style={{ fontSize: 22 }}>Weekly reflection</h2>
            <p className="small" style={{ fontWeight: 650 }}>{prompt}</p>
            <textarea className="textarea" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Two sentences are plenty." />
            <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} disabled={!reflection.trim()} onClick={async () => { await api("/api/journal", { method: "POST", body: { text: reflection, playlistId: null } }); setReflection(""); setJournal((await api<{ entries: Entry[] }>("/api/journal")).entries); setToast("Saved to journal"); }}>Save</button>
            {journal.length > 0 && <hr className="divider" />}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
              {journal.slice(0, 12).map((j) => (
                <li key={j.id} className="small">
                  <div className="row between"><span className="faint tiny">{new Date(j.createdAt).toLocaleDateString()} {j.playlistTitle ? `· ${j.playlistTitle}` : ""}</span>
                    <button className="icon-btn" title="Delete" onClick={async () => { await api(`/api/journal?id=${j.id}`, { method: "DELETE" }); setJournal(journal.filter((x) => x.id !== j.id)); }}>×</button></div>
                  {j.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="stack">
          <div className="card pad">
            <span className="eyebrow">Discovery</span>
            <p style={{ margin: "8px 0 0", fontSize: 15 }}>You discovered <b>{me.stats.newArtistsThisMonth}</b> artists this month.</p>
            {me.stats.tasteExpansion && <p className="small" style={{ margin: "6px 0 0" }}>Your taste is expanding toward <b>{GENRE_LABEL[me.stats.tasteExpansion.genre as GenreId]?.en ?? me.stats.tasteExpansion.genre}</b>.</p>}
            <p className="small muted" style={{ margin: "6px 0 0" }}>{me.stats.playlistsThisWeek} playlists created this week. No streaks, no pressure.</p>
          </div>

          <div className="card pad">
            <span className="eyebrow">Connected accounts</span>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="row between">
                <span>Spotify {spotify ? <span className="small muted">· {spotify.accountName}</span> : null}</span>
                {spotify ? (
                  <button className="btn btn-sm" onClick={async () => { await api("/api/auth/spotify/disconnect", { method: "POST" }); await load(); setToast("Spotify disconnected"); }}>Disconnect</button>
                ) : me.providers.find((p) => p.id === "spotify")?.configured ? (
                  <a className="btn btn-sm btn-primary" href="/api/auth/spotify/login?return=/me">Connect</a>
                ) : <span className="tiny faint">not configured</span>}
              </div>
              <div className="row between"><span>Apple Music</span><span className="tiny faint">{me.providers.find((p) => p.id === "apple")?.configured ? "catalog search ready · library save: phase 2" : "phase 2"}</span></div>
              <div className="row between"><span>YouTube Music</span><span className="tiny faint">links only · phase 2</span></div>
              <div className="row between"><span>Deezer previews</span><span className="tiny faint">{me.providers.find((p) => p.id === "deezer")?.configured ? "on" : "off"}</span></div>
            </div>
          </div>

          <div className="card pad small">
            <span className="eyebrow">AI</span>
            <p style={{ margin: "8px 0 0" }}>{me.llm ? "Rules + Claude for rich requests, free-form edits and curation." : "Rule-based understanding (no LLM key configured). Everything works; rich phrasing is understood less flexibly."}</p>
          </div>

          <div className="card pad small">
            <span className="eyebrow">Privacy</span>
            <p style={{ margin: "8px 0 12px" }}>Your listening choices are personal data. Delete everything — playlists, taste, journal, connections — in one click.</p>
            <button className="btn btn-sm" style={{ color: "var(--bad)" }} onClick={async () => { if (confirm("Delete ALL your data? This cannot be undone.")) { await api("/api/me", { method: "DELETE" }); location.href = "/"; } }}>Delete all my data</button>
          </div>
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
