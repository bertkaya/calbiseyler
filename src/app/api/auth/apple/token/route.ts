import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { appleDeveloperToken } from "@/lib/providers/apple";

export const runtime = "nodejs";

/**
 * MusicKit JS needs the developer token in the browser (this is Apple's
 * intended design; the token is scoped to the app and expires). Only issued
 * to visitors with a session cookie.
 */
export const GET = route(async () => {
  await requireUser();
  const developerToken = appleDeveloperToken();
  if (!developerToken) return json({ error: "Apple Music is not configured" }, { status: 503 });
  return json({ developerToken, appName: "AI Music Sommelier" }, { headers: { "Cache-Control": "private, max-age=3600" } });
});
