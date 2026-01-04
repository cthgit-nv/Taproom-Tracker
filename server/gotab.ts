// GoTab API Integration Service
// Fetches daily sales data via GraphQL API using OAuth client credentials flow
// Uses environment variables for secure credential storage

const GOTAB_OAUTH_URL = "https://gotab.io/api/oauth/token";
const GOTAB_GRAPHQL_URL = "https://gotab.io/api/v2/graph";

// Token cache to avoid repeated auth requests
let cachedToken: { token: string; expires: number } | null = null;

interface GoTabItem {
  itemId: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
  voided: boolean;
  comped: boolean;
}

interface GoTabTab {
  tabId: string;
  tabUuid: string;
  name: string;
  status: string;
  total: number;
  subtotal: number;
  opened: string;
  closed: string | null;
  itemsList: GoTabItem[];
}

export interface GoTabSalesResult {
  date: string;
  items: Array<{
    sku: string;
    name: string;
    quantitySold: number;
    revenue: number;
  }>;
  totalRevenue: number;
  tabCount: number;
}

// Get credentials from environment variables
function getCredentials() {
  const apiKey = process.env.GOTAB_API_KEY;
  const apiSecret = process.env.GOTAB_API_SECRET;
  const locationUuid = process.env.GOTAB_LOCATION_UUID;
  
  if (!apiKey || !apiSecret || !locationUuid) {
    throw new Error("GoTab credentials not configured. Set GOTAB_API_KEY, GOTAB_API_SECRET, and GOTAB_LOCATION_UUID.");
  }
  
  return { apiKey, apiSecret, locationUuid };
}

// Get access token using client credentials flow
async function getAccessToken(): Promise<string> {
  const { apiKey, apiSecret } = getCredentials();
  
  // Check cache - tokens are valid for 24 hours, refresh 1 hour before expiry
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires > now + 3600) {
    return cachedToken.token;
  }
  
  const response = await fetch(GOTAB_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_access_id: apiKey,
      api_access_secret: apiSecret,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("GoTab OAuth error:", response.status, errorText);
    throw new Error(`GoTab authentication failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.token) {
    throw new Error("GoTab authentication failed: No token received");
  }
  
  // Cache the token
  cachedToken = {
    token: data.token,
    expires: data.expires || (now + 86400), // Default 24 hour expiry
  };
  
  return cachedToken.token;
}

// Convert date to GoTab fiscal day format (YYYYMMDD as integer)
function toFiscalDay(date: Date): number {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return parseInt(`${year}${month}${day}`, 10);
}

// Fetch daily sales from GoTab
export async function fetchDailySales(date?: Date): Promise<GoTabSalesResult> {
  const { locationUuid } = getCredentials();
  const accessToken = await getAccessToken();
  
  const targetDate = date || new Date();
  const fiscalDay = toFiscalDay(targetDate);
  
  const query = `
    query Location($locationUuid: String!, $tabsCondition: TabCondition, $itemFilter: ItemFilter) {
      location(locationUuid: $locationUuid) {
        tabs(first: 500, condition: $tabsCondition) {
          nodes {
            tabId
            tabUuid
            name
            status
            total
            subtotal
            opened
            closed
            itemsList(filter: $itemFilter) {
              itemId
              productId
              sku
              name
              quantity
              subtotal
              unitPrice
              voided
              comped
            }
          }
        }
      }
    }
  `;
  
  const variables = {
    locationUuid,
    tabsCondition: {
      fiscalDay,
      hasPlacedOrders: true,
    },
    itemFilter: {
      ordered: { equalTo: true },
    },
  };
  
  try {
    const response = await fetch(GOTAB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("GoTab API error:", response.status, errorText);
      
      // Clear cached token on auth error
      if (response.status === 401 || response.status === 403) {
        cachedToken = null;
      }
      
      throw new Error(`GoTab API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.errors) {
      console.error("GoTab GraphQL errors:", data.errors);
      throw new Error(`GoTab GraphQL error: ${data.errors[0]?.message}`);
    }
    
    const tabs: GoTabTab[] = data.data?.location?.tabs?.nodes || [];
    
    // Aggregate items by SKU
    const itemAggregates = new Map<string, { name: string; quantitySold: number; revenue: number }>();
    let totalRevenue = 0;
    
    for (const tab of tabs) {
      if (tab.status === 'CLOSED' || tab.status === 'PAID') {
        for (const item of tab.itemsList) {
          // Skip voided/comped items
          if (item.voided || item.comped) continue;
          
          const key = item.sku || item.productId || item.name;
          const existing = itemAggregates.get(key) || { name: item.name, quantitySold: 0, revenue: 0 };
          existing.quantitySold += item.quantity;
          existing.revenue += item.subtotal;
          itemAggregates.set(key, existing);
          
          totalRevenue += item.subtotal;
        }
      }
    }
    
    const items = Array.from(itemAggregates.entries()).map(([sku, data]) => ({
      sku,
      name: data.name,
      quantitySold: data.quantitySold,
      revenue: data.revenue,
    }));
    
    return {
      date: targetDate.toISOString().split('T')[0],
      items,
      totalRevenue,
      tabCount: tabs.filter(t => t.status === 'CLOSED' || t.status === 'PAID').length,
    };
  } catch (error) {
    console.error("Error fetching GoTab sales:", error);
    throw error;
  }
}

// Check if GoTab is configured via environment variables
export function isGoTabConfigured(): boolean {
  return !!(
    process.env.GOTAB_API_KEY &&
    process.env.GOTAB_API_SECRET &&
    process.env.GOTAB_LOCATION_UUID
  );
}
