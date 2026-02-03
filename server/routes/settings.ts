import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { insertPricingDefaultSchema } from "@shared/schema";
import { requireAuth, requireAdmin, requireOwner, asyncHandler, invalidateSettingsCache } from "../middleware";

/**
 * Register settings and pricing defaults routes
 */
export function registerSettingsRoutes(app: Express): void {
  // Get settings - requires authentication
  app.get("/api/settings", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const settings = await storage.getSettings();
    return res.json(settings || null);
  }));

  // Update settings
  app.patch("/api/settings", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const { 
      gotabLocId, gotabKey, gotabSecret, 
      untappdReadToken, untappdWriteToken, untappdMenuId,
      simulationMode, ...otherFields 
    } = req.body;
    
    // API key fields require owner access
    const apiKeyFields = { gotabLocId, gotabKey, gotabSecret, untappdReadToken, untappdWriteToken, untappdMenuId };
    const hasApiKeyChanges = Object.values(apiKeyFields).some(v => v !== undefined);
    
    if (hasApiKeyChanges && req.user.role !== "owner") {
      return res.status(403).json({ error: "Owner access required for API keys" });
    }
    
    // Simulation mode can be changed by admin or owner
    if (simulationMode !== undefined && !["owner", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Admin access required for simulation mode" });
    }
    
    const settings = await storage.updateSettings({
      ...otherFields,
      ...(hasApiKeyChanges ? apiKeyFields : {}),
      ...(simulationMode !== undefined ? { simulationMode } : {}),
    });
    
    // Invalidate cache after update
    invalidateSettingsCache();
    
    return res.json(settings);
  }));

  // ========================
  // Pricing Defaults Routes
  // ========================

  app.get("/api/pricing-defaults", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const defaults = await storage.getAllPricingDefaults();
    return res.json(defaults);
  }));

  app.post("/api/pricing-defaults", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const parsed = insertPricingDefaultSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid pricing default data", details: parsed.error.errors });
    }
    const result = await storage.upsertPricingDefault(parsed.data);
    return res.json(result);
  }));
}
