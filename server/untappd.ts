// Untappd for Business API Integration Service
// Fetches tap list and beer data using Basic Auth (email:token)
// Uses environment variables for secure credential storage

const UNTAPPD_API_BASE = "https://business.untappd.com/api/v1";

export interface UntappdMenuItem {
  id: number;
  untappd_id: number | null;
  label_image: string | null;
  label_image_hd: string | null;
  name: string;
  description: string | null;
  style: string | null;
  abv: number | null;
  ibu: number | null;
  brewery: string | null;
  brewery_location: string | null;
  rating: number | null;
  rating_count: number | null;
  container_id: number | null;
  container_name: string | null;
  container_size: string | null;
  price: string | null;
  position: number;
  on_deck: boolean;
  created_at: string;
  updated_at: string;
}

export interface UntappdSection {
  id: number;
  name: string;
  description: string | null;
  position: number;
  public: boolean;
  items: UntappdMenuItem[];
}

export interface UntappdMenu {
  id: number;
  name: string;
  description: string | null;
  position: number;
  sections: UntappdSection[];
}

export interface UntappdSyncResult {
  newBeers: Array<{
    name: string;
    brewery: string | null;
    style: string | null;
    abv: number | null;
    untappdId: number | null;
  }>;
  existingBeers: number;
  totalOnTap: number;
}

// Get credentials from environment variables
function getCredentials() {
  const email = process.env.UNTAPPD_EMAIL;
  const token = process.env.UNTAPPD_API_TOKEN;
  const locationId = process.env.UNTAPPD_LOCATION_ID;
  
  if (!email || !token || !locationId) {
    throw new Error("Untappd credentials not configured. Set UNTAPPD_EMAIL, UNTAPPD_API_TOKEN, and UNTAPPD_LOCATION_ID.");
  }
  
  return { email, token, locationId };
}

// Generate Basic Auth header
function getAuthHeader(): string {
  const { email, token } = getCredentials();
  const encoded = Buffer.from(`${email}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

// Check if Untappd is configured
export function isUntappdConfigured(): boolean {
  return !!(
    process.env.UNTAPPD_EMAIL &&
    process.env.UNTAPPD_API_TOKEN &&
    process.env.UNTAPPD_LOCATION_ID
  );
}

// Fetch all menus for the location
export async function fetchMenus(): Promise<UntappdMenu[]> {
  const { locationId } = getCredentials();
  
  const response = await fetch(`${UNTAPPD_API_BASE}/locations/${locationId}/menus`, {
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Untappd menus error:", response.status, errorText);
    throw new Error(`Untappd API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.menus || [];
}

// Fetch sections for a specific menu
export async function fetchMenuSections(menuId: number): Promise<UntappdSection[]> {
  const response = await fetch(`${UNTAPPD_API_BASE}/menus/${menuId}/sections`, {
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Untappd sections error:", response.status, errorText);
    throw new Error(`Untappd API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.sections || [];
}

// Fetch items for a specific section
export async function fetchSectionItems(sectionId: number): Promise<UntappdMenuItem[]> {
  const response = await fetch(`${UNTAPPD_API_BASE}/sections/${sectionId}/items`, {
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Untappd items error:", response.status, errorText);
    throw new Error(`Untappd API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

// Fetch complete tap list (all menus, sections, and items)
export async function fetchFullTapList(): Promise<UntappdMenuItem[]> {
  const menus = await fetchMenus();
  const allItems: UntappdMenuItem[] = [];
  
  for (const menu of menus) {
    const sections = await fetchMenuSections(menu.id);
    for (const section of sections) {
      const items = await fetchSectionItems(section.id);
      allItems.push(...items);
    }
  }
  
  return allItems;
}

// Preview tap list without making changes
export async function previewTapList(): Promise<{
  menus: Array<{ id: number; name: string; sectionCount: number; itemCount: number }>;
  totalItems: number;
  items: UntappdMenuItem[];
}> {
  const menus = await fetchMenus();
  const menuSummaries: Array<{ id: number; name: string; sectionCount: number; itemCount: number }> = [];
  const allItems: UntappdMenuItem[] = [];
  
  for (const menu of menus) {
    const sections = await fetchMenuSections(menu.id);
    let itemCount = 0;
    
    for (const section of sections) {
      const items = await fetchSectionItems(section.id);
      itemCount += items.length;
      allItems.push(...items);
    }
    
    menuSummaries.push({
      id: menu.id,
      name: menu.name,
      sectionCount: sections.length,
      itemCount,
    });
  }
  
  return {
    menus: menuSummaries,
    totalItems: allItems.length,
    items: allItems,
  };
}
