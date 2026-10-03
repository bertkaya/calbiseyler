/**
 * Anonymous-first identity: every visitor gets a signed, httpOnly user cookie.
 * Public mode needs no account; connecting Spotify attaches tokens to this user.
 */
import { cookies } from "next/headers";
import { randomId, sign, unsign } from "./crypto";
import { ensureUser } from "./repo";

export const USER_COOKIE = "ams_uid";

export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  return unsign(jar.get(USER_COOKIE)?.value);
}

/** Returns the user id, creating the user + cookie if needed (route handlers / server actions only). */
export async function requireUser(): Promise<string> {
  const jar = await cookies();
  let id = unsign(jar.get(USER_COOKIE)?.value);
  if (!id) {
    id = `u_${randomId(12)}`;
    jar.set(USER_COOKIE, sign(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  ensureUser(id);
  return id;
}
