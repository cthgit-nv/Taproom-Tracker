import type { Settings, Product } from "@shared/schema";

export interface KegLevel {
  deviceId: number;
  lineNum: number;
  fillLevelPercent: number;
  kegSizeOz: number;
  remainingOz: number;
  tappingDate: Date | null;
  pricingState: number;
}

export interface PMBConfig {
  serverUrl: string;
  username: string;
  password: string;
  simulationMode: boolean;
}

interface AuthResponse {
  authtoken: string;
  uuid: string;
}

interface KegLevelResponse {
  uuid: string;
  device_id: number;
  line_num: number;
  fill_level_perc: number;
  fill_level_keg_size: number;
  fill_level_keg_size_dp: number;
  tapping_date: number;
  pricing_state: number;
}

const CLIENT_ID = 1001;
const CLIENT_NAME = "WellStocked";

class PourMyBeerService {
  private authToken: string | null = null;
  private tokenExpiry: number = 0;
  private config: PMBConfig | null = null;
  private previousLevels: Map<string, number> = new Map();

  setConfig(settings: Settings) {
    if (!settings.pmbLocalIp || !settings.pmbLocalPort) {
      this.config = null;
      return;
    }

    this.config = {
      serverUrl: `http://${settings.pmbLocalIp}:${settings.pmbLocalPort}`,
      username: settings.pmbUsername || "",
      password: settings.pmbPassword || "",
      simulationMode: settings.simulationMode,
    };
  }

  isConfigured(): boolean {
    return this.config !== null && !this.config.simulationMode;
  }

  private async authenticate(): Promise<string> {
    if (!this.config) {
      throw new Error("PMB not configured");
    }

    if (this.authToken && Date.now() < this.tokenExpiry) {
      return this.authToken;
    }

    const response = await fetch(`${this.config.serverUrl}/m2m/api/authtoken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        id: CLIENT_ID,
        name: CLIENT_NAME,
        type: "json-server-control",
        version: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`PMB authentication failed: ${response.status}`);
    }

    const data: AuthResponse = await response.json();
    this.authToken = data.authtoken;
    this.tokenExpiry = Date.now() + 3600000;
    return this.authToken;
  }

  async getKegLevels(tapNumbers: number[]): Promise<Map<number, KegLevel>> {
    if (this.config?.simulationMode) {
      return this.getSimulatedKegLevels(tapNumbers);
    }

    if (!this.config) {
      throw new Error("PMB not configured");
    }

    const token = await this.authenticate();
    const results = new Map<number, KegLevel>();

    for (const tapNumber of tapNumbers) {
      try {
        const deviceId = Math.floor(tapNumber / 10) || 1;
        const lineNum = tapNumber % 10 || tapNumber;

        const response = await fetch(`${this.config.serverUrl}/m2m/api/getkeglevels`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            device_id: deviceId,
            line_num: lineNum,
          }),
        });

        if (response.ok) {
          const data: KegLevelResponse = await response.json();
          const kegSizeOz = data.fill_level_keg_size / Math.pow(10, data.fill_level_keg_size_dp);
          // fill_level_perc from PMB is 0-10000 (100.00%), so divide by 100 to get 0-100
          const fillPercent = data.fill_level_perc / 100;
          const remainingOz = (fillPercent / 100) * kegSizeOz;

          const kegLevel: KegLevel = {
            deviceId: data.device_id,
            lineNum: data.line_num,
            fillLevelPercent: fillPercent, // Now stored as 0-100
            kegSizeOz: kegSizeOz,
            remainingOz: remainingOz,
            tappingDate: data.tapping_date ? new Date(data.tapping_date * 1000) : null,
            pricingState: data.pricing_state,
          };

          results.set(tapNumber, kegLevel);

          const key = `${deviceId}-${lineNum}`;
          const previousLevel = this.previousLevels.get(key);
          if (previousLevel !== undefined && previousLevel > 0 && fillPercent === 0) {
            this.onKegKicked(tapNumber, deviceId, lineNum);
          }
          this.previousLevels.set(key, fillPercent);
        }
      } catch (error) {
        console.error(`Failed to get keg level for tap ${tapNumber}:`, error);
      }
    }

    return results;
  }

  private getSimulatedKegLevels(tapNumbers: number[]): Map<number, KegLevel> {
    const results = new Map<number, KegLevel>();
    
    for (const tapNumber of tapNumbers) {
      const fillPercent = 30 + Math.random() * 60;
      const kegSizeOz = 1984;
      
      results.set(tapNumber, {
        deviceId: 1,
        lineNum: tapNumber,
        fillLevelPercent: fillPercent,
        kegSizeOz: kegSizeOz,
        remainingOz: (fillPercent / 100) * kegSizeOz,
        tappingDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        pricingState: 0,
      });
    }

    return results;
  }

  private kickCallbacks: Array<(tapNumber: number, productName?: string) => void> = [];

  /**
   * Register a callback to be called when a keg kick is detected
   * (when fill level drops to 0% from a non-zero value)
   */
  onKickDetected(callback: (tapNumber: number, productName?: string) => void) {
    this.kickCallbacks.push(callback);
  }

  private onKegKicked(tapNumber: number, deviceId: number, lineNum: number) {
    console.log(`Keg kicked on tap ${tapNumber} (device ${deviceId}, line ${lineNum})`);
    for (const callback of this.kickCallbacks) {
      callback(tapNumber, undefined);
    }
  }

  async updateTap(tapNumber: number, product: Product): Promise<boolean> {
    if (this.config?.simulationMode) {
      console.log(`[Simulation] Would update tap ${tapNumber} with product:`, product.name);
      return true;
    }

    if (!this.config) {
      throw new Error("PMB not configured");
    }

    const token = await this.authenticate();

    const priceInCents = product.pricePerUnit 
      ? Math.round(parseFloat(product.pricePerUnit) * 100)
      : 0;

    const editProductResponse = await fetch(`${this.config.serverUrl}/m2m/api/editproduct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: CLIENT_ID,
        plu: product.plu,
        name: product.name,
        price_per_unit: priceInCents,
        is_active: 1,
        abv: product.abv ? Math.round(product.abv * 100) : -1,
        ibu: product.ibu || -1,
        style: product.style || "",
        product_type: 1,
      }),
    });

    if (!editProductResponse.ok) {
      throw new Error(`Failed to edit product in PMB: ${editProductResponse.status}`);
    }

    const configUpdateResponse = await fetch(`${this.config.serverUrl}/m2m/api/configupdate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: CLIENT_ID,
      }),
    });

    if (!configUpdateResponse.ok) {
      throw new Error(`Failed to push config update to PMB screens: ${configUpdateResponse.status}`);
    }

    return true;
  }

  async getProductList(): Promise<unknown[]> {
    if (this.config?.simulationMode) {
      return [];
    }

    if (!this.config) {
      throw new Error("PMB not configured");
    }

    const token = await this.authenticate();

    const response = await fetch(`${this.config.serverUrl}/m2m/api/productlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get product list from PMB: ${response.status}`);
    }

    const data = await response.json();
    return data.productlist || [];
  }
}

export const pmbService = new PourMyBeerService();
