// Untappd for Business API Integration Service
// Fetches tap list and beer data using Basic Auth (email:token)
// Uses database settings for credential storage

const UNTAPPD_API_BASE = "https://business.untappd.com/api/v1";

export interface UntappdCredentials {
  email: string;
  token: string;
  locationId: string;
}

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

// Generate Basic Auth header from credentials
function getAuthHeader(credentials: UntappdCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64');
  return `Basic ${encoded}`;
}

// Check if Untappd credentials are complete
export function isUntappdConfigured(credentials: Partial<UntappdCredentials> | null): boolean {
  return !!(
    credentials?.email &&
    credentials?.token &&
    credentials?.locationId
  );
}

// Fetch all menus for the location
export async function fetchMenus(credentials: UntappdCredentials): Promise<UntappdMenu[]> {
  const response = await fetch(`${UNTAPPD_API_BASE}/locations/${credentials.locationId}/menus`, {
    headers: {
      'Authorization': getAuthHeader(credentials),
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
export async function fetchMenuSections(credentials: UntappdCredentials, menuId: number): Promise<UntappdSection[]> {
  const response = await fetch(`${UNTAPPD_API_BASE}/menus/${menuId}/sections`, {
    headers: {
      'Authorization': getAuthHeader(credentials),
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
export async function fetchSectionItems(credentials: UntappdCredentials, sectionId: number): Promise<UntappdMenuItem[]> {
  const response = await fetch(`${UNTAPPD_API_BASE}/sections/${sectionId}/items`, {
    headers: {
      'Authorization': getAuthHeader(credentials),
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
export async function fetchFullTapList(credentials: UntappdCredentials): Promise<UntappdMenuItem[]> {
  const menus = await fetchMenus(credentials);
  const allItems: UntappdMenuItem[] = [];
  
  for (const menu of menus) {
    const sections = await fetchMenuSections(credentials, menu.id);
    for (const section of sections) {
      const items = await fetchSectionItems(credentials, section.id);
      allItems.push(...items);
    }
  }
  
  return allItems;
}

// Preview tap list without making changes
export async function previewTapList(credentials: UntappdCredentials): Promise<{
  menus: Array<{ id: number; name: string; sectionCount: number; itemCount: number }>;
  totalItems: number;
  items: UntappdMenuItem[];
}> {
  const menus = await fetchMenus(credentials);
  const menuSummaries: Array<{ id: number; name: string; sectionCount: number; itemCount: number }> = [];
  const allItems: UntappdMenuItem[] = [];
  
  for (const menu of menus) {
    const sections = await fetchMenuSections(credentials, menu.id);
    let itemCount = 0;
    
    for (const section of sections) {
      const items = await fetchSectionItems(credentials, section.id);
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
