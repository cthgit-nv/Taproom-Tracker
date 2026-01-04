# Well Stocked - Design Guidelines

## Design Approach
**Utility-First Design System** - This is a mobile-first, function-critical inventory management tool requiring efficiency, clarity, and speed. Design prioritizes usability over aesthetic flourishes.

## Core Design Principles
1. **Mobile-First Touch Interface** - All interactions optimized for thumb zones and quick taps
2. **High Contrast Legibility** - Dark theme with clear visual hierarchy for scanning data
3. **Rapid Task Completion** - Minimize steps, maximize touch target sizes
4. **Operational Reliability** - Clear visual states for critical inventory actions

---

## Typography System

**Font Family:** Inter (Google Fonts) - optimized for data-heavy interfaces
- **Headings:** 600-700 weight, tracking-tight
- **Body/Data:** 400-500 weight, tracking-normal
- **Emphasis/Alerts:** 600 weight

**Scale (Mobile-First):**
- Page Titles: text-2xl (24px)
- Section Headers: text-xl (20px)
- Card Titles/Labels: text-base (16px)
- Body/Data: text-sm (14px)
- Metadata/Captions: text-xs (12px)

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8 for consistent rhythm
- Card padding: p-4
- Section spacing: space-y-6
- Button padding: px-6 py-4 (large touch targets)
- List item padding: p-4
- Screen margins: px-4

**Touch Targets:**
- Minimum height: 48px (h-12)
- Primary buttons: h-14 (56px)
- Icon buttons: w-12 h-12 (48x48)

**Container Strategy:**
- Mobile: Full width with px-4 margins
- Tablet+: max-w-7xl mx-auto

---

## Component Library

### Navigation
**Bottom Tab Bar (Fixed Mobile Nav):**
- 5 primary sections: Dashboard, Inventory, Kegs, Orders, Settings
- Icons with labels, active state with gold accent underline
- Height: h-16, safe area padding-bottom

**Top Header Bar:**
- User name/role display (left)
- Notifications/alerts icon (right)
- Height: h-14

### Cards & Lists
**Product/Keg Cards:**
- Rounded corners: rounded-lg
- Forest green border: border-2 border-[#1A4D2E]
- Dark background: bg-[#0a2419] (slightly lighter than main bg)
- Label image: rounded-md, aspect-square, 64x64px thumbnail
- Status badges: rounded-full px-3 py-1, uppercase text-xs

**List Items:**
- Swipe actions for quick operations (tap on mobile)
- Dividers between items: border-b border-[#1A4D2E]
- Tap highlight: active:bg-[#1A4D2E]/20

### Forms & Inputs
**Blind PIN Login:**
- 4 circular input dots: w-16 h-16 each, spaced gap-4
- Filled state: gold (#D4AF37), empty state: forest green border
- Shake animation on error (animate-shake class)
- Numeric keypad: 3x4 grid, large buttons (h-16)

**Text Inputs:**
- Height: h-12
- Background: bg-[#0a2419]
- Border: 2px forest green, focus: gold outline
- Rounded: rounded-md

**Touch-Friendly Selects/Dropdowns:**
- Native mobile selects with custom styling
- Height: h-12, full-width on mobile

### Buttons
**Primary Actions:**
- Gold background (#D4AF37), dark text (#051a11)
- Height: h-14, rounded-lg
- Font: font-semibold text-base

**Secondary Actions:**
- Forest green border, transparent background
- Gold text on hover/active

**Icon Buttons:**
- Square: w-12 h-12
- Lucide icons: size={24}

### Data Display
**Inventory Tables/Grids:**
- Alternate row backgrounds for scannability
- Critical data (PAR levels, velocity) in gold when attention needed
- Stock status: color-coded (green = good, gold = low, red = critical)

**Keg Status Visualization:**
- Progress bars showing remaining volume
- Color-coded by status: On Deck (gray), Tapped (green), Kicked (red)

### Modals & Overlays
**Mobile-First Modals:**
- Full-screen on mobile (slide up animation)
- Tablet+: centered, max-w-2xl
- Close button: top-right, w-12 h-12
- Backdrop: bg-black/80

---

## Animation Strategy
**Minimal & Purposeful:**
- Page transitions: Slide animations (200ms)
- PIN error: Shake (300ms)
- Toast notifications: Slide in from top (250ms)
- Loading states: Pulse on skeleton screens
- No decorative animations

---

## Color Application Guide
- **Backgrounds:** #051a11 (main), #0a2419 (cards/elevated)
- **Borders/Dividers:** #1A4D2E
- **Interactive Elements:** #D4AF37 (buttons, active states, alerts)
- **Text:** White (primary), rgba(255,255,255,0.7) (secondary)
- **Status Indicators:** Green (healthy), Gold (warning), Red (critical)

---

## Icon Usage (Lucide)
- Navigation: Home, Package, Beer, ShoppingCart, Settings
- Actions: Plus, Minus, Edit, Trash2, Check, X
- Status: AlertCircle, CheckCircle, Clock
- Size: 24px standard, 20px for inline icons

---

## Images
**No hero images** - This is a utility app. Product label images only (from Untappd API), displayed as small thumbnails in cards/lists.