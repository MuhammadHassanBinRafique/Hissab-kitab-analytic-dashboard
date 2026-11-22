import type { ZodTypeAny, z } from "zod";

// Every failure the API can report has one dedicated code. The web app can react to the code;
// the message is always safe to show to a user (no SQL, hostnames, stack traces or library names).
export type ErrorCode =
  | "INVALID_REQUEST" | "INVALID_CREDENTIALS" | "SESSION_EXPIRED" | "FORBIDDEN_ORIGIN"
  | "EMAIL_NOT_CONFIRMED" | "NOT_FOUND" | "METHOD_NOT_ALLOWED" | "PAYLOAD_TOO_LARGE" | "TOO_MANY_ATTEMPTS"
  | "AUTH_SERVICE_UNAVAILABLE" | "DATABASE_UNAVAILABLE" | "INTERNAL_ERROR";

export class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public headers: Record<string, string> = {}) { super(message); }
}
/** Supabase Auth itself failed (down, slow, rate limiting us). NOT the same as a wrong password. */
export class AuthServiceError extends Error {}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "INVALID_REQUEST", "Some of the information sent is not valid.");
  return r.data;
}

// Postgres / driver codes that mean "we could not get an answer from the database right now".
const DB_UNAVAILABLE = new Set([
  "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_DESTROYED",
  "CONNECTION_ENDED", "57014" /* statement timeout */, "57P01", "57P03", "53300" /* too many connections */,
  "28P01", "28000" /* auth to DB failed */, "XX000" /* pooler: tenant/user not found */,
]);
const isDatabaseUnavailable = (err: unknown) => {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" && (DB_UNAVAILABLE.has(code) || code.startsWith("08"));
};

/** Turns ANY thrown value into a safe response description. */
export function describe(err: unknown): { status: number; code: ErrorCode; message: string; headers: Record<string, string> } {
  if (err instanceof HttpError) return { status: err.status, code: err.code, message: err.message, headers: err.headers };
  if (err instanceof AuthServiceError) return { status: 503, code: "AUTH_SERVICE_UNAVAILABLE", message: "Sign-in is temporarily unavailable. Please try again in a moment.", headers: {} };
  if (isDatabaseUnavailable(err)) return { status: 503, code: "DATABASE_UNAVAILABLE", message: "We couldn't load your data right now. Please try again in a moment.", headers: {} };
  return { status: 500, code: "INTERNAL_ERROR", message: "Something went wrong on our side.", headers: {} };
}
