import { sign, verify } from "hono/jwt";
import type { SessionUser } from "@insights/contracts";

// In production the "__Host-" prefix makes browsers refuse the cookie unless it is Secure, Path=/ and has no Domain.
export const cookieName = (secure: boolean) => (secure ? "__Host-hk_insights" : "hk_insights");
export const IDLE_SECONDS = 15 * 60; // same idle limit as the portal
const MAX_SECONDS = 8 * 60 * 60; // hard cap: sign in again after 8 hours
const now = () => Math.floor(Date.now() / 1000);

/** A signed entry pass holding only the user's id and email. The password is never stored anywhere. */
export function issue(secret: string, user: SessionUser, authTime = now()) {
  const iat = now();
  return sign({ sub: user.id, em: user.email, iat, at: authTime, exp: Math.min(iat + IDLE_SECONDS, authTime + MAX_SECONDS) }, secret, "HS256");
}

export async function read(secret: string, token: string): Promise<{ user: SessionUser; authTime: number } | null> {
  try {
    const p = await verify(token, secret, "HS256"); // also rejects expired tokens
    if (typeof p.sub !== "string" || typeof p.em !== "string") return null;
    return { user: { id: p.sub, email: p.em }, authTime: Number(p.at) };
  } catch {
    return null;
  }
}
