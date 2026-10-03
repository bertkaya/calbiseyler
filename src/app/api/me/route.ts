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
import { spotifyProvider } from "@/lib/providers/spotify";
import { youtubeApiKeyConfigured, youtubeOAuthConfigured } from "@/lib/providers/youtube";
import { deezerProvider } from "@/lib/providers/deezer";
import { reccoEnabled } from "@/lib/enrich/reccobeats";
import { getSongBpmEnabled } from "@/lib/enrich/getsongbpm";

export const runtime = "nodejs";

export const GET = route(async () => {
  const userId = await requireUser();
  const user = await getUser(userId);
  return json({
    learningPaused: user?.learningPaused ?? false,
    taste: describeTaste(await getTaste(userId)),
    theme: await getTheme(userId),
    connections: await listConnections(userId),
    stats: await gamification(userId),
    providers: providerStatus(),
    youtube: { oauth: youtubeOAuthConfigured(), apiKey: youtubeApiKeyConfigured() },
    llm: llmEnabled(),
    enrichment: [
      ...(spotifyProvider.isConfigured() && reccoEnabled() ? ["ReccoBeats"] : []),
      ...(getSongBpmEnabled() ? ["GetSongBPM"] : []),
      ...(deezerProvider.isConfigured() ? ["Deezer BPM"] : []),
    ],
    reflection: REFLECTION_PROMPTS,
  });
});

export const PATCH = route(async (req: Request) => {
  const userId = await requireUser();
  const b = await body(req, z.object({ learningPaused: z.boolean() }));
  await setLearningPaused(userId, b.learningPaused);
  return json({ ok: true });
});

/** Delete every trace of this user (playlists, taste, journal, connections). */
export const DELETE = route(async () => {
  const userId = await requireUser();
  await deleteUserData(userId);
  (await cookies()).delete(USER_COOKIE);
  return json({ ok: true });
});
