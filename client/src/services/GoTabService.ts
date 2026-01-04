import type { Settings, Product } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GoTabSaleItem {
  productId: number;
  name: string;
  quantity: number;
  revenue: number;
  isSoldByVolume: boolean;
}

interface GoTabDailySales {
  date: string;
  items: GoTabSaleItem[];
  totalRevenue: number;
}

class GoTabService {
  private settings: Settings | null = null;

  async initialize(settings: Settings | null): Promise<void> {
    this.settings = settings;
  }

  isConfigured(): boolean {
    return !!(
      this.settings?.gotabLocId &&
      this.settings?.gotabKey &&
      this.settings?.gotabSecret
    );
  }

  async fetchDailySales(date: string = new Date().toISOString().split('T')[0]): Promise<GoTabDailySales | null> {
    if (!this.isConfigured()) {
      console.warn("GoTab not configured");
      return null;
    }

    try {
      const response = await apiRequest("POST", "/api/gotab/daily-sales", { date });
      return response.json();
    } catch (error) {
      console.error("Failed to fetch GoTab sales:", error);
      return null;
    }
  }

  async syncSalesData(): Promise<{ processed: number; errors: string[] }> {
    if (!this.isConfigured()) {
      return { processed: 0, errors: ["GoTab not configured"] };
    }

    try {
      const response = await apiRequest("POST", "/api/gotab/sync");
      const result = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      
      return result;
    } catch (error) {
      console.error("Failed to sync GoTab sales:", error);
      return { processed: 0, errors: [String(error)] };
    }
  }

  async getRevenueByProduct(productId: number, startDate: string, endDate: string): Promise<number> {
    if (!this.isConfigured()) {
      return 0;
    }

    try {
      const response = await fetch(
        `/api/gotab/revenue/${productId}?start=${startDate}&end=${endDate}`
      );
      if (!response.ok) return 0;
      const data = await response.json();
      return data.revenue || 0;
    } catch (error) {
      console.error("Failed to get revenue:", error);
      return 0;
    }
  }
}

export const goTabService = new GoTabService();
