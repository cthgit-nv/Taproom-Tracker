/**
 * Barcode Spider API Integration
 * UPC lookup service for product information
 * API Docs: https://devapi.barcodespider.com/documentation
 */

export interface BarcodeSpiderProduct {
  upc: string;
  title: string;
  brand?: string;
  manufacturer?: string;
  description?: string;
  category?: string;
  parentCategory?: string;
  imageUrl?: string;
  model?: string;
  size?: string;
  weight?: string;
}

export interface BarcodeSpiderResponse {
  item_response: {
    code: number;
    status: string;
    message: string;
  };
  item_attributes?: {
    upc: string;
    ean?: string;
    title: string;
    brand?: string;
    manufacturer?: string;
    description?: string;
    category?: string;
    parent_category?: string;
    image?: string;
    model?: string;
    mpn?: string;
    color?: string;
    size?: string;
    weight?: string;
  };
}

const BARCODESPIDER_API_URL = "https://api.barcodespider.com/v1/lookup";

/**
 * Check if Barcode Spider API is configured
 */
export function isBarcodeSpiderConfigured(token?: string | null): boolean {
  return !!token;
}

/**
 * Look up a UPC code using Barcode Spider API
 * @param upc - The UPC code to look up
 * @param token - The API token (from database settings)
 */
export async function lookupUpc(upc: string, token: string): Promise<BarcodeSpiderProduct | null> {
  if (!token) {
    console.warn("Missing Barcode Spider Token");
    throw new Error("Barcode Spider API token not configured");
  }
  
  // Clean UPC - remove any dashes or spaces
  const cleanUpc = upc.replace(/[-\s]/g, "");
  
  try {
    const response = await fetch(`${BARCODESPIDER_API_URL}?upc=${cleanUpc}`, {
      method: "GET",
      headers: {
        "token": token,
        "Accept": "application/json",
      },
    });
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT: Rate limit exceeded. Please try again later.");
    }
    
    // 404 means product not found in database - this is not an error
    if (response.status === 404) {
      return null;
    }
    
    const data: BarcodeSpiderResponse = await response.json();
    
    // Check for authentication errors
    if (data.item_response.status === "AUTH_ERR" || response.status === 401) {
      throw new Error("AUTH_EXPIRED: Barcode Spider API subscription expired or invalid token. Please renew your subscription.");
    }
    
    if (!response.ok) {
      throw new Error(`API_ERROR: Barcode Spider API error: ${response.status}`);
    }
    
    // Check if product was found
    if (data.item_response.code !== 200 || !data.item_attributes) {
      return null; // Product not found in database
    }
    
    const attrs = data.item_attributes;
    
    return {
      upc: attrs.upc || cleanUpc,
      title: attrs.title || "Unknown Product",
      brand: attrs.brand || undefined,
      manufacturer: attrs.manufacturer || undefined,
      description: attrs.description || undefined,
      category: attrs.category || undefined,
      parentCategory: attrs.parent_category || undefined,
      imageUrl: attrs.image || undefined,
      model: attrs.model || undefined,
      size: attrs.size || undefined,
      weight: attrs.weight || undefined,
    };
  } catch (error) {
    console.error("Barcode Spider lookup error:", error);
    throw error;
  }
}

/**
 * Get API status/configuration info
 */
export function getApiStatus(token?: string | null): { configured: boolean; endpoint: string } {
  return {
    configured: isBarcodeSpiderConfigured(token),
    endpoint: BARCODESPIDER_API_URL,
  };
}
