import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler } from "../middleware";

/**
 * Register taps and zones routes
 */
export function registerTapsZonesRoutes(app: Express): void {
  // ========================
  // Taps Routes
  // ========================
  
  app.get("/api/taps", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const taps = await storage.getAllTaps();
    return res.json(taps);
  }));

  // ========================
  // Zones Routes
  // ========================
  
  app.get("/api/zones", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const zones = await storage.getAllZones();
    return res.json(zones);
  }));
}
