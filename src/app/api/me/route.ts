import { cookies } from "next/headers";
import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser, USER_COOKIE } from "@/lib/server/session";
import { deleteUserData, getTaste, getTheme, getUser, listConnections, setLearningPaused } from "@/lib/server/repo";
import { describeTaste } from "@/lib/taste/model";
import { gamification } from "@/lib/server/playlists";
import { providerStatus } from "@/lib/providers/registry";
import { llmEnabled } from "@/lib/ai/llm";
import { REFLECTION_PROMPTS } from "@/lib/taste/theme";

export const runtime = "nodejs";

export const GET = route(async () => {
  const userId = await requireUser();
  const user = getUser(userId);
  return json({
    learningPaused: user?.learningPaused ?? false,
    taste: describeTaste(getTaste(userId)),
    theme: getTheme(userId),
    connections: listConnections(userId),
    stats: gamification(userId),
    providers: providerStatus(),
    llm: llmEnabled(),
    reflection: REFLECTION_PROMPTS,
  });
});

export const PATCH = route(async (req: Request) => {
  const userId = await requireUser();
  const b = await body(req, z.object({ learningPaused: z.boolean() }));
  setLearningPaused(userId, b.learningPaused);
  return json({ ok: true });
});

/** Delete every trace of this user (playlists, taste, journal, connections). */
export const DELETE = route(async () => {
  const userId = await requireUser();
  deleteUserData(userId);
  (await cookies()).delete(USER_COOKIE);
  return json({ ok: true });
});
