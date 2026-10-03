import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { encrypt } from "@/lib/server/crypto";
import { saveConnection } from "@/lib/server/repo";

export const runtime = "nodejs";

/** Stores the Music User Token obtained by MusicKit JS `authorize()` (encrypted at rest). */
export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  const { musicUserToken, storefront } = await body(req, z.object({ musicUserToken: z.string().min(20).max(4000), storefront: z.string().max(8).optional() }));
  saveConnection(userId, {
    provider: "apple",
    accessTokenEnc: encrypt(musicUserToken),
    refreshTokenEnc: null,
    expiresAt: Date.now() + 180 * 864e5,
    accountId: storefront ?? null,
    accountName: storefront ? `Apple Music (${storefront.toUpperCase()})` : "Apple Music",
    scope: null,
  });
  return json({ ok: true });
});
