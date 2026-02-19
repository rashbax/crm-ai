# 🔄 Integrations Refactored - Connection-Based Architecture

## ✅ What Changed

The integrations system has been refactored from **hardcoded marketplace cards** to a professional **Catalog + Connections** architecture used by enterprise CRMs.

---

## 🎯 Key Concepts

### **1. Supported Catalog (Developer-Controlled)**

The catalog is the list of **supported marketplace types** (WB, Ozon, Uzum, YM). This is controlled by developers, not users.

**Location:** `/src/marketplaces/registry.ts`

Users can only connect from this catalog - they cannot invent new marketplace types.

### **2. Connections (User-Managed)**

Connections are **user-created instances** of marketplaces from the catalog.

**Example:**
- User connects "WB Main Shop" (Connection 1)
- Later, user could add "WB Secondary Shop" (Connection 2) - same marketplace, different shop

**Storage:** `/data/secure/connections.json`

Each connection has:
- `id` - UUID
- `marketplaceId` - References catalog ("wb", "ozon", etc.)
- `name` - User-friendly name ("WB Main Shop")
- `enabled` - true/false (disconnect without deleting)
- `creds` - Stored credentials
- `enabledData` - Which data types to sync (orders, stocks, ads, prices)

### **3. Enabled Connections = Source of Truth**

**All pages** (Dashboard, Analytics, Pricing, etc.) must **filter data** by enabled connections.

**API:** `GET /api/integrations/enabled`

Returns list of enabled connections. When a connection is disabled/removed, it **automatically disappears** from all other pages.

---

## 📁 New File Structure

```
src/
├── integrations/
│   ├── types.ts ✅ NEW - Connection types
│   ├── enabled.ts ✅ NEW - Enabled connections source of truth
│   ├── validate.ts ✅ NEW - Schema validation
│   ├── storage.ts ✅ UPDATED - Connection CRUD operations
│   ├── syncRunner.ts (needs update to use connectionId)
│   └── demoData.ts
│
├── marketplaces/
│   ├── registry.ts ✅ - Catalog of supported marketplaces
│   └── definitions/
│
├── connectors/
│   └── index.ts ✅ - Connector loader
│
└── analytics/
    └── types.ts ✅ UPDATED - Added connectionId fields

app/api/integrations/
├── route.ts ✅ UPDATED - Returns catalog + connections
├── enabled/route.ts ✅ NEW - Enabled connections endpoint
├── connect/route.ts ✅ UPDATED - Create/update connection
├── toggle/route.ts ✅ NEW - Enable/disable connection
├── remove/route.ts ✅ NEW - Delete connection + optional data
├── test/route.ts (exists)
└── sync/route.ts (needs update)
```

---

## 🔄 How It Works

### **User Flow:**

1. **Add Connection** (from catalog)
   ```
   User clicks "Add Integration"
   → Selects marketplace from catalog (WB, Ozon, etc.)
   → Enters credentials
   → Tests connection
   → Saves
   → Connection created with UUID
   ```

2. **Disconnect** (soft delete)
   ```
   User clicks toggle on connection
   → Connection.enabled = false
   → Stops syncing
   → Hides from all other pages (via filtering)
   → Credentials kept for later
   ```

3. **Remove** (hard delete)
   ```
   User clicks Remove button
   → Shows confirmation: "Delete data too?"
   → Removes connection
   → Optionally deletes all canonical data with matching connectionId
   ```

### **Data Flow:**

```
Connection Created
     ↓
Sync runs → Fetches data from marketplace
     ↓
Saves to canonical files with connectionId
     ↓
Other pages load enabled connections
     ↓
Filter canonical data by connectionId
     ↓
Display only enabled connection data
```

---

## 🔌 API Reference

### **1. GET /api/integrations**

Returns catalog + connections.

**Response:**
```json
{
  "mode": "demo",
  "warnings": [],
  "catalog": [
    {
      "id": "wb",
      "title": "Wildberries",
      "description": "...",
      "credentialSchema": [...],
      "capabilities": { "orders": true, ... }
    }
  ],
  "connections": [
    {
      "id": "uuid-123",
      "marketplaceId": "wb",
      "name": "WB Main Shop",
      "enabled": true,
      "enabledData": {...},
      "lastSyncAt": "2024-02-10T...",
      "accountLabel": "WB Account 12345"
    }
  ]
}
```

### **2. GET /api/integrations/enabled**

Returns enabled connections (source of truth).

**Response:**
```json
{
  "mode": "live",
  "warnings": [],
  "enabledConnections": [
    {
      "id": "uuid-123",
      "marketplaceId": "wb",
      "name": "WB Main Shop"
    }
  ]
}
```

### **3. POST /api/integrations/connect**

Create or update connection.

**Request:**
```json
{
  "marketplaceId": "wb",
  "name": "WB Main Shop",
  "creds": { "token": "..." },
  "enabledData": { "orders": true, "stocks": true, ... }
}
```

**Response:**
```json
{
  "id": "uuid-123",
  "marketplaceId": "wb",
  "name": "WB Main Shop",
  "enabled": true,
  "lastTestAt": "2024-02-10T...",
  "accountLabel": "WB Account ..."
}
```

### **4. POST /api/integrations/toggle**

Enable or disable connection.

**Request:**
```json
{
  "connectionId": "uuid-123",
  "enabled": false
}
```

**Response:**
```json
{
  "id": "uuid-123",
  "enabled": false,
  "message": "Connection disabled (disconnected)"
}
```

### **5. POST /api/integrations/remove**

Remove connection.

**Request:**
```json
{
  "connectionId": "uuid-123",
  "deleteData": true
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Connection and data removed",
  "connectionId": "uuid-123",
  "dataDeleted": true
}
```

---

## 📊 Canonical Data Changes

All canonical types now include:
- `marketplace` - Marketplace ID
- `connectionId` - Connection UUID

**Example:**
```json
{
  "date": "2024-02-10",
  "sku": "RJ-001",
  "qty": 5,
  "marketplace": "wb",
  "connectionId": "uuid-123"
}
```

This allows:
- Multi-shop support (multiple connections per marketplace)
- Precise filtering by connection
- Easy data deletion when connection removed

---

## 🔍 Filtering Data by Enabled Connections

### **In Any API Route:**

```typescript
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";

// Load enabled connections
const enabledConnections = await getEnabledConnections();

// Load canonical data
const allOrders = await readJsonFile("orders.json", []);

// Filter to only enabled connections
const filteredOrders = filterByEnabledConnections(allOrders, enabledConnections);

// Use filtered data
const metrics = calculateMetrics(filteredOrders);
```

### **How Filtering Works:**

1. Loads enabled connections (connectionId + marketplaceId)
2. Filters items by:
   - **Prefer `connectionId`** - exact match
   - **Fallback to `marketplace`** - for legacy data
   - **No match** - exclude (safer)

**Result:** Only data from enabled connections appears in analytics/pricing/etc.

---

## ✅ Migration Guide

### **Pages That Need Updating:**

All data-consuming pages must filter by enabled connections:

1. **/app/api/dashboard/route.ts** - Filter orders
2. **/app/api/analytics/route.ts** - Filter orders/stocks/ads
3. **/app/api/pricing/route.ts** - Filter prices/stocks
4. **/app/api/stock/route.ts** - Filter stocks
5. **/app/api/ads/route.ts** - Filter ads

### **Update Pattern:**

```typescript
// OLD (uses all data)
const orders = await readJsonFile("orders.json", []);
const metrics = calculateMetrics(orders);

// NEW (filters by enabled connections)
import { getEnabledConnections, filterByEnabledConnections } from "@/src/integrations/enabled";

const enabledConnections = await getEnabledConnections();
const allOrders = await readJsonFile("orders.json", []);
const filteredOrders = filterByEnabledConnections(allOrders, enabledConnections);
const metrics = calculateMetrics(filteredOrders);
```

---

## 🎨 UI Changes Needed

### **Integrations Page:**

**Replace:** Hardcoded 4 marketplace cards

**With:**
1. **Connected Integrations List**
   - Shows all connections
   - Each connection has: toggle (enable/disable), sync, remove
   
2. **Add Integration Button**
   - Opens catalog modal
   - User selects marketplace
   - Opens wizard (credentials form)
   - Tests connection
   - Saves

### **Example UI Flow:**

```
┌─────────────────────────────────────────┐
│ Integrations        [+ Add Integration] │
├─────────────────────────────────────────┤
│ Connected Integrations (2)              │
│                                         │
│ ┌─────────────────────────────────┐   │
│ │ WB  WB Main Shop                │   │
│ │ 🟢 Enabled                       │   │
│ │ Last sync: 2 mins ago            │   │
│ │ [Toggle] [Sync] [Remove]         │   │
│ └─────────────────────────────────┘   │
│                                         │
│ ┌─────────────────────────────────┐   │
│ │ OZON  Ozon Secondary             │   │
│ │ 🔴 Disabled                      │   │
│ │ Last sync: 1 hour ago            │   │
│ │ [Toggle] [Sync] [Remove]         │   │
│ └─────────────────────────────────┘   │
│                                         │
│ [+ Add Integration] → Opens catalog    │
└─────────────────────────────────────────┘

Catalog Modal:
┌─────────────────────────────────────┐
│ Select Marketplace                  │
├─────────────────────────────────────┤
│ ○ Wildberries                       │
│ ○ Ozon                              │
│ ○ Uzum                              │
│ ○ Yandex Market                     │
│                                     │
│ [Next →]                            │
└─────────────────────────────────────┘
```

---

## 👨‍💻 How to Add a New Marketplace Type (Developer Only)

Users cannot add new marketplace types. Only developers can.

### **Step 1: Create Definition**

`/src/marketplaces/definitions/alibaba.ts`:
```typescript
export const alibabaDefinition: MarketplaceDefinition = {
  id: "alibaba",
  title: "Alibaba",
  description: "Global B2B marketplace",
  logoText: "ALI",
  credentialSchema: [
    { key: "appKey", label: "App Key", type: "text", required: true },
    { key: "appSecret", label: "App Secret", type: "password", required: true },
  ],
  capabilities: {
    orders: true,
    stocks: true,
    ads: false,
    prices: true,
  },
  connectorId: "alibaba",
};
```

### **Step 2: Register in Catalog**

`/src/marketplaces/registry.ts`:
```typescript
import { alibabaDefinition } from "./definitions/alibaba";

const marketplaces = {
  wb: wildberriesDefinition,
  ozon: ozonDefinition,
  uzum: uzumDefinition,
  ym: yandexMarketDefinition,
  alibaba: alibabaDefinition, // ← Add here
};
```

### **Step 3: Create Connector**

`/src/connectors/alibaba.ts`:
```typescript
export const alibabaConnector: MarketplaceConnector = {
  async testConnection(creds) {
    return { ok: true, accountLabel: `Alibaba (${creds.appKey})` };
  },
  async fetchOrders() { return []; },
  async fetchStocks() { return []; },
  async fetchAds() { return []; },
  async fetchPrices() { return []; },
};
```

### **Step 4: Register Connector**

`/src/connectors/index.ts`:
```typescript
import { alibabaConnector } from "./alibaba";

const connectors = {
  ...existing,
  alibaba: alibabaConnector, // ← Add here
};
```

### **Done!**

Alibaba now appears in catalog. Users can create connections to it. No UI changes needed.

---

## 🎯 Benefits of Connection-Based Architecture

### **1. Multi-Shop Support**
```
Connection 1: WB Main Shop (Москва)
Connection 2: WB Regional Shop (Санкт-Петербург)
Both connections = same marketplace (WB), different shops
```

### **2. Clean Disconnect**
```
Disable connection → Stops sync
                   → Hides from all pages
                   → Keeps credentials for re-enable
```

### **3. Safe Data Management**
```
Remove connection with deleteData=false:
→ Connection deleted
→ Historical data preserved
→ Can analyze past performance

Remove connection with deleteData=true:
→ Connection deleted
→ All data removed
→ Clean slate
```

### **4. Automatic Filtering**
```
One source of truth (enabledConnections)
→ All pages auto-filter
→ No manual cleanup needed
→ Consistent across entire app
```

---

## 📋 TODO List

### **Critical (Must Complete):**
- [ ] Update `/app/integrations/page.tsx` - New UI (catalog + connections list)
- [ ] Update `/app/api/integrations/sync/route.ts` - Use connectionId
- [ ] Update `/src/integrations/syncRunner.ts` - Tag data with connectionId
- [ ] Update `/app/api/analytics/route.ts` - Filter by enabled connections
- [ ] Update `/app/api/pricing/route.ts` - Filter by enabled connections
- [ ] Update `/app/api/dashboard/route.ts` - Filter by enabled connections

### **Recommended:**
- [ ] Add tests for connection CRUD
- [ ] Add tests for filtering logic
- [ ] Add tests for data deletion
- [ ] Update demo data to include connectionId
- [ ] Add connection name editing
- [ ] Add bulk operations (enable all, disable all)

---

## 🎉 Summary

**Before:**
- ❌ Hardcoded 4 marketplace cards
- ❌ No multi-shop support
- ❌ Disconnect = delete everything
- ❌ Manual data filtering per page

**After:**
- ✅ Catalog + Connections pattern
- ✅ Multi-shop ready (UUID-based)
- ✅ Soft disconnect (toggle enabled)
- ✅ Safe removal (optional data delete)
- ✅ Automatic filtering (single source of truth)
- ✅ Professional CRM UX

**Your CRM now matches enterprise-grade integration management!** 🚀
