import { decrypt, encrypt } from "./crypto";
import { getConnection, saveConnection } from "./repo";
import { refreshToken } from "../providers/spotify";
import type { ProviderAuth } from "../providers/types";

/** Valid Spotify user token (refreshing transparently), or null if not connected. */
export async function spotifyAuth(userId: string): Promise<ProviderAuth | null> {
  const c = getConnection(userId, "spotify");
  if (!c) return null;
  if (c.expiresAt > Date.now() + 60_000) return { accessToken: decrypt(c.accessTokenEnc) };
  if (!c.refreshTokenEnc) return null;
  try {
    const t = await refreshToken(decrypt(c.refreshTokenEnc));
    saveConnection(userId, {
      ...c,
      accessTokenEnc: encrypt(t.access_token),
      refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : c.refreshTokenEnc,
      expiresAt: Date.now() + t.expires_in * 1000,
      scope: t.scope ?? c.scope,
    });
    return { accessToken: t.access_token };
  } catch (e) {
    console.warn("[spotify] refresh failed", (e as Error).message);
    return null;
  }
}

/** Apple Music user token (from MusicKit JS authorize), or null. Apple tokens last ~6 months. */
export function appleAuth(userId: string): ProviderAuth | null {
  const c = getConnection(userId, "apple");
  if (!c || c.expiresAt < Date.now()) return null;
  return { accessToken: decrypt(c.accessTokenEnc) };
}
