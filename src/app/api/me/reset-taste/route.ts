import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { resetTaste } from "@/lib/server/repo";

export const runtime = "nodejs";

export const POST = route(async () => {
  const userId = await requireUser();
  resetTaste(userId);
  return json({ ok: true });
});
