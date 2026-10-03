import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { BriefPatch } from "@/lib/server/schemas";
import { enforceLimit } from "@/lib/server/ratelimit";
import { requireUser } from "@/lib/server/session";
import { previewBrief } from "@/lib/server/playlists";
import type { PlaylistBrief } from "@/lib/types";

export const runtime = "nodejs";

/** Instant (rule-based, zero-cost) brief preview while the user types. */
export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  await enforceLimit("brief", 300, 3600, userId);
  const b = await body(req, z.object({ prompt: z.string().max(2000), overrides: BriefPatch.optional() }));
  return json(await previewBrief(userId, b.prompt, b.overrides as Partial<PlaylistBrief> | undefined));
});
