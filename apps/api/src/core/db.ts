import postgres from "postgres";

export type Row = Record<string, any>;
export type Query = <R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>;

/**
 * The ONLY way modules reach the database. Every call runs in one READ ONLY transaction with
 * `app.user_id` set, so the database itself (see db/analytics_ro.sql) returns only that user's rows.
 */
export interface Db {
  asUser<T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDb(url: string): Db {
  // prepare:false is required behind Supabase's transaction pooler (pgbouncer).
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 300, connect_timeout: 10 });
  return {
    asUser: async (userId, fn) => {
      const t0 = performance.now();
      let queries = 0;
      try {
        return (await sql.begin("read only", async (tx) => {
          await tx`SELECT set_config('app.user_id', ${userId}, true)`; // true = this transaction only
          return fn(((text: string, params: unknown[] = []) => { queries++; return tx.unsafe(text, params as any[]); }) as unknown as Query);
        })) as any;
      } finally {
        // Compare with the request time that follows: if they are close, the time is spent talking to the database.
        console.log(`   db: ${Math.round(performance.now() - t0)} ms, ${queries} queries`);
      }
    },
    close: () => sql.end(),
  };
}

/** SQL for an unambiguous ISO-8601 UTC string (the portal stores UTC in timestamp-without-zone columns). */
export const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
