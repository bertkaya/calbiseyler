import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { authorizeUrl, spotifyProvider } from "@/lib/providers/spotify";
import { pkceChallenge, pkceVerifier, randomId, sign } from "@/lib/server/crypto";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  await requireUser();
  if (!spotifyProvider.isConfigured()) return json({ error: "Spotify is not configured (SPOTIFY_CLIENT_ID missing)" }, { status: 503 });
  const ret = new URL(req.url).searchParams.get("return") ?? "/";
  const safeReturn = ret.startsWith("/") && !ret.startsWith("//") ? ret : "/";
  const state = randomId(16);
  const verifier = pkceVerifier();
  const jar = await cookies();
  jar.set("ams_oauth", sign(JSON.stringify({ state, verifier, ret: safeReturn })), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/spotify", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state, pkceChallenge(verifier)));
});
