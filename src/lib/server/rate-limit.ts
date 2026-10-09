/**
 * Small in-memory sliding-window limiter for unauthenticated endpoints. Per instance only: with several app instances
 * the effective limit multiplies, which is acceptable for a family-sized deployment (documented in docs/SECURITY.md).
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return recent.length > limit;
}

export function clientKey(request: Request): string {
  return (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() || 'unknown';
}
