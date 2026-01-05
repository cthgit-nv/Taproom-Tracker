/**
 * UPC Lookup Orchestrator
 * Tries multiple sources to find product information for a UPC
 * 1. Barcode Spider (primary - paid API)
 * 2. Open Food Facts (free, good for beverages)
 * 3. UPC Database (free tier available)
 */

import { lookupUpc as barcodeSpiderLookup, isBarcodeSpiderConfigured, BarcodeSpiderProduct } from "./barcodespider";

export interface UpcLookupResult {
  upc: string;
  title: string;
  brand?: string;
  size?: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  source: "barcodespider" | "openfoodfacts" | "upcitemdb" | "manual";
}

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    quantity?: string;
    image_url?: string;
    categories?: string;
    generic_name?: string;
  };
}

interface UpcItemDbResponse {
  code: string;
  total: number;
  items?: Array<{
    title?: string;
    brand?: string;
    description?: string;
    dimension?: string;
    weight?: string;
    images?: string[];
    category?: string;
  }>;
}

const cache = new Map<string, { result: UpcLookupResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached(upc: string): UpcLookupResult | null {
  const entry = cache.get(upc);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  cache.delete(upc);
  return null;
}

function setCache(upc: string, result: UpcLookupResult): void {
  cache.set(upc, { result, timestamp: Date.now() });
}

async function lookupOpenFoodFacts(upc: string): Promise<UpcLookupResult | null> {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, {
      headers: { "User-Agent": "WellStocked/1.0" },
    });
    
    if (!response.ok) return null;
    
    const data: OpenFoodFactsResponse = await response.json();
    
    if (data.status !== 1 || !data.product?.product_name) {
      return null;
    }
    
    const product = data.product;
    return {
      upc,
      title: product.product_name || "Unknown Product",
      brand: product.brands?.split(",")[0]?.trim(),
      size: product.quantity,
      description: product.generic_name,
      imageUrl: product.image_url,
      category: product.categories?.split(",")[0]?.trim(),
      source: "openfoodfacts",
    };
  } catch (error) {
    console.error("Open Food Facts lookup error:", error);
    return null;
  }
}

async function lookupUpcItemDb(upc: string): Promise<UpcLookupResult | null> {
  try {
    const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
      headers: { 
        "Accept": "application/json",
        "User-Agent": "WellStocked/1.0",
      },
    });
    
    if (!response.ok) return null;
    
    const data: UpcItemDbResponse = await response.json();
    
    if (!data.items?.length || !data.items[0]?.title) {
      return null;
    }
    
    const item = data.items[0];
    return {
      upc,
      title: item.title || "Unknown Product",
      brand: item.brand,
      size: item.dimension || item.weight,
      description: item.description,
      imageUrl: item.images?.[0],
      category: item.category,
      source: "upcitemdb",
    };
  } catch (error) {
    console.error("UPCitemdb lookup error:", error);
    return null;
  }
}

function convertBarcodeSpiderResult(result: BarcodeSpiderProduct): UpcLookupResult {
  return {
    upc: result.upc,
    title: result.title,
    brand: result.brand,
    size: result.size,
    description: result.description,
    imageUrl: result.imageUrl,
    category: result.category,
    source: "barcodespider",
  };
}

/**
 * Main UPC lookup function - tries multiple sources in sequence
 */
export async function lookupUpc(upc: string): Promise<UpcLookupResult | null> {
  const cleanUpc = upc.replace(/[-\s]/g, "");
  
  // Check cache first
  const cached = getCached(cleanUpc);
  if (cached) {
    console.log(`UPC ${cleanUpc} found in cache (source: ${cached.source})`);
    return cached;
  }
  
  // Try Barcode Spider first (primary paid API)
  if (isBarcodeSpiderConfigured()) {
    try {
      const bsResult = await barcodeSpiderLookup(cleanUpc);
      if (bsResult) {
        const result = convertBarcodeSpiderResult(bsResult);
        setCache(cleanUpc, result);
        console.log(`UPC ${cleanUpc} found via Barcode Spider`);
        return result;
      }
    } catch (error) {
      console.error("Barcode Spider error, trying fallback:", error);
    }
  }
  
  // Try Open Food Facts (free, good for beverages)
  const offResult = await lookupOpenFoodFacts(cleanUpc);
  if (offResult) {
    setCache(cleanUpc, offResult);
    console.log(`UPC ${cleanUpc} found via Open Food Facts`);
    return offResult;
  }
  
  // Try UPCitemdb (free tier - 100 lookups/day)
  const upcdbResult = await lookupUpcItemDb(cleanUpc);
  if (upcdbResult) {
    setCache(cleanUpc, upcdbResult);
    console.log(`UPC ${cleanUpc} found via UPCitemdb`);
    return upcdbResult;
  }
  
  console.log(`UPC ${cleanUpc} not found in any database`);
  return null;
}

/**
 * Check configuration status
 */
export function getLookupStatus(): { 
  barcodeSpider: boolean; 
  openFoodFacts: boolean; 
  upcItemDb: boolean;
} {
  return {
    barcodeSpider: isBarcodeSpiderConfigured(),
    openFoodFacts: true, // Always available (free API)
    upcItemDb: true, // Free tier available
  };
}
