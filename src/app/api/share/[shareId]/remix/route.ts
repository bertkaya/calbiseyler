import { json, route } from "@/lib/server/http";
import { enforceLimit } from "@/lib/server/ratelimit";
import { requireUser } from "@/lib/server/session";
import { HttpError, duplicate } from "@/lib/server/playlists";
import { getPlaylistByShare } from "@/lib/server/repo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ shareId: string }> };

export const POST = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  await enforceLimit("remix", 20, 3600, userId);
  const { shareId } = await params;
  const p = await getPlaylistByShare(shareId);
  if (!p) throw new HttpError(404, "Not found");
  return json({ playlist: await duplicate(userId, p.id) }, { status: 201 });
});
