import { json, route } from "@/lib/server/http";
import { allSeedTracks, searchTracks, CATALOG_ARTISTS, norm } from "@/lib/catalog";
import { dynamicTracks } from "@/lib/server/repo";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  const tracks = searchTracks(q, [...allSeedTracks(), ...await dynamicTracks(500)], 10);
  const nq = norm(q);
  const artists = nq.length >= 2 ? CATALOG_ARTISTS.filter((a) => norm(a).includes(nq)).slice(0, 5) : [];
  return json({ tracks, artists });
});
