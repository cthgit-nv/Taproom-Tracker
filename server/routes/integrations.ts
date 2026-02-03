import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, requireOwner, asyncHandler } from "../middleware";
import { fetchDailySales, fetchProductCatalog, isGoTabConfigured, type GoTabProduct } from "../gotab";
import { isUntappdConfigured, previewTapList, fetchFullTapList, type UntappdMenuItem } from "../untappd";

/**
 * Register integration routes (GoTab, Untappd)
 */
export function registerIntegrationRoutes(app: Express): void {
  // ========================
  // GoTab Sales Integration Routes (Admin/Owner Only)
  // ========================
  
  // Check GoTab configuration status
  app.get("/api/gotab/status", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    return res.json({ 
      configured: isGoTabConfigured(),
      message: isGoTabConfigured() ? "GoTab is configured" : "GoTab credentials not set"
    });
  }));
  
  // Sync daily sales from GoTab and update inventory
  app.post("/api/gotab/sync", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    if (!isGoTabConfigured()) {
      return res.status(400).json({ error: "GoTab not configured. Set environment variables." });
    }
    
    const { date } = req.body;
    const targetDate = date ? new Date(date) : new Date();
    
    // Fetch sales from GoTab API
    const salesData = await fetchDailySales(targetDate);
    
    // Process sales: deduct bottles/cans from inventory
    const products = await storage.getAllProducts();
    let processed = 0;
    let deducted = 0;
    const errors: string[] = [];
    
    for (const saleItem of salesData.items) {
      // Find matching product by UPC, PLU, or name
      const product = products.find(p => 
        p.upc === saleItem.sku || 
        p.plu?.toString() === saleItem.sku ||
        p.name.toLowerCase() === saleItem.name.toLowerCase()
      );
      
      if (!product) {
        errors.push(`Product not found: ${saleItem.name} (SKU: ${saleItem.sku})`);
        continue;
      }
      
      processed++;
      
      // Only deduct from bottles/cans (not draft beer which is tracked by PMB sensors)
      if (!product.isSoldByVolume && product.currentCountBottles !== null) {
        const newCount = Math.max(0, (product.currentCountBottles || 0) - saleItem.quantitySold);
        await storage.updateProduct(product.id, { currentCountBottles: newCount });
        deducted++;
      }
      // Draft beer (isSoldByVolume=true): revenue tracked but quantity comes from PMB sensors
    }
    
    return res.json({ 
      date: salesData.date,
      processed, 
      deducted,
      totalRevenue: salesData.totalRevenue,
      tabCount: salesData.tabCount,
      errors,
      message: `Synced ${processed} items, deducted ${deducted} bottle/can products` 
    });
  }));

  // Get daily sales from GoTab (read-only, no inventory update)
  app.post("/api/gotab/daily-sales", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    if (!isGoTabConfigured()) {
      return res.status(400).json({ error: "GoTab not configured. Set environment variables." });
    }
    
    const { date } = req.body;
    const targetDate = date ? new Date(date) : new Date();
    
    const salesData = await fetchDailySales(targetDate);
    return res.json(salesData);
  }));

  // Preview products from GoTab catalog (read-only)
  app.get("/api/gotab/products/preview", requireAuth, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    if (!isGoTabConfigured()) {
      return res.status(400).json({ error: "GoTab not configured" });
    }
    
    const products = await fetchProductCatalog();
    
    // Group by category for easier review
    const byCategory = new Map<string, GoTabProduct[]>();
    for (const p of products) {
      const cat = p.category || "Uncategorized";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(p);
    }
    
    // Identify beverage products (Beer, Wine, Spirits, etc.)
    const beverageCategories = ["Beer", "Draft", "Bottles", "Cans", "Wine", "Spirits", "Cocktails", "Drinks", "Beverages"];
    const beverageProducts = products.filter(p => 
      beverageCategories.some(cat => 
        p.category?.toLowerCase().includes(cat.toLowerCase()) ||
        p.revenueAccount?.toLowerCase().includes("alcohol") ||
        p.revenueAccount?.toLowerCase().includes("beer") ||
        p.revenueAccount?.toLowerCase().includes("beverage")
      )
    );
    
    return res.json({
      totalProducts: products.length,
      beverageCount: beverageProducts.length,
      categories: Object.fromEntries(byCategory),
      beverageProducts: beverageProducts.map(p => ({
        name: p.name,
        category: p.category,
        price: p.basePrice,
        revenueAccount: p.revenueAccount,
        active: p.active,
      })),
    });
  }));

  // Import products from GoTab (owner only)
  app.post("/api/gotab/products/import", requireAuth, requireOwner, asyncHandler(async (req: Request, res: Response) => {
    if (!isGoTabConfigured()) {
      return res.status(400).json({ error: "GoTab not configured" });
    }
    
    const { categoryFilter } = req.body; // Optional: only import certain categories
    
    const goTabProducts = await fetchProductCatalog();
    
    // Filter by category if specified
    let toImport = goTabProducts.filter(p => p.active);
    if (categoryFilter && Array.isArray(categoryFilter)) {
      toImport = toImport.filter(p => 
        categoryFilter.some((cat: string) => 
          p.category?.toLowerCase().includes(cat.toLowerCase())
        )
      );
    }
    
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const gp of toImport) {
      try {
        // Check if product already exists by name
        const existingProducts = await storage.getAllProducts();
        const exists = existingProducts.some(p => 
          p.name.toLowerCase() === gp.name.toLowerCase()
        );
        
        if (exists) {
          skipped++;
          continue;
        }
        
        // Determine if this is a draft beer (sold by volume)
        const isDraft = gp.category?.toLowerCase().includes("draft") || 
                        gp.category?.toLowerCase().includes("tap");
        
        await storage.createProduct({
          name: gp.name,
          upc: gp.productUuid, // Use GoTab UUID as UPC for matching
          pricePerUnit: gp.basePrice.toFixed(2),
          isSoldByVolume: isDraft,
          category: gp.category,
          currentCountBottles: isDraft ? null : 0,
          backupCount: isDraft ? null : 0,
        });
        
        imported++;
      } catch (err) {
        errors.push(`Failed to import ${gp.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    return res.json({
      imported,
      skipped,
      errors,
      message: `Imported ${imported} products, skipped ${skipped} existing`,
    });
  }));

  // ========================
  // Untappd Integration Routes (Admin/Owner Only)
  // ========================
  
  // Check Untappd configuration status
  app.get("/api/untappd/status", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    return res.json({ 
      configured: isUntappdConfigured(),
      message: isUntappdConfigured() ? "Untappd is configured" : "Untappd credentials not set"
    });
  }));

  // Preview tap list from Untappd (read-only)
  app.get("/api/untappd/taplist/preview", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    if (!isUntappdConfigured()) {
      return res.status(400).json({ error: "Untappd not configured. Set UNTAPPD_EMAIL, UNTAPPD_API_TOKEN, and UNTAPPD_LOCATION_ID." });
    }
    
    const tapList = await previewTapList();
    return res.json(tapList);
  }));

  // Sync tap list from Untappd - creates new products for new beers
  app.post("/api/untappd/sync", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    if (!isUntappdConfigured()) {
      return res.status(400).json({ error: "Untappd not configured" });
    }
    
    const tapListItems = await fetchFullTapList();
    const existingProducts = await storage.getAllProducts();
    
    let newBeers: Array<{ name: string; brewery: string | null; style: string | null }> = [];
    let existingCount = 0;
    let updated = 0;
    const errors: string[] = [];
    
    for (const item of tapListItems) {
      try {
        // Skip items without a name
        if (!item.name || item.name.trim() === "") {
          errors.push(`Skipped item with no name (ID: ${item.id})`);
          continue;
        }
        
        // Try to find existing product by Untappd ID or name
        const existingByUntappdId = item.untappd_id 
          ? existingProducts.find(p => p.untappdId === item.untappd_id)
          : null;
        const existingByName = existingProducts.find(p => 
          p.name.toLowerCase() === item.name.toLowerCase()
        );
        
        const existing = existingByUntappdId || existingByName;
        
        if (existing) {
          existingCount++;
          
          // Update existing product with Untappd data
          await storage.updateProduct(existing.id, {
            untappdId: item.untappd_id ?? undefined,
            untappdContainerId: item.container_id?.toString() ?? undefined,
            abv: item.abv ?? undefined,
            ibu: item.ibu ?? undefined,
            style: item.style ?? undefined,
            description: item.description ?? undefined,
            labelImageUrl: item.label_image_hd || item.label_image || undefined,
            untappdRating: item.rating ?? undefined,
            untappdRatingCount: item.rating_count ?? undefined,
            brand: item.brewery ?? undefined,
          });
          updated++;
        } else {
          // Create new product from Untappd
          await storage.createProduct({
            name: item.name.trim(),
            untappdId: item.untappd_id ?? undefined,
            untappdContainerId: item.container_id?.toString() ?? undefined,
            abv: item.abv ?? undefined,
            ibu: item.ibu ?? undefined,
            style: item.style ?? undefined,
            description: item.description ?? undefined,
            labelImageUrl: item.label_image_hd || item.label_image || undefined,
            isSoldByVolume: true, // Draft beers are sold by volume
            untappdRating: item.rating ?? undefined,
            untappdRatingCount: item.rating_count ?? undefined,
            brand: item.brewery ?? undefined,
            beverageType: "beer",
          });
          
          newBeers.push({
            name: item.name,
            brewery: item.brewery,
            style: item.style,
          });
        }
      } catch (err) {
        errors.push(`Failed to sync ${item.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    return res.json({
      totalOnTap: tapListItems.length,
      newBeers,
      existingBeers: existingCount,
      updated,
      errors,
      message: `Synced ${tapListItems.length} beers: ${newBeers.length} new, ${existingCount} existing (${updated} updated)${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
    });
  }));
}
