import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { BriefPatch } from "@/lib/server/schemas";
import { requireUser } from "@/lib/server/session";
import { HttpError, hydrate, setSaved, updateBrief } from "@/lib/server/playlists";
import { deletePlaylist, getPlaylist, listSessions } from "@/lib/server/repo";
import type { PlaylistBrief } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const p = getPlaylist(id);
  if (!p || p.userId !== userId) throw new HttpError(404, "Playlist not found");
  return json({ playlist: hydrate(p, userId), history: listSessions(id, 15) });
});

const Patch = z.object({ brief: BriefPatch.optional(), saved: z.boolean().optional(), title: z.string().max(120).optional() });

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const b = await body(req, Patch);
  if (b.brief && Object.keys(b.brief).length) return json(updateBrief(userId, id, b.brief as Partial<PlaylistBrief>));
  const playlist = setSaved(userId, id, b.saved ?? true, b.title);
  return json({ playlist, message: "" });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  if (!deletePlaylist(id, userId)) throw new HttpError(404, "Playlist not found");
  return json({ ok: true });
});
