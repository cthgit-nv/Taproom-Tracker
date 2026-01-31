import crypto from "crypto";

/**
 * Security utilities for authentication and rate limiting
 */

// Simple in-memory rate limiter (for production, use Redis)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Hash a PIN using SHA-256
 * Note: For production, consider using bcrypt with salt rounds
 */
export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

/**
 * Verify a PIN against a hash
 */
export function verifyPin(pin: string, hash: string): boolean {
  const pinHash = hashPin(pin);
  return crypto.timingSafeEqual(Buffer.from(pinHash), Buffer.from(hash));
}

/**
 * Simple rate limiter middleware factory
 * @param maxRequests Maximum requests allowed
 * @param windowMs Time window in milliseconds
 * @param identifier Function to get identifier from request (default: IP address)
 */
export function rateLimit(
  maxRequests: number = 5,
  windowMs: number = 15 * 60 * 1000, // 15 minutes default
  identifier?: (req: any) => string
) {
  return (req: any, res: any, next: any) => {
    const id = identifier
      ? identifier(req)
      : req.ip || req.connection.remoteAddress || "unknown";

    const now = Date.now();
    const entry = rateLimitStore.get(id);

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [key, value] of rateLimitStore.entries()) {
        if (value.resetTime < now) {
          rateLimitStore.delete(key);
        }
      }
    }

    if (!entry || entry.resetTime < now) {
      // New entry or expired
      rateLimitStore.set(id, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Please try again after ${retryAfter} seconds.`,
      });
    }

    entry.count++;
    next();
  };
}

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove < and >
    .trim()
    .slice(0, 10000); // Limit length
}

/**
 * Validate and sanitize numeric input
 */
export function sanitizeNumber(input: any, min?: number, max?: number): number | null {
  const num = typeof input === "string" ? parseFloat(input) : Number(input);
  if (isNaN(num)) return null;
  if (min !== undefined && num < min) return null;
  if (max !== undefined && num > max) return null;
  return num;
}
