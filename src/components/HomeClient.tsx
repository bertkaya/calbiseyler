"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, Mood, PlaylistBrief, Question } from "@/lib/types";
import { api, ApiError } from "./api";
import { Seg, Slider, Toast, coverStyle } from "./ui";
import { useT } from "./LangProvider";
import type { UiKey } from "@/lib/ui-i18n";

const MOODS: Mood[] = ["happy", "sad", "chill", "romantic", "energetic", "nostalgic", "melancholic", "party", "focus", "roadtrip"];
const ACTIVITIES: Activity[] = ["party", "dinner", "driving", "workout", "date", "background", "pregame", "wedding", "beach", "work", "raki"];
const DURATIONS = [30, 60, 120, 180, 240];
const ERAS = [{ f: 1970, t: 1979, l: "70s" }, { f: 1980, t: 1989, l: "80s" }, { f: 1990, t: 1999, l: "90s" }, { f: 2000, t: 2009, l: "00s" }, { f: 2010, t: 2019, l: "10s" }, { f: 2020, t: 2030, l: "Current" }];
const EXAMPLES = {
  tr: [
    "2 saatlik eller havaya eski Türkçe şarkılar",
    "3 saatlik rakı sofrası. Türkçe. Herkes eşlik etsin. İlk başta sakin sonra coşsun.",
    "90'lar Türkçe pop ama çok cheesy olmasın",
    "2 saatlik road trip. Türkçe + yabancı karışık. Enerji giderek artsın.",
    "Beni şaşırt.",
  ],
  en: [
    "2 hours of hands-in-the-air Turkish classics",
    "1 hour of 80s rock for a workout, no explicit",
    "Dinner with friends, then it should slowly turn into a party — 3 hours",
    "Road trip, Turkish + international mix, energy rising gradually",
    "Surprise me.",
  ],
};

interface Recent { id: string; title: string; stats: { totalSec: number; trackCount: number }; activity: string | null; updatedAt: number }
interface Preview { brief: PlaylistBrief; interpretation: string; detected: string[]; title: string }

export function HomeClient() {
  const router = useRouter();
  const { t, lang } = useT();
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
        body: { prompt, overrides, answers: ans.length ? ans : undefined, skipQuestions, referencePlaylistIds: refs.length ? refs : undefined, expert: mode === "expert", uiLang: lang },
      });
      if (res.status === "needs_input" && res.questions) { setQuestions(res.questions); setBusy(false); return; }
      if (res.playlist) router.push(`/playlist/${res.playlist.id}`);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : t("home.error"));
      setBusy(false);
    }
  }, [prompt, overrides, answers, refs, mode, router, lang, t]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const canCreate = prompt.trim().length > 0 || Object.keys(overrides).length > 0;

  return (
    <main>
      <section className="hero">
        <p className="eyebrow" lang="en">{t("home.eyebrow")}</p>
        <h1 className="display">{t("home.title")}</h1>
        <p className="lede">{t("home.lede")}</p>
      </section>

      <div className="hero-wrap">
        <form
          className="hero-input"
          onSubmit={(e) => { e.preventDefault(); if (canCreate && !busy) create(); }}
        >
          <label htmlFor="prompt" className="eyebrow" style={{ position: "absolute", left: -9999 }}>{t("home.inputLabel")}</label>
          <textarea
            id="prompt"
            value={prompt}
            placeholder={t("home.placeholder")}
            onChange={(e) => { setPrompt(e.target.value); setQuestions(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); if (canCreate && !busy) create(); } }}
            rows={3}
            autoFocus
          />
          <div className="hero-actions">
            <Seg value={mode} onChange={setMode} options={[{ value: "sommelier", label: "Sommelier" }, { value: "expert", label: "Expert" }]} />
            <button className="btn btn-primary btn-xl" type="submit" disabled={!canCreate || busy}>
              {busy ? <><span className="spinner" /> {t("home.designing")}</> : t("home.create")}
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
                <button className="btn btn-sm" type="button" onClick={() => create(true)} disabled={busy}>{t("home.justCreate")}</button>
                <span className="tiny faint">{t("home.questionsNote")}</span>
              </div>
            </div>
          </div>
        )}

        {!prompt && (
          <div className="chips" style={{ marginTop: 14 }}>
            {EXAMPLES[lang].map((ex) => (
              <button key={ex} type="button" className="chip chip-soft" onClick={() => setPrompt(ex)}>“{ex}”</button>
            ))}
          </div>
        )}

        <div className="chip-group-label">{t("home.mood")}</div>
        <div className="chips">
          {MOODS.map((m) => <button key={m} type="button" className="chip" aria-pressed={moods.includes(m)} onClick={() => setMoods(toggle(moods, m))}>{t(`mood.${m}` as UiKey)}</button>)}
        </div>
        <div className="chip-group-label">{t("home.activity")}</div>
        <div className="chips">
          {ACTIVITIES.map((a) => <button key={a} type="button" className="chip" aria-pressed={activity === a} onClick={() => setActivity(activity === a ? null : a)}>{t(`act.${a}` as UiKey)}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 28 }}>
          <div>
            <div className="chip-group-label">{t("home.duration")}</div>
            <div className="chips">
              {DURATIONS.map((d) => <button key={d} type="button" className="chip" aria-pressed={duration === d} onClick={() => setDuration(duration === d ? null : d)}>⏱ {t(`dur.${d}` as UiKey)}</button>)}
            </div>
          </div>
          <div>
            <div className="chip-group-label">{t("home.era")}</div>
            <div className="chips">
              {ERAS.map((e) => <button key={e.l} type="button" className="chip" aria-pressed={era === e.l} onClick={() => setEra(era === e.l ? null : e.l)}>{e.l}</button>)}
            </div>
          </div>
          <div>
            <div className="chip-group-label">{t("home.discovery")}</div>
            <Seg value={discovery} onChange={setDiscovery} options={[{ value: "safe", label: t("home.safe") }, { value: "balanced", label: t("home.balanced") }, { value: "surprise", label: t("home.surprise") }]} />
          </div>
        </div>

        {mode === "expert" && (
          <div className="card pad section">
            <div className="row between wrap">
              <h2 className="display" style={{ fontSize: 22 }}>{t("home.expertTitle")}</h2>
              <span className="tiny muted">{t("home.expertNote")}</span>
            </div>
            <hr className="divider" />
            <Slider label={t("s.energy")} value={expert.energy} onChange={(v) => setExpert({ ...expert, energy: v })} suffix="/10" />
            <Slider label={t("s.dance")} value={expert.danceability} onChange={(v) => setExpert({ ...expert, danceability: v })} suffix="/10" />
            <Slider label={t("s.happiness")} value={expert.valence} onChange={(v) => setExpert({ ...expert, valence: v })} suffix="/10" />
            <Slider label={t("s.nostalgia")} value={expert.nostalgia} onChange={(v) => setExpert({ ...expert, nostalgia: v })} suffix="/10" />
            <Slider label={t("s.popularity")} value={expert.popularity} onChange={(v) => setExpert({ ...expert, popularity: v })} suffix="/10" />
            <Slider label={t("s.turkish")} value={expert.turkish} min={0} max={100} step={5} onChange={(v) => setExpert({ ...expert, turkish: v })} suffix="%" />
            <Slider label={t("s.discovery")} value={expert.discovery} min={0} max={100} step={5} onChange={(v) => setExpert({ ...expert, discovery: v })} suffix="%" />
            <hr className="divider" />
            <div className="row wrap" style={{ gap: 18 }}>
              <label className="row small" style={{ fontWeight: 650 }}>{t("home.flow")}
                <select className="input" style={{ width: "auto", padding: "6px 10px" }} value={expert.flow} onChange={(e) => setExpert({ ...expert, flow: e.target.value as PlaylistBrief["flow"] })}>
                  {(["flat", "gradual_rise", "party_curve", "rollercoaster", "peak_early", "peak_late", "wind_down"] as const).map((f) => <option key={f} value={f}>{t(`flow.${f}`)}</option>)}
                </select>
              </label>
              <div className="row small" style={{ fontWeight: 650 }}>{t("home.repetition")} <Seg value={expert.repetition} onChange={(v) => setExpert({ ...expert, repetition: v })} options={[{ value: "low", label: t("lvl.low") }, { value: "medium", label: t("lvl.medium") }, { value: "high", label: t("lvl.high") }]} /></div>
              <button type="button" className="chip" aria-pressed={expert.shuffle} onClick={() => setExpert({ ...expert, shuffle: !expert.shuffle })}>{t("home.shuffle")}</button>
              <button type="button" className="chip" aria-pressed={!expert.explicit} onClick={() => setExpert({ ...expert, explicit: !expert.explicit })}>{t("home.clean")}</button>
            </div>
          </div>
        )}
      </div>

      <section className="section" style={{ marginTop: 56 }}>
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h2 className="display" style={{ fontSize: 26 }}>{t("home.recent")}</h2>
          {recent.length > 0 && <span className="tiny muted">{t("home.refHint")}</span>}
        </div>
        {recent.length === 0 ? (
          <div className="card empty">{t("home.noPlaylists")}</div>
        ) : (
          <div className="recent-grid">
            {recent.slice(0, 12).map((r) => (
              <div key={r.id} className="card recent">
                <Link href={`/playlist/${r.id}`} style={{ textDecoration: "none" }}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span style={{ ...coverStyle(r.title), width: 44, height: 44, borderRadius: 12, flex: "none" }} aria-hidden />
                    <div className="grow">
                      <div className="title">{r.title}</div>
                      <div className="tiny muted mono">{Math.round(r.stats.totalSec / 60)} min · {r.stats.trackCount} {t("home.tracks")}</div>
                    </div>
                  </div>
                </Link>
                <label className="row tiny muted" style={{ marginTop: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={refs.includes(r.id)} onChange={() => setRefs(refs.includes(r.id) ? refs.filter((x) => x !== r.id) : [...refs, r.id].slice(-3))} />
                  {t("home.useRef")}
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
