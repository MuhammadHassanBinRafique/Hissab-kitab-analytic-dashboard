import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  ANALYTICS_DATABASE_URL: z.string().startsWith("postgres"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Only scheme + host count, so a trailing slash, capitals or a path (https://Site.vercel.app/login) cannot break the check.
  ALLOWED_ORIGIN: z.string().url().transform((v) => new URL(v).origin),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
});

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const e = schema.parse(env); // fail at startup, not on the first request
  return {
    supabaseUrl: e.SUPABASE_URL.replace(/\/$/, ""), supabaseAnonKey: e.SUPABASE_ANON_KEY,
    databaseUrl: e.ANALYTICS_DATABASE_URL, sessionSecret: e.SESSION_SECRET,
    allowedOrigin: e.ALLOWED_ORIGIN, secureCookies: e.NODE_ENV === "production", port: e.PORT,
  };
}
export type Config = ReturnType<typeof loadConfig>;
