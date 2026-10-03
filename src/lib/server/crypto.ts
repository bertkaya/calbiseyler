/**
 * Secrets handling. APP_SECRET (.env) derives:
 *  - an HMAC key for signed cookies
 *  - an AES-256-GCM key for OAuth tokens at rest
 */
import crypto from "node:crypto";

let warned = false;
function secret(): Buffer {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set (>= 32 chars) in production");
    if (!warned) {
      console.warn("[security] APP_SECRET missing/short — using an insecure development secret. Set it in .env");
      warned = true;
    }
    return crypto.createHash("sha256").update("dev-only-insecure-secret-change-me").digest();
  }
  return crypto.createHash("sha256").update(s).digest();
}

const subkey = (label: string) => crypto.createHmac("sha256", secret()).update(label).digest();

export function sign(value: string): string {
  const mac = crypto.createHmac("sha256", subkey("cookie")).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value));
  const got = Buffer.from(signed);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got) ? value : null;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", subkey("tokens"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", subkey("tokens"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");
export const pkceVerifier = () => crypto.randomBytes(48).toString("base64url");
export const pkceChallenge = (v: string) => crypto.createHash("sha256").update(v).digest("base64url");
