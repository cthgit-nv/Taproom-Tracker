/**
 * Barcode Spider API Integration
 * UPC lookup service for product information
 * API Docs: https://devapi.barcodespider.com/documentation
 */

export interface BarcodeSpiderProduct {
  upc: string;
  title: string;
  brand?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
}

export interface BarcodeSpiderResponse {
  item_response: {
    code: number;
    status: string;
    message: string;
  };
  item_attributes?: {
    upc: string;
    title: string;
    brand?: string;
    description?: string;
    category?: string;
    image?: string;
  };
}

const BARCODESPIDER_API_URL = "https://api.barcodespider.com/v1/lookup";

/**
 * Check if Barcode Spider API is configured
 */
export function isBarcodeSpiderConfigured(): boolean {
  return !!process.env.BARCODESPIDER_API_TOKEN;
}

/**
 * Look up a UPC code using Barcode Spider API
 */
export async function lookupUpc(upc: string): Promise<BarcodeSpiderProduct | null> {
  const token = process.env.BARCODESPIDER_API_TOKEN;
  
  if (!token) {
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
      description: attrs.description || undefined,
      category: attrs.category || undefined,
      imageUrl: attrs.image || undefined,
    };
  } catch (error) {
    console.error("Barcode Spider lookup error:", error);
    throw error;
  }
}

/**
 * Get API status/configuration info
 */
export function getApiStatus(): { configured: boolean; endpoint: string } {
  return {
    configured: isBarcodeSpiderConfigured(),
    endpoint: BARCODESPIDER_API_URL,
  };
}
