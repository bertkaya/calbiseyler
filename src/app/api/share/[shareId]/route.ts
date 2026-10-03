import { json, route } from "@/lib/server/http";
import { HttpError, hydrate } from "@/lib/server/playlists";
import { getPlaylistByShare } from "@/lib/server/repo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ shareId: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { shareId } = await params;
  const p = getPlaylistByShare(shareId);
  if (!p) throw new HttpError(404, "Not found");
  const h = hydrate(p);
  // Public view: never leak the owner id or private prompt history.
  return json({ playlist: { ...h, userId: undefined, prompt: undefined } });
});
