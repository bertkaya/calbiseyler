import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlaylistByShare } from "@/lib/server/repo";
import { hydrate } from "@/lib/server/playlists";
import { formatDuration, formatTrackTime } from "@/lib/engine/util";
import { ROLE_LABEL } from "@/lib/engine/roles";
import { RemixButton } from "@/components/RemixButton";
import { DNABars, coverStyle, initials } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId } = await params;
  const p = getPlaylistByShare(shareId);
  return { title: p ? `${p.title} · AI Music Sommelier` : "AI Music Sommelier", description: p?.interpretation };
}

/** Public, read-only share page: app.com/p/abc123 */
export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const raw = getPlaylistByShare(shareId);
  if (!raw) notFound();
  const pl = hydrate(raw);
  const lang = pl.brief.lang;
  return (
    <main>
      <section className="pl-head">
        <p className="eyebrow">Shared playlist</p>
        <h1 className="display pl-title">{pl.title}</h1>
        <div className="stat-row mono">
          <span>{formatDuration(pl.stats.totalSec)} · {pl.stats.trackCount} tracks</span>
          <span>🔥 {pl.stats.energyAvg.toFixed(1)} Energy</span>
          <span>❤️ {(pl.dna.nostalgia / 10).toFixed(1)} Nostalgia</span>
          <span>🎲 {Math.round(pl.stats.shuffleFriendly * 100)}% Shuffle Friendly</span>
        </div>
        <div className="row wrap" style={{ marginTop: 16 }}>
          <RemixButton shareId={shareId} />
          <a className="btn" href={`https://open.spotify.com/search/${encodeURIComponent(pl.title)}`} target="_blank" rel="noreferrer">Open in Spotify</a>
          <a className="btn" href={`https://music.apple.com/search?term=${encodeURIComponent(pl.items[0]?.track.title ?? "")}`} target="_blank" rel="noreferrer">Open in Apple Music</a>
          <a className="btn" href={`https://music.youtube.com/search?q=${encodeURIComponent(pl.items[0]?.track.title ?? "")}`} target="_blank" rel="noreferrer">Open in YouTube Music</a>
        </div>
      </section>
      <div className="grid-2 section">
        <div className="card" style={{ padding: 8 }}>
          <ol className="tracks">
            {pl.items.map((it, i) => (
              <li key={i} className="track" style={{ gridTemplateColumns: "34px 40px minmax(0,1fr)" }}>
                <span className="num">{i + 1}</span>
                <span className="cover" style={coverStyle(it.track.artist)}>{initials(it.track.artist)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t-title">{it.track.title}{["peak", "finale", "opener"].includes(it.role) && <span lang={lang} className={`role ${it.role}`}>{ROLE_LABEL[it.role][lang]}</span>}</div>
                  <div className="t-meta">{it.track.artist} · {it.track.year ?? "—"} · {formatTrackTime(it.track.durationSec)}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <aside className="stack">
          <div className="card pad"><span className="eyebrow">Playlist DNA</span><div style={{ marginTop: 10 }}><DNABars dna={pl.dna} lang={lang} /></div></div>
          <div className="card pad small"><span className="eyebrow">Why this playlist?</span><p>{pl.explanation}</p></div>
        </aside>
      </div>
    </main>
  );
}
