import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { Settings } from "@shared/schema";

// Cache settings in memory with TTL
let cachedSettings: Settings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Middleware to attach settings to request
 * Caches settings to reduce database queries
 */
export async function attachSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const now = Date.now();
  
  // Refresh cache if expired
  if (!cachedSettings || (now - cacheTimestamp) > CACHE_TTL_MS) {
    cachedSettings = (await storage.getSettings()) || undefined;
    cacheTimestamp = now;
  }

  // Attach to request
  (req as any).settings = cachedSettings;
  next();
}

/**
 * Get simulation mode from request settings
 * Helper function for routes
 */
export function getSimulationMode(req: Request): boolean {
  const settings = (req as any).settings as Settings | undefined;
  return settings?.simulationMode ?? false;
}

/**
 * Invalidate settings cache (call after settings update)
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}
