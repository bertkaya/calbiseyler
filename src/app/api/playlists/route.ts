import { body, json, route } from "@/lib/server/http";
import { CreateBody } from "@/lib/server/schemas";
import { requireUser } from "@/lib/server/session";
import { createPlaylist } from "@/lib/server/playlists";
import { listPlaylists } from "@/lib/server/repo";
import type { PlaylistBrief } from "@/lib/types";

export const runtime = "nodejs";

export const GET = route(async () => {
  const userId = await requireUser();
  const items = (await listPlaylists(userId)).map((p) => ({ id: p.id, title: p.title, stats: p.stats, dna: p.dna, saved: p.saved, updatedAt: p.updatedAt, activity: p.brief.activity, moods: p.brief.moods }));
  return json({ items });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  const b = await body(req, CreateBody);
  const out = await createPlaylist(userId, {
    prompt: b.prompt,
    overrides: b.overrides as Partial<PlaylistBrief> | undefined,
    answers: b.answers as Partial<PlaylistBrief>[] | undefined,
    skipQuestions: b.skipQuestions,
    referencePlaylistIds: b.referencePlaylistIds,
    expert: b.expert,
    uiLang: b.uiLang,
  });
  return json(out, { status: out.status === "created" ? 201 : 200 });
});
