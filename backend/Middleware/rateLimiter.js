/**
 * Sliding Window In-Memory Rate Limiter for HTTP endpoints.
 * Protects sensitive endpoints like /auth/login and /auth/signup against brute-force attacks.
 */
function createHttpRateLimiter({ windowMs = 15 * 60 * 1000, max = 15, message = 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }) {
    const hits = new Map();

    // Clean up expired entries every 5 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [key, timestamps] of hits.entries()) {
            const valid = timestamps.filter(t => now - t < windowMs);
            if (valid.length === 0) {
                hits.delete(key);
            } else {
                hits.set(key, valid);
            }
        }
    }, 5 * 60 * 1000);

    return (req, res, next) => {
        // Identify client by forwarded-for header or socket remote address
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
        const key = `${ip}_${req.path}`;
        const now = Date.now();

        const timestamps = hits.get(key) || [];
        const recentTimestamps = timestamps.filter(t => now - t < windowMs);

        if (recentTimestamps.length >= max) {
            const retryAfterSec = Math.ceil((recentTimestamps[0] + windowMs - now) / 1000);
            res.setHeader('Retry-After', retryAfterSec);
            return res.status(429).json({
                success: false,
                payload: {
                    error: message,
                    retryAfter: retryAfterSec
                }
            });
        }

        recentTimestamps.push(now);
        hits.set(key, recentTimestamps);
        next();
    };
}

/**
 * WebSocket Token-Bucket Rate Limiter per user.
 * Prevents spamming socket events (e.g. typing_start flood, message spam).
 */
class WsRateLimiter {
    constructor({ capacity = 20, refillRatePerSec = 10 } = {}) {
        this.capacity = capacity;
        this.refillRatePerSec = refillRatePerSec;
        this.buckets = new Map();

        // Cleanup stale user buckets every 2 minutes
        setInterval(() => this.cleanup(), 2 * 60 * 1000);
    }

    /**
     * Check if a user is allowed to emit an event.
     * @param {number|string} userId 
     * @returns {boolean} true if allowed, false if rate limited
     */
    allow(userId) {
        if (!userId) return true;
        const now = Date.now();
        let bucket = this.buckets.get(userId);

        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefill: now };
            this.buckets.set(userId, bucket);
        } else {
            // Refill tokens based on elapsed time
            const elapsedSec = (now - bucket.lastRefill) / 1000;
            bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRatePerSec);
            bucket.lastRefill = now;
        }

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }

        return false;
    }

    cleanup() {
        const now = Date.now();
        for (const [userId, bucket] of this.buckets.entries()) {
            if (now - bucket.lastRefill > 60 * 1000) {
                this.buckets.delete(userId);
            }
        }
    }
}

const authRateLimiter = createHttpRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // max 15 attempts
    message: 'Tài khoản hoặc IP đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau 15 phút.'
});

const wsRateLimiter = new WsRateLimiter({
    capacity: 20,
    refillRatePerSec: 10
});

module.exports = {
    createHttpRateLimiter,
    authRateLimiter,
    wsRateLimiter
};
