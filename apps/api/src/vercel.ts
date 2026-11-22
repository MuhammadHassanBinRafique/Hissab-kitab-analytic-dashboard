// Entry point for Vercel (bundled by scripts/build-vercel.mjs). Locally use `npm start` (src/server.ts) instead.
import { handle } from "@hono/node-server/vercel";
import { createApp } from "./app";
import { loadConfig } from "./core/config";
import { createDb } from "./core/db";
import { supabaseVerifier } from "./core/supabase-auth";

const config = loadConfig();
export default handle(createApp({ db: createDb(config.databaseUrl), config, verifier: supabaseVerifier(config.supabaseUrl, config.supabaseAnonKey) }));
