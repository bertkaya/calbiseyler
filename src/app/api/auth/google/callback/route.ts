import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { googleExchangeCode, youtubeChannel } from "@/lib/providers/youtube";
import { encrypt, unsign } from "@/lib/server/crypto";
import { saveConnection } from "@/lib/server/repo";
import { appUrl } from "@/lib/server/app-url";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const userId = await requireUser();
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = unsign(jar.get("ams_goauth")?.value);
  jar.delete({ name: "ams_goauth", path: "/api/auth/google" });
  const stored = raw ? (JSON.parse(raw) as { state: string; verifier: string; ret: string }) : null;
  const base = process.env.APP_URL ? appUrl() : url.origin;
  const back = (q: string) => NextResponse.redirect(new URL(`${stored?.ret ?? "/"}${(stored?.ret ?? "/").includes("?") ? "&" : "?"}${q}`, base));
  if (!stored || stored.state !== url.searchParams.get("state")) return back("youtube=state_error");
  const code = url.searchParams.get("code");
  if (!code) return back(`youtube=${encodeURIComponent(url.searchParams.get("error") ?? "denied")}`);
  const t = await googleExchangeCode(code, stored.verifier);
  let channel: { id: string; title: string } | null = null;
  try { channel = await youtubeChannel({ accessToken: t.access_token }); } catch { /* optional */ }
  await saveConnection(userId, {
    provider: "youtube",
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: Date.now() + t.expires_in * 1000,
    accountId: channel?.id ?? null,
    accountName: channel?.title ?? "YouTube",
    scope: t.scope ?? null,
  });
  return back("youtube=connected");
});
