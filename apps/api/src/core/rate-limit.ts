/** Fixed-window limiter, in memory. Fine for one instance; use a shared store (e.g. Redis) when you run several. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max = 5, private windowMs = 15 * 60_000) {}
  /** true = allowed. */
  hit(key: string, now = Date.now()): boolean {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) { this.hits.set(key, { count: 1, resetAt: now + this.windowMs }); return true; }
    e.count += 1;
    return e.count <= this.max;
  }
  reset(key: string) { this.hits.delete(key); }
}
