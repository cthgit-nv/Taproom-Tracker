import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { updateProductSchema } from "@shared/schema";
import { z } from "zod";
import { sanitizeInput } from "../security";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware";
import { isBarcodeSpiderConfigured } from "../barcodespider";
import { lookupUpc as lookupUpcOrchestrator } from "../upcLookup";

/**
 * Register product routes
 */
export function registerProductRoutes(app: Express): void {
  app.get("/api/products", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    const products = await storage.getAllProducts();
    return res.json(products);
  }));

  // Search products by name (for manual inventory entry and UPC linking)
  app.get("/api/products/search", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const rawQuery = req.query.q as string || "";
    // Sanitize search query
    const query = sanitizeInput(rawQuery).toLowerCase().trim();
    if (!query || query.length < 2) {
      return res.json([]);
    }
    
    const allProducts = await storage.getAllProducts();
    const matches = allProducts.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.brand?.toLowerCase().includes(query) ||
      p.style?.toLowerCase().includes(query) ||
      p.upc?.includes(query)
    )
    .map(p => ({
      ...p,
      hasPlaceholderUpc: p.upc?.startsWith("prd_") || false,
    }))
    .slice(0, 20); // Limit to 20 results
    
    return res.json(matches);
  }));

  // Create new product with duplicate detection
  app.post("/api/products", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { name, upc, distributorId, brand, beverageType, style, notes, abv, ibu, isLocal, skipDuplicateCheck } = req.body;
    
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Product name is required" });
    }
    
    // Sanitize all text inputs
    const sanitizedName = sanitizeInput(name.trim());
    if (!sanitizedName || sanitizedName.length < 1) {
      return res.status(400).json({ error: "Invalid product name" });
    }
    
    const sanitizedUpc = upc ? sanitizeInput(upc) : null;
    const sanitizedBrand = brand ? sanitizeInput(brand) : null;
    const sanitizedStyle = style ? sanitizeInput(style) : null;
    const sanitizedNotes = notes ? sanitizeInput(notes) : null;
    
    const allProducts = await storage.getAllProducts();
    
    // Duplicate detection unless explicitly skipped
    if (!skipDuplicateCheck) {
      const normalizedName = name.toLowerCase().trim();
      
      // Check for exact UPC match
      if (upc) {
        const upcMatch = allProducts.find(p => p.upc === upc);
        if (upcMatch) {
          return res.status(409).json({ 
            error: "Duplicate product",
            message: "A product with this UPC already exists",
            existingProduct: upcMatch 
          });
        }
      }
      
      // Check for similar name matches (fuzzy)
      const similarProducts = allProducts.filter(p => {
        const existingName = p.name.toLowerCase().trim();
        // Exact match
        if (existingName === normalizedName) return true;
        // Contains match (either direction)
        if (existingName.includes(normalizedName) || normalizedName.includes(existingName)) return true;
        // Same brand and similar name
        if (brand && p.brand?.toLowerCase() === brand.toLowerCase()) {
          const words1 = normalizedName.split(/\s+/);
          const words2 = existingName.split(/\s+/);
          const commonWords = words1.filter((w: string) => words2.includes(w));
          if (commonWords.length >= 2) return true;
        }
        return false;
      });
      
      if (similarProducts.length > 0) {
        return res.status(409).json({
          error: "Potential duplicate",
          message: "Similar products already exist. Review and confirm to add anyway.",
          similarProducts: similarProducts.slice(0, 5)
        });
      }
    }
    
    // Create the product
    const product = await storage.createProduct({
      name: sanitizedName,
      upc: sanitizedUpc,
      distributorId: distributorId || null,
      brand: sanitizedBrand,
      beverageType: beverageType || "beer",
      style: sanitizedStyle,
      notes: sanitizedNotes,
      abv: abv || null,
      ibu: ibu || null,
      isLocal: isLocal || false,
    });
    
    return res.json(product);
  }));

  app.get("/api/products/:id", asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    const product = await storage.getProduct(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(product);
  }));

  app.patch("/api/products/:id", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    
    const product = await storage.getProduct(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const updates = updateProductSchema.parse(req.body);
    const updated = await storage.updateProduct(id, updates);
    return res.json(updated);
  }));

  // Look up product by UPC (internal database)
  app.get("/api/products/upc/:upc", asyncHandler(async (req: Request, res: Response) => {
    const product = await storage.getProductByUpc(req.params.upc);
    return res.json(product || null);
  }));

  // Batch re-categorize products using Barcode Spider data
  app.post("/api/products/recategorize", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    if (!isBarcodeSpiderConfigured()) {
      return res.status(400).json({ error: "Barcode Spider not configured" });
    }
    
    const { beverageTypeFilter } = req.body; // Optional: only process certain types
    
    const allProducts = await storage.getAllProducts();
    
    // Filter products that have UPCs and optionally by type
    let toProcess = allProducts.filter(p => p.upc);
    if (beverageTypeFilter) {
      toProcess = toProcess.filter(p => p.beverageType === beverageTypeFilter);
    }
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const results: Array<{ id: number; name: string; oldType?: string; newType?: string; brand?: string; status: string }> = [];
    
    // Helper to normalize beverage type from Barcode Spider data
    const normalizeBeverageType = (category?: string, parentCategory?: string): string => {
      const categoryStr = (category || "").toLowerCase();
      const parentStr = (parentCategory || "").toLowerCase();
      
      // Priority 1: Check parentCategory first
      if (parentStr.includes("spirit") || parentStr.includes("liquor")) {
        if (categoryStr.includes("wine") || categoryStr.includes("champagne") || 
            categoryStr.includes("prosecco") || categoryStr.includes("vermouth")) {
          return "wine";
        }
        return "spirits";
      }
      
      if (parentStr.includes("wine")) return "wine";
      if (parentStr.includes("beer") || parentStr.includes("brew")) return "beer";
      
      // Priority 2: Check category keywords
      if (categoryStr.includes("whiskey") || categoryStr.includes("whisky") ||
          categoryStr.includes("bourbon") || categoryStr.includes("vodka") ||
          categoryStr.includes("gin") || categoryStr.includes("rum") ||
          categoryStr.includes("tequila") || categoryStr.includes("brandy") ||
          categoryStr.includes("scotch") || categoryStr.includes("cognac") ||
          categoryStr.includes("liqueur") || categoryStr.includes("mezcal") ||
          categoryStr.includes("liquor") || categoryStr.includes("spirit") ||
          categoryStr.includes("aperitif") || categoryStr.includes("amaro")) {
        return "spirits";
      }
      
      const combined = `${categoryStr} ${parentStr}`;
      if (combined.includes("wine") || combined.includes("champagne")) return "wine";
      if (combined.includes("kombucha")) return "kombucha";
      if (combined.includes("cider")) return "cider";
      if (combined.includes("seltzer") || combined.includes("soda") || combined.includes("water")) return "na";
      if (combined.includes("beer") || combined.includes("lager") || combined.includes("stout")) return "beer";
      if (parentStr.includes("beverage") || parentStr.includes("tobacco")) return "spirits";
      
      return "beer";
    };
    
    // Process up to 50 products at a time to avoid rate limits
    const batch = toProcess.slice(0, 50);
    
    for (const product of batch) {
      try {
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const barcodeData = await lookupUpcOrchestrator(product.upc!);
        
        if (barcodeData && barcodeData.title) {
          const newBeverageType = normalizeBeverageType(barcodeData.category, undefined);
          const newBrand = barcodeData.brand || product.brand;
          
          // Only update if there's a change
          if (newBeverageType !== product.beverageType || (newBrand && newBrand !== product.brand)) {
            await storage.updateProduct(product.id, {
              beverageType: newBeverageType as any,
              brand: newBrand || undefined,
            });
            
            results.push({
              id: product.id,
              name: product.name,
              oldType: product.beverageType || "unknown",
              newType: newBeverageType,
              brand: newBrand || undefined,
              status: "updated",
            });
            updated++;
          } else {
            results.push({
              id: product.id,
              name: product.name,
              status: "no_change",
            });
            skipped++;
          }
        } else {
          results.push({
            id: product.id,
            name: product.name,
            status: "not_found",
          });
          skipped++;
        }
      } catch (error) {
        results.push({
          id: product.id,
          name: product.name,
          status: "error",
        });
        errors++;
      }
    }
    
    return res.json({
      updated,
      skipped,
      errors,
      total: batch.length,
      remaining: toProcess.length - batch.length,
      results,
    });
  }));
}
