import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { googleAuthorizeUrl, youtubeOAuthConfigured } from "@/lib/providers/youtube";
import { pkceChallenge, pkceVerifier, randomId, sign } from "@/lib/server/crypto";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  await requireUser();
  if (!youtubeOAuthConfigured()) return json({ error: "YouTube is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)" }, { status: 503 });
  const ret = new URL(req.url).searchParams.get("return") ?? "/";
  const safeReturn = ret.startsWith("/") && !ret.startsWith("//") ? ret : "/";
  const state = randomId(16);
  const verifier = pkceVerifier();
  (await cookies()).set("ams_goauth", sign(JSON.stringify({ state, verifier, ret: safeReturn })), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600,
  });
  return NextResponse.redirect(googleAuthorizeUrl(state, pkceChallenge(verifier)));
});
