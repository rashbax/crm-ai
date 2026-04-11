# CRM Marketplace Operating System

## Build & Run
- `npm run dev` — start dev server on port 3000
- `npm run build` — production build (use to verify before push)
- Push to `master` triggers Vercel auto-deploy

## Architecture
- Next.js 14 App Router + TypeScript
- File-based JSON storage in `data/secure/` (gitignored) and `data/canonical/`
- Auth: NextAuth with credentials provider, fallback admin user for Vercel
- Bilingual: Russian (ru) / Uzbek (uz)
- Marketplace selector in Topbar filters all data globally via `storage.getMarketplace()`

## Key Rules
- **Translations**: Every user-facing string MUST have both `ru` and `uz` translations in `lib/translations.ts`
- **data/secure/**: Gitignored. Any feature depending on these files needs a code fallback for Vercel
- **Marketplace filtering**: API routes use `getEnabledConnections()` + `filterByEnabledConnections()` from `src/integrations/enabled.ts`
- **Auth**: All API routes use `requireAuth()` from `lib/auth-guard.ts`
- **UI components**: Use existing components from `components/ui/` (Card, Button, Badge, Input, Table, etc.)
- **Founder system**: Tasks, incidents, approvals stored in `data/secure/` via `lib/founder-store.ts`

## File Structure
- `app/` — Pages and API routes
- `components/` — React components (Layout, Topbar, Navigation, ui/)
- `lib/` — Utilities (storage, translations, auth, founder-store, ai/)
- `src/` — Business logic (integrations, marketplaces, analytics, pricing)
- `types/` — TypeScript type definitions
- `data/canonical/` — orders, prices, stocks JSON
- `data/secure/` — users, connections, tasks, incidents, approvals JSON (gitignored)
