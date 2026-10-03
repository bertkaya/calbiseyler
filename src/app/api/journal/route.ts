import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { deleteJournal, listJournal } from "@/lib/server/repo";
import { addJournalEntry } from "@/lib/server/playlists";

export const runtime = "nodejs";

export const GET = route(async () => {
  const userId = await requireUser();
  return json({ entries: listJournal(userId) });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  const b = await body(req, z.object({ text: z.string().min(1).max(2000), playlistId: z.string().nullable().default(null) }));
  return json({ signals: addJournalEntry(userId, b.playlistId, b.text) }, { status: 201 });
});

export const DELETE = route(async (req: Request) => {
  const userId = await requireUser();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (Number.isFinite(id)) deleteJournal(userId, id);
  return json({ ok: true });
});
