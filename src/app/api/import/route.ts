import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { enforceLimit } from "@/lib/server/ratelimit";
import { requireUser } from "@/lib/server/session";
import { HttpError, importTracks } from "@/lib/server/playlists";
import { spotifyProvider } from "@/lib/providers/spotify";
import { spotifyAuth } from "@/lib/server/connections";
import { parseTextList } from "@/lib/server/import-text";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  await enforceLimit("import", 10, 3600, userId);
  const b = await body(req, z.object({ name: z.string().max(120).default(""), text: z.string().max(100_000).optional(), url: z.string().max(500).optional() }));
  if (b.url) {
    const auth = (await spotifyAuth(userId)) ?? undefined;
    const pl = await spotifyProvider.readPlaylist!(auth, b.url);
    return json({ playlist: await importTracks(userId, b.name || pl.name, pl.tracks) }, { status: 201 });
  }
  const items = parseTextList(b.text ?? "");
  if (!items.length) throw new HttpError(400, "Paste one track per line as “Artist - Title”.");
  return json({ playlist: await importTracks(userId, b.name || "Imported playlist", items) }, { status: 201 });
});
