import type { Settings, Product } from "@shared/schema";

export interface UntappdBeer {
  id: number;
  name: string;
  label: string;
  abv: number;
  ibu: number;
  style: string;
  description: string;
  rating: number;
  ratingCount: number;
  breweryName: string;
}

export interface UntappdConfig {
  readToken: string;
  writeToken: string;
  menuId: string;
  simulationMode: boolean;
}

interface UntappdSearchResponse {
  items: Array<{
    id: number;
    name: string;
    label_image: string;
    abv: number;
    ibu: number;
    style: string;
    description: string;
    rating: number;
    rating_count: number;
    brewery: {
      name: string;
    };
  }>;
}

const UNTAPPD_API_BASE = "https://business.untappd.com/api";

class UntappdService {
  private config: UntappdConfig | null = null;

  setConfig(settings: Settings) {
    if (!settings.untappdReadToken) {
      this.config = null;
      return;
    }

    this.config = {
      readToken: settings.untappdReadToken,
      writeToken: settings.untappdWriteToken || "",
      menuId: settings.untappdMenuId || "",
      simulationMode: settings.simulationMode,
    };
  }

  isConfigured(): boolean {
    return this.config !== null && !!this.config.readToken;
  }

  async searchBeer(query: string): Promise<UntappdBeer[]> {
    if (this.config?.simulationMode) {
      return this.getSimulatedSearchResults(query);
    }

    if (!this.config) {
      throw new Error("Untappd not configured");
    }

    try {
      const response = await fetch(`${UNTAPPD_API_BASE}/v1/items/search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${this.config.readToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Untappd search failed: ${response.status}`);
      }

      const data: UntappdSearchResponse = await response.json();
      
      return data.items.map((item) => ({
        id: item.id,
        name: item.name,
        label: item.label_image,
        abv: item.abv,
        ibu: item.ibu,
        style: item.style,
        description: item.description,
        rating: item.rating,
        ratingCount: item.rating_count,
        breweryName: item.brewery?.name || "",
      }));
    } catch (error) {
      console.error("Untappd search failed:", error);
      throw error;
    }
  }

  private getSimulatedSearchResults(query: string): UntappdBeer[] {
    const mockBeers: UntappdBeer[] = [
      {
        id: 1001,
        name: `${query} IPA`,
        label: "https://untappd.akamaized.net/site/beer_logos/beer-1001_small.jpeg",
        abv: 6.8,
        ibu: 65,
        style: "American IPA",
        description: `A bold and hoppy ${query} IPA with notes of citrus and pine.`,
        rating: 4.2,
        ratingCount: 1250,
        breweryName: "Local Craft Brewery",
      },
      {
        id: 1002,
        name: `${query} Lager`,
        label: "https://untappd.akamaized.net/site/beer_logos/beer-1002_small.jpeg",
        abv: 4.5,
        ibu: 20,
        style: "American Lager",
        description: `A crisp and refreshing ${query} lager, perfect for any occasion.`,
        rating: 3.8,
        ratingCount: 890,
        breweryName: "Regional Brewing Co",
      },
      {
        id: 1003,
        name: `${query} Stout`,
        label: "https://untappd.akamaized.net/site/beer_logos/beer-1003_small.jpeg",
        abv: 8.2,
        ibu: 45,
        style: "Imperial Stout",
        description: `A rich and roasty ${query} stout with chocolate and coffee notes.`,
        rating: 4.5,
        ratingCount: 2100,
        breweryName: "Artisan Brewers Guild",
      },
    ];

    return mockBeers.filter((beer) =>
      beer.name.toLowerCase().includes(query.toLowerCase()) ||
      beer.style.toLowerCase().includes(query.toLowerCase())
    );
  }

  async syncMenu(product: Product): Promise<boolean> {
    if (this.config?.simulationMode) {
      console.log(`[Simulation] Would sync product to Untappd menu:`, product.name);
      return true;
    }

    if (!this.config || !this.config.writeToken || !this.config.menuId) {
      throw new Error("Untappd write access not configured");
    }

    if (!product.untappdId) {
      throw new Error("Product has no Untappd ID");
    }

    try {
      // Create/update 1oz container with price_per_unit to solve pint vs ounce pricing
      const response = await fetch(
        `${UNTAPPD_API_BASE}/v1/items/${product.untappdId}/containers`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${this.config.writeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "1oz",
            price: product.pricePerUnit ? parseFloat(product.pricePerUnit) : 0,
            volume: 1,
            volume_unit: "oz",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to sync container: ${response.status}`);
      }

      const data = await response.json();
      return !!data.id;
    } catch (error) {
      console.error("Untappd menu sync failed:", error);
      throw error;
    }
  }

  async getItemDetails(itemId: number): Promise<UntappdBeer | null> {
    if (this.config?.simulationMode) {
      return {
        id: itemId,
        name: "Simulated Beer",
        label: "",
        abv: 5.5,
        ibu: 40,
        style: "Pale Ale",
        description: "A simulated beer for testing.",
        rating: 4.0,
        ratingCount: 500,
        breweryName: "Simulation Brewery",
      };
    }

    if (!this.config) {
      throw new Error("Untappd not configured");
    }

    try {
      const response = await fetch(`${UNTAPPD_API_BASE}/v1/items/${itemId}`, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${this.config.readToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      const item = await response.json();
      return {
        id: item.id,
        name: item.name,
        label: item.label_image,
        abv: item.abv,
        ibu: item.ibu,
        style: item.style,
        description: item.description,
        rating: item.rating,
        ratingCount: item.rating_count,
        breweryName: item.brewery?.name || "",
      };
    } catch (error) {
      console.error("Failed to get item details:", error);
      return null;
    }
  }
}

export const untappdService = new UntappdService();
