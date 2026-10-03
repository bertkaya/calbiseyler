"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, Mood, PlaylistBrief, Question } from "@/lib/types";
import { api, ApiError } from "./api";
import { Dots, Seg, Slider, Toast, coverStyle } from "./ui";

const MOODS: { id: Mood; label: string }[] = [
  { id: "happy", label: "😊 Happy" }, { id: "sad", label: "🌧️ Sad" }, { id: "chill", label: "🌿 Chill" },
  { id: "romantic", label: "🌹 Romantic" }, { id: "energetic", label: "⚡ Energetic" }, { id: "nostalgic", label: "📼 Nostalgic" },
  { id: "melancholic", label: "🌙 Melancholic" }, { id: "party", label: "🥳 Party" }, { id: "focus", label: "🎯 Focus" }, { id: "roadtrip", label: "🚗 Road Trip" },
];
const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: "party", label: "Party" }, { id: "dinner", label: "Dinner" }, { id: "driving", label: "Driving" }, { id: "workout", label: "Workout" },
  { id: "date", label: "Date Night" }, { id: "background", label: "Background" }, { id: "pregame", label: "Pre-Game" },
  { id: "wedding", label: "Wedding" }, { id: "beach", label: "Beach" }, { id: "work", label: "Work" }, { id: "raki", label: "Rakı Sofrası" },
];
const DURATIONS = [{ m: 30, l: "30 min" }, { m: 60, l: "1 hour" }, { m: 120, l: "2 hours" }, { m: 180, l: "3 hours" }, { m: 240, l: "4+ hours" }];
const ERAS = [{ f: 1970, t: 1979, l: "70s" }, { f: 1980, t: 1989, l: "80s" }, { f: 1990, t: 1999, l: "90s" }, { f: 2000, t: 2009, l: "00s" }, { f: 2010, t: 2019, l: "10s" }, { f: 2020, t: 2030, l: "Current" }];
const EXAMPLES = [
  "2 saatlik eller havaya eski Türkçe şarkılar",
  "3 saatlik rakı sofrası. Türkçe. Herkes eşlik etsin. İlk başta sakin sonra coşsun.",
  "90'lar Türkçe pop ama çok cheesy olmasın",
  "2 saatlik road trip. Türkçe + yabancı karışık. Enerji giderek artsın.",
  "Beni şaşırt.",
];

interface Recent { id: string; title: string; stats: { totalSec: number; trackCount: number }; activity: string | null; updatedAt: number }
interface Preview { brief: PlaylistBrief; interpretation: string; detected: string[]; title: string }

export function HomeClient() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"sommelier" | "expert">("sommelier");
  const [moods, setMoods] = useState<Mood[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<"safe" | "balanced" | "surprise">("balanced");
  const [expert, setExpert] = useState({ energy: 7, danceability: 7, valence: 7, nostalgia: 6, popularity: 8, turkish: 70, discovery: 20, explicit: true, shuffle: false, repetition: "medium" as "low" | "medium" | "high", flow: "party_curve" as PlaylistBrief["flow"] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Partial<PlaylistBrief>>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api<{ items: Recent[] }>("/api/playlists").then((r) => setRecent(r.items)).catch(() => {});
  }, []);

  const overrides = useMemo(() => {
    const o: Partial<PlaylistBrief> = {};
    if (moods.length) o.moods = moods;
    if (activity) o.activity = activity;
    if (duration) o.durationMin = duration;
    const e = ERAS.find((x) => x.l === era);
    if (e) { o.eraFrom = e.f; o.eraTo = Math.min(e.t, new Date().getFullYear()); o.eraStrict = false; }
    if (discovery === "safe") o.discovery = 5;
    if (discovery === "surprise") o.discovery = 40;
    if (mode === "expert") {
      Object.assign(o, {
        energy: expert.energy, danceability: expert.danceability, valence: expert.valence, nostalgia: expert.nostalgia,
        popularity: expert.popularity, turkishShare: expert.turkish / 100, discovery: expert.discovery, explicit: expert.explicit,
        mode: expert.shuffle ? "shuffle" : "sequential", artistRepetition: expert.repetition, flow: expert.flow,
      });
    }
    return o;
  }, [moods, activity, duration, era, discovery, mode, expert]);

  // Live "I understood…" preview — rule-based, free, instant.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!prompt.trim() && !Object.keys(overrides).length) { setPreview(null); return; }
    timer.current = setTimeout(() => {
      api<Preview>("/api/brief", { method: "POST", body: { prompt, overrides } }).then(setPreview).catch(() => {});
    }, 350);
    return () => clearTimeout(timer.current);
  }, [prompt, overrides]);

  const create = useCallback(async (skipQuestions = false, extraAnswers?: Record<string, Partial<PlaylistBrief>>) => {
    setBusy(true);
    try {
      const ans = Object.values(extraAnswers ?? answers);
      const res = await api<{ status: string; playlist?: { id: string }; questions?: Question[] }>("/api/playlists", {
        method: "POST",
        body: { prompt, overrides, answers: ans.length ? ans : undefined, skipQuestions, referencePlaylistIds: refs.length ? refs : undefined, expert: mode === "expert" },
      });
      if (res.status === "needs_input" && res.questions) { setQuestions(res.questions); setBusy(false); return; }
      if (res.playlist) router.push(`/playlist/${res.playlist.id}`);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Bir şeyler ters gitti.");
      setBusy(false);
    }
  }, [prompt, overrides, answers, refs, mode, router]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const canCreate = prompt.trim().length > 0 || Object.keys(overrides).length > 0;

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">AI Music Sommelier</p>
        <h1 className="display">What are we listening to?</h1>
        <p className="lede">Tell me the moment, not the songs. I&apos;ll design the flow — warm-up, peak, finale — and you can steer anything.</p>
      </section>

      <div className="hero-wrap">
        <form
          className="hero-input"
          onSubmit={(e) => { e.preventDefault(); if (canCreate && !busy) create(); }}
        >
          <label htmlFor="prompt" className="eyebrow" style={{ position: "absolute", left: -9999 }}>Describe your playlist</label>
          <textarea
            id="prompt"
            value={prompt}
            placeholder="2 saatlik, eller havaya, 90'lar–2000'ler Türkçe pop..."
            onChange={(e) => { setPrompt(e.target.value); setQuestions(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); if (canCreate && !busy) create(); } }}
            rows={3}
            autoFocus
          />
          <div className="hero-actions">
            <Seg value={mode} onChange={setMode} options={[{ value: "sommelier", label: "Sommelier" }, { value: "expert", label: "Expert" }]} />
            <button className="btn btn-primary btn-xl" type="submit" disabled={!canCreate || busy}>
              {busy ? <><span className="spinner" /> Designing…</> : "Create"}
            </button>
          </div>
        </form>

        <div className="understood" aria-live="polite">
          {preview?.detected.map((d) => <span key={d} className="chip chip-soft chip-static">{d}</span>)}
        </div>
        {preview && (prompt.trim() || Object.keys(overrides).length > 0) && (
          <p className="small muted" style={{ marginTop: 6 }}>{preview.interpretation}</p>
        )}

        {questions && (
          <div className="card pad question section">
            <div className="stack">
              {questions.map((q) => (
                <div key={q.id}>
                  <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{q.text}</p>
                  <div className="chips">
                    {q.options.map((o) => (
                      <button
                        key={o.label} type="button" className="chip"
                        aria-pressed={answers[q.id] === o.patch}
                        onClick={() => {
                          const next = { ...answers, [q.id]: o.patch };
                          setAnswers(next);
                          if (Object.keys(next).length >= questions.length) create(true, next);
                        }}
                      >{o.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="row">
                <button className="btn btn-sm" type="button" onClick={() => create(true)} disabled={busy}>Just create — you decide</button>
                <span className="tiny faint">Questions are optional. I only ask when it really changes the playlist.</span>
              </div>
            </div>
          </div>
        )}

        {!prompt && (
          <div className="chips" style={{ marginTop: 14 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip chip-soft" onClick={() => setPrompt(ex)}>“{ex}”</button>
            ))}
          </div>
        )}

        <div className="chip-group-label">Mood</div>
        <div className="chips">
          {MOODS.map((m) => <button key={m.id} type="button" className="chip" aria-pressed={moods.includes(m.id)} onClick={() => setMoods(toggle(moods, m.id))}>{m.label}</button>)}
        </div>
        <div className="chip-group-label">Activity</div>
        <div className="chips">
          {ACTIVITIES.map((a) => <button key={a.id} type="button" className="chip" aria-pressed={activity === a.id} onClick={() => setActivity(activity === a.id ? null : a.id)}>{a.label}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 28 }}>
          <div>
            <div className="chip-group-label">Duration</div>
            <div className="chips">
              {DURATIONS.map((d) => <button key={d.m} type="button" className="chip" aria-pressed={duration === d.m} onClick={() => setDuration(duration === d.m ? null : d.m)}>⏱ {d.l}</button>)}
            </div>
          </div>
          <div>
            <div className="chip-group-label">Era</div>
            <div className="chips">
              {ERAS.map((e) => <button key={e.l} type="button" className="chip" aria-pressed={era === e.l} onClick={() => setEra(era === e.l ? null : e.l)}>{e.l}</button>)}
            </div>
          </div>
          <div>
            <div className="chip-group-label">Discovery</div>
            <Seg value={discovery} onChange={setDiscovery} options={[{ value: "safe", label: "Safe" }, { value: "balanced", label: "Balanced" }, { value: "surprise", label: "Surprise Me" }]} />
          </div>
        </div>

        {mode === "expert" && (
          <div className="card pad section">
            <div className="row between wrap">
              <h2 className="display" style={{ fontSize: 22 }}>Expert controls</h2>
              <span className="tiny muted">Overrides what the sommelier would infer</span>
            </div>
            <hr className="divider" />
            <Slider label="Energy" value={expert.energy} onChange={(v) => setExpert({ ...expert, energy: v })} suffix="/10" />
            <Slider label="Danceability" value={expert.danceability} onChange={(v) => setExpert({ ...expert, danceability: v })} suffix="/10" />
            <Slider label="Happiness" value={expert.valence} onChange={(v) => setExpert({ ...expert, valence: v })} suffix="/10" />
            <Slider label="Nostalgia" value={expert.nostalgia} onChange={(v) => setExpert({ ...expert, nostalgia: v })} suffix="/10" />
            <Slider label="Popularity" value={expert.popularity} onChange={(v) => setExpert({ ...expert, popularity: v })} suffix="/10" />
            <Slider label="Turkish" value={expert.turkish} min={0} max={100} step={5} onChange={(v) => setExpert({ ...expert, turkish: v })} suffix="%" />
            <Slider label="Discovery" value={expert.discovery} min={0} max={100} step={5} onChange={(v) => setExpert({ ...expert, discovery: v })} suffix="%" />
            <hr className="divider" />
            <div className="row wrap" style={{ gap: 18 }}>
              <label className="row small" style={{ fontWeight: 650 }}>Flow
                <select className="input" style={{ width: "auto", padding: "6px 10px" }} value={expert.flow} onChange={(e) => setExpert({ ...expert, flow: e.target.value as PlaylistBrief["flow"] })}>
                  <option value="flat">Flat</option><option value="gradual_rise">Gradual rise</option><option value="party_curve">Party curve</option>
                  <option value="rollercoaster">Rollercoaster</option><option value="peak_early">Peak early</option><option value="peak_late">Peak late</option><option value="wind_down">Wind down</option>
                </select>
              </label>
              <div className="row small" style={{ fontWeight: 650 }}>Repetition <Seg value={expert.repetition} onChange={(v) => setExpert({ ...expert, repetition: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Med" }, { value: "high", label: "High" }]} /></div>
              <button type="button" className="chip" aria-pressed={expert.shuffle} onClick={() => setExpert({ ...expert, shuffle: !expert.shuffle })}>🔀 Shuffle-friendly</button>
              <button type="button" className="chip" aria-pressed={!expert.explicit} onClick={() => setExpert({ ...expert, explicit: !expert.explicit })}>🚸 Clean only</button>
            </div>
          </div>
        )}
      </div>

      <section className="section" style={{ marginTop: 56 }}>
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h2 className="display" style={{ fontSize: 26 }}>Your recent playlists</h2>
          {recent.length > 0 && <span className="tiny muted">Select up to 3 as references: “bunların karışımı ama daha hareketli”</span>}
        </div>
        {recent.length === 0 ? (
          <div className="card empty">No playlists yet. Your first one is a sentence away.</div>
        ) : (
          <div className="recent-grid">
            {recent.slice(0, 12).map((r) => (
              <div key={r.id} className="card recent">
                <Link href={`/playlist/${r.id}`} style={{ textDecoration: "none" }}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span style={{ ...coverStyle(r.title), width: 44, height: 44, borderRadius: 12, flex: "none" }} aria-hidden />
                    <div className="grow">
                      <div className="title">{r.title}</div>
                      <div className="tiny muted mono">{Math.round(r.stats.totalSec / 60)} min · {r.stats.trackCount} tracks</div>
                    </div>
                  </div>
                </Link>
                <label className="row tiny muted" style={{ marginTop: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={refs.includes(r.id)} onChange={() => setRefs(refs.includes(r.id) ? refs.filter((x) => x !== r.id) : [...refs, r.id].slice(-3))} />
                  Use as reference
                </label>
              </div>
            ))}
          </div>
        )}
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
