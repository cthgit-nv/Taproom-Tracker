import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, asyncHandler, getSimulationMode } from "../middleware";
import { lookupUpc as lookupUpcOrchestrator, getLookupStatus } from "../upcLookup";
import { getApiStatus as getBarcodeSpiderStatus } from "../barcodespider";

/**
 * Register receiving and UPC lookup routes
 */
export function registerReceivingRoutes(app: Express): void {
  // Look up product by UPC (internal database)
  app.get("/api/products/upc/:upc", asyncHandler(async (req: Request, res: Response) => {
    const product = await storage.getProductByUpc(req.params.upc);
    return res.json(product || null);
  }));

  // Look up UPC via multiple sources (Barcode Spider, Open Food Facts, UPCitemdb)
  app.get("/api/barcodespider/lookup/:upc", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const result = await lookupUpcOrchestrator(req.params.upc);
    return res.json(result);
  }));

  // Check UPC lookup API status (all sources)
  app.get("/api/barcodespider/status", asyncHandler(async (req: Request, res: Response) => {
    const status = getBarcodeSpiderStatus();
    return res.json({
      ...status,
      sources: getLookupStatus(),
    });
  }));

  // Receive inventory - kegs go to kegs table, bottles add to backupCount
  // In simulation mode, data is tagged with isSimulation=true to keep it separate
  app.post("/api/receiving", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { productId, quantity, isKeg, zoneId } = req.body;
    
    if (!productId || quantity === undefined) {
      return res.status(400).json({ error: "Product ID and quantity are required" });
    }
    
    // Get simulation mode setting
    const isSimulation = getSimulationMode(req);
    
    // Create receiving log (tagged with simulation mode)
    const log = await storage.createReceivingLog({
      userId: req.session.userId!,
      productId,
      quantity,
      isKeg: isKeg || false,
      zoneId: zoneId || null,
      isSimulation,
    });
    
    if (isKeg) {
      // For kegs, create keg record with on_deck status (cooler stock)
      // The kegs table is the source of truth for keg inventory
      await storage.createKeg({
        productId,
        status: "on_deck",
        initialVolOz: 1984, // Standard 1/2 barrel (15.5 gal = 1984 oz)
        remainingVolOz: 1984,
        dateReceived: new Date(),
        dateTapped: null,
        dateKicked: null,
        isSimulation,
      });
    } else if (!isSimulation) {
      // For bottles/cans in production mode, receiving adds to backupCount
      // In simulation mode, we don't modify product counts
      const product = await storage.getProduct(productId);
      if (product) {
        const newBackupCount = (product.backupCount || 0) + quantity;
        await storage.updateProduct(productId, { backupCount: newBackupCount });
      }
    }
    
    return res.json(log);
  }));
}