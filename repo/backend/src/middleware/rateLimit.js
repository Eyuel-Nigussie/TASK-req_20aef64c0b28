'use strict';

const { tooManyRequests } = require('../utils/errors');

// In-memory IP + key rate limiter. Suitable for single-process deployments and
// test environments. For horizontally scaled production, swap the store for a
// shared Redis-backed counter (enforces the same window across instances).

function clientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown').toString();
}

function createRateLimiter({ windowMs, max, keyPrefix = 'rl', keyFn = clientIp, message = 'Too many requests' } = {}) {
  const resolveWindow = typeof windowMs === 'function' ? windowMs : () => Number(windowMs) || 60 * 1000;
  const resolveMax = typeof max === 'function' ? max : () => Number(max) || 60;
  const buckets = new Map();

  function prune(now) {
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k);
    }
  }

  function middleware(req, res, next) {
    const now = Date.now();
    if (buckets.size > 1024) prune(now);
    const window = resolveWindow();
    const ceiling = resolveMax();
    const key = `${keyPrefix}:${keyFn(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + window };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, ceiling - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(ceiling));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > ceiling) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return next(tooManyRequests(message, 'RATE_LIMITED'));
    }
    return next();
  }

  middleware.reset = () => buckets.clear();
  return middleware;
}

module.exports = { createRateLimiter, clientIp };
