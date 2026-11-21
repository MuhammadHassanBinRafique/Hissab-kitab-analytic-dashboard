import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./core/config";
import { createDb } from "./core/db";
import { supabaseVerifier } from "./core/supabase-auth";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = createApp({ db, config, log: true, verifier: supabaseVerifier(config.supabaseUrl, config.supabaseAnonKey) });

const server = serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`insights api on :${i.port}`));
const stop = () => { server.close(); void db.close().then(() => process.exit(0)); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
