import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler, getSimulationMode } from "../middleware";

/**
 * Register keg routes
 */
export function registerKegRoutes(app: Express): void {
  app.get("/api/kegs", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    // Filter kegs by simulation mode from settings
    const isSimulation = getSimulationMode(req);
    const kegs = await storage.getAllKegs(isSimulation);
    return res.json(kegs);
  }));

  app.patch("/api/kegs/:id", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid keg ID" });
    }
    
    const { status, remainingVolOz, dateTapped, dateKicked } = req.body;
    
    const updateData: Record<string, any> = {};
    if (status) updateData.status = status;
    if (remainingVolOz !== undefined) updateData.remainingVolOz = remainingVolOz;
    if (dateTapped !== undefined) updateData.dateTapped = dateTapped ? new Date(dateTapped) : null;
    if (dateKicked !== undefined) updateData.dateKicked = dateKicked ? new Date(dateKicked) : null;
    
    const keg = await storage.updateKeg(id, updateData);
    if (!keg) {
      return res.status(404).json({ error: "Keg not found" });
    }
    
    return res.json(keg);
  }));

  // Get keg inventory summary for a product (tapped and on_deck kegs)
  app.get("/api/kegs/product/:productId/summary", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.productId);
    // Filter kegs by simulation mode from settings
    const isSimulation = getSimulationMode(req);
    const allKegs = await storage.getAllKegs(isSimulation);
    const productKegs = allKegs.filter(k => k.productId === productId);
    
    const tappedKegs = productKegs.filter(k => k.status === "tapped");
    const onDeckKegs = productKegs.filter(k => k.status === "on_deck");
    
    // Get tap info for tapped kegs
    const taps = await storage.getAllTaps();
    const tappedWithTaps = tappedKegs.map(keg => {
      const tap = taps.find(t => t.currentKegId === keg.id);
      const remainingPercent = keg.remainingVolOz && keg.initialVolOz 
        ? (keg.remainingVolOz / keg.initialVolOz) 
        : 0;
      return {
        kegId: keg.id,
        tapNumber: tap?.tapNumber || keg.tapNumber,
        remainingPercent,
        remainingVolOz: keg.remainingVolOz,
        initialVolOz: keg.initialVolOz,
      };
    });
    
    // Calculate total keg equivalent (on_deck = 1.0 each, tapped = remaining %)
    const onDeckTotal = onDeckKegs.length;
    const tappedTotal = tappedWithTaps.reduce((sum, k) => sum + k.remainingPercent, 0);
    
    return res.json({
      tapped: tappedWithTaps,
      onDeckCount: onDeckTotal,
      totalKegEquivalent: onDeckTotal + tappedTotal,
    });
  }));
}
