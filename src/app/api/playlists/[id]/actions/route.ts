import { body, json, route } from "@/lib/server/http";
import { ActionBody } from "@/lib/server/schemas";
import { requireUser } from "@/lib/server/session";
import * as svc from "@/lib/server/playlists";
import type { IncludeExclude } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser();
  const { id } = await params;
  const a = await body(req, ActionBody);
  switch (a.action) {
    case "edit": return json(await svc.editWithText(userId, id, a.text));
    case "preset": return json(svc.applyMakeIt(userId, id, a.preset));
    case "replace": return json(svc.replaceTrack(userId, id, a.position, "replace", a.choiceId));
    case "alternatives": return json({ alternatives: svc.alternativesFor(userId, id, a.position) });
    case "feedback": return json(svc.giveFeedback(userId, id, a.position, a.kind));
    case "remove": return json(svc.removeTrack(userId, id, a.position, a.replace));
    case "move": return json(svc.moveTrack(userId, id, a.from, a.to));
    case "lock": return json(svc.toggleLock(userId, id, a.position));
    case "include": return json(svc.includeTrack(userId, id, a.trackId));
    case "includeExclude": return json(svc.setIncludeExclude(userId, id, a.which, a.value as IncludeExclude));
    case "suggestion": return json(svc.acceptSuggestion(userId, id, a.suggestionId, a.accept));
    case "undo": return json({ playlist: svc.undo(userId, id), message: "" });
    case "duplicate": return json({ playlist: svc.duplicate(userId, id) }, { status: 201 });
    case "share": return json({ shareId: svc.share(userId, id) });
    case "journal": return json({ signals: svc.addJournalEntry(userId, id, a.text) });
  }
});
