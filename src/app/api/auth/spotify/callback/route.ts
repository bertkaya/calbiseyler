import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { exchangeCode, me } from "@/lib/providers/spotify";
import { encrypt, unsign } from "@/lib/server/crypto";
import { saveConnection } from "@/lib/server/repo";
import { appUrl } from "@/lib/server/app-url";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const userId = await requireUser();
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = unsign(jar.get("ams_oauth")?.value);
  jar.delete({ name: "ams_oauth", path: "/api/auth/spotify" });
  const stored = raw ? (JSON.parse(raw) as { state: string; verifier: string; ret: string }) : null;
  const base = process.env.APP_URL ? appUrl() : url.origin;
  const back = (q: string) => NextResponse.redirect(new URL(`${stored?.ret ?? "/"}${(stored?.ret ?? "/").includes("?") ? "&" : "?"}${q}`, base));
  if (!stored || stored.state !== url.searchParams.get("state")) return back("spotify=state_error");
  const code = url.searchParams.get("code");
  if (!code) return back(`spotify=${encodeURIComponent(url.searchParams.get("error") ?? "denied")}`);
  const t = await exchangeCode(code, stored.verifier);
  let profile: { id: string; display_name: string | null } | null = null;
  try { profile = await me({ accessToken: t.access_token }); } catch { /* profile optional */ }
  await saveConnection(userId, {
    provider: "spotify",
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: Date.now() + t.expires_in * 1000,
    accountId: profile?.id ?? null,
    accountName: profile?.display_name ?? profile?.id ?? null,
    scope: t.scope ?? null,
  });
  return back("spotify=connected");
});
