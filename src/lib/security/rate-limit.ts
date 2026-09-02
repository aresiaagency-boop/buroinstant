type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkEphemeralRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1 };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= options.limit,
    remaining: Math.max(0, options.limit - existing.count),
  };
}
