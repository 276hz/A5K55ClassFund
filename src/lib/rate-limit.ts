/** Giới hạn tốc độ trong bộ nhớ theo từng instance (xem SECURITY.md về giới hạn khi chạy serverless). */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max = 60, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}
export function resetRateLimit() { hits.clear(); }
