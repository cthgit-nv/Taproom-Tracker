# Well Stocked - Taproom Inventory Management

## Overview

Well Stocked is a mobile-first taproom inventory management system designed for bar and brewery operations. The application tracks kegs, taps, products, and distributors with a focus on rapid task completion and touch-optimized interfaces. It features PIN-based authentication for quick staff access and a dark-themed UI optimized for low-light taproom environments.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for auth state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme and CSS variables for theming
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Session Management**: express-session with in-memory storage
- **API Design**: RESTful JSON API under `/api` prefix

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema management (`db:push` script)

### Authentication
- **Method**: 4-digit PIN code authentication
- **Session**: Server-side sessions with HTTP-only cookies
- **Roles**: Admin and Staff user roles defined in schema

### Project Structure
```
client/           # React frontend
  src/
    components/ui/  # shadcn/ui components
    pages/          # Route components
    lib/            # Utilities and contexts
    hooks/          # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route definitions
  storage.ts      # Database access layer
  db.ts           # Database connection
shared/           # Shared code between client/server
  schema.ts       # Drizzle schema definitions
```

### Design Principles
- Mobile-first with 48px minimum touch targets
- Dark theme with green/gold color palette
- Inter font family for data-heavy interfaces
- Utility-first CSS with Tailwind

## External Dependencies

### Database
- **PostgreSQL**: Primary data store (requires DATABASE_URL environment variable)
- **Drizzle ORM**: Type-safe database queries and schema management

### UI Framework
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component styling on top of Radix
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library

### State & Data Fetching
- **TanStack React Query**: Server state management and caching

### Session & Auth
- **express-session**: Server-side session management

### Build & Development
- **Vite**: Frontend bundling and development server
- **esbuild**: Server bundling for production
- **TypeScript**: Type checking across full stack