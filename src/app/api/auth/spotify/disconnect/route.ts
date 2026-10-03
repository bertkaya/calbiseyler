import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { deleteConnection } from "@/lib/server/repo";

export const runtime = "nodejs";

export const POST = route(async () => {
  const userId = await requireUser();
  deleteConnection(userId, "spotify");
  return json({ ok: true });
});
