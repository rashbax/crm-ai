# 🔗 How to Add Marketplaces - Step by Step Guide

## 📍 Where Everything Is Located

```
Your Project: crm-enhanced/
│
├── 🔌 CONNECTORS (The actual marketplace integrations)
│   └── src/connectors/
│       ├── wb.ts ✅ Wildberries
│       ├── ozon.ts ✅ Ozon
│       ├── uzum.ts ✅ Uzum
│       └── ym.ts ✅ Yandex Market
│
├── 🎨 INTEGRATION PAGE (Where you connect them)
│   └── app/integrations/page.tsx ✅
│
├── 🔧 API ROUTES (Backend for connecting)
│   └── app/api/integrations/
│       ├── route.ts (list)
│       ├── test/route.ts (test connection)
│       ├── connect/route.ts (save credentials)
│       ├── disconnect/route.ts (remove)
│       └── sync/route.ts (sync data)
│
└── 💾 DATA STORAGE
    └── data/
        ├── canonical/ (synced data)
        │   ├── orders.json
        │   ├── stocks.json
        │   ├── ads.json
        │   └── prices.json
        └── secure/ (credentials - gitignored!)
            ├── integrations.json
            └── integrationStatus.json
```

---

## 🚀 How to Add a Marketplace (Step by Step)

### **Method 1: Using the UI (Easiest!) 👍**

#### **Step 1: Start your server**
```bash
cd crm-enhanced
npm run dev
```

#### **Step 2: Open the Integrations page**
```
http://localhost:3000/integrations
```

You'll see 4 marketplace cards:

```
┌──────────────────────────────────────────┐
│ 🏪 Интеграции          [Синхронизировать все] │
├──────────────────────────────────────────┤
│ ⚠️ Running in DEMO mode                   │
├──────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐         │
│ │ Wildberries │  │ Ozon        │         │
│ │ 🔴 Не подкл │  │ 🔴 Не подкл │         │
│ │ [Подключить]│  │ [Подключить]│         │
│ └─────────────┘  └─────────────┘         │
│ ┌─────────────┐  ┌─────────────┐         │
│ │ Uzum        │  │ Yandex Mkt  │         │
│ │ 🔴 Не подкл │  │ 🔴 Не подкл │         │
│ │ [Подключить]│  │ [Подключить]│         │
│ └─────────────┘  └─────────────┘         │
└──────────────────────────────────────────┘
```

#### **Step 3: Click "Подключить" on Wildberries**

A modal opens with a 3-step wizard:

**📝 Step 1 - Enter Credentials:**
```
┌────────────────────────────────┐
│ Подключение Wildberries   ✕   │
├────────────────────────────────┤
│ Шаг 1: Введите учетные данные │
│                                │
│ Token:                         │
│ [●●●●●●●●●●●●●●●●●●●●●●●●●●] │
│                                │
│ [Далее]  [Отмена]              │
└────────────────────────────────┘
```

**For Wildberries:**
- Token: Your WB API token

**For Ozon:**
- Client ID: Your Ozon Client ID
- API Key: Your Ozon API Key

**For Uzum:**
- Token: Your Uzum token

**For Yandex Market:**
- API Key: Your YM API Key

#### **Step 4: Click "Далее" - Select Data Types**

```
┌────────────────────────────────┐
│ Шаг 2: Выберите данные         │
│                                │
│ ☑ Заказы (Orders)              │
│ ☑ Остатки (Stocks)             │
│ ☑ Реклама (Ads)                │
│ ☑ Цены (Prices)                │
│                                │
│ [Далее]  [Назад]               │
└────────────────────────────────┘
```

Check the boxes for data you want to sync!

#### **Step 5: Click "Далее" - Test Connection**

```
┌────────────────────────────────┐
│ Шаг 3: Тест подключения        │
│                                │
│ [Тест подключения]             │
│                                │
│ (After clicking...)            │
│ ┌──────────────────────────┐   │
│ │ ✓ Подключено успешно     │   │
│ │ WB Account (abc12345...) │   │
│ └──────────────────────────┘   │
│                                │
│ [Сохранить]  [Назад]           │
└────────────────────────────────┘
```

#### **Step 6: Click "Сохранить" - Done!**

Your marketplace is now connected! 🎉

```
┌─────────────┐
│ Wildberries │
│ 🟢 Подключено │ ← Connected!
│ Аккаунт: WB Account │
│ Тест: 08.02.2024 16:30 │
│ [Синхр.] [Отключить] │
└─────────────┘
```

#### **Step 7: Click "Синхр." to Sync Data**

Data will be synced to:
```
data/canonical/
├── orders.json ← Your WB orders here!
├── stocks.json ← Your WB stocks here!
├── ads.json ← Your WB ads here!
└── prices.json ← Your WB prices here!
```

---

### **Method 2: Using API Directly (Advanced)**

If you want to connect programmatically:

#### **1. Test Connection First:**

```bash
curl -X POST http://localhost:3000/api/integrations/test \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "wb",
    "creds": {
      "token": "your-wildberries-token-here"
    }
  }'
```

Response:
```json
{
  "ok": true,
  "accountLabel": "WB Account (abc12345...)"
}
```

#### **2. Connect and Save:**

```bash
curl -X POST http://localhost:3000/api/integrations/connect \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "wb",
    "creds": {
      "token": "your-token"
    },
    "enabledData": {
      "orders": true,
      "stocks": true,
      "ads": true,
      "prices": true
    }
  }'
```

#### **3. Sync Data:**

```bash
curl -X POST http://localhost:3000/api/integrations/sync \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "wb"
  }'
```

---

## 🔑 Where to Get API Credentials

### **Wildberries:**
1. Go to https://seller.wildberries.ru/
2. Profile → Settings → API Access
3. Generate new token
4. Copy token

### **Ozon:**
1. Go to https://seller.ozon.ru/
2. Settings → API Keys
3. Create new key
4. Copy Client ID and API Key

### **Uzum:**
1. Go to Uzum seller portal
2. API Settings
3. Generate token
4. Copy token (Note: NO "Bearer " prefix!)

### **Yandex Market:**
1. Go to https://partner.market.yandex.ru/
2. Settings → API
3. Generate OAuth token
4. Copy API key

---

## 📂 Where Credentials Are Stored

After connecting, your credentials are saved here:

```
crm-enhanced/data/secure/integrations.json
```

**⚠️ IMPORTANT: This file is gitignored! Never commit it!**

Example contents:
```json
{
  "wb": {
    "enabled": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "ozon": {
    "enabled": true,
    "clientId": "123456",
    "apiKey": "abc123xyz789"
  },
  "uzum": {
    "enabled": false,
    "token": ""
  },
  "ym": {
    "enabled": false,
    "apiKey": ""
  }
}
```

Status is stored here:
```
crm-enhanced/data/secure/integrationStatus.json
```

Example:
```json
[
  {
    "marketplace": "wb",
    "connected": true,
    "lastTestAt": "2024-02-08T16:30:00Z",
    "lastSyncAt": "2024-02-08T16:35:00Z",
    "enabledData": {
      "orders": true,
      "stocks": true,
      "ads": true,
      "prices": true
    },
    "accountLabel": "WB Account"
  }
]
```

---

## 🔄 How Syncing Works

When you click "Синхр." (Sync):

1. **System loads your credentials** from `/data/secure/integrations.json`
2. **Calls the marketplace connector** (`src/connectors/wb.ts`)
3. **Fetches data** from marketplace API
4. **Merges with existing data**:
   - Removes old data for that marketplace
   - Adds new data
   - Sorts stably
5. **Saves to canonical files**:
   - `/data/canonical/orders.json`
   - `/data/canonical/stocks.json`
   - `/data/canonical/ads.json`
   - `/data/canonical/prices.json`
6. **Updates sync status**

---

## 🎯 Demo Mode vs Real API Mode

### **Demo Mode (Default):**
```bash
DRY_RUN=1 npm run dev
```
- Uses fake demo data
- No real API calls
- Safe for testing UI
- Shows warnings

### **Real API Mode:**
```bash
REAL_API=1 npm run dev
```
- Makes real API calls
- Uses actual credentials
- Fetches real data
- Production mode

**⚠️ Current Status:** Real API calls are disabled by default. To enable them:

1. Open `src/connectors/wb.ts` (or other connector)
2. Find the TODO comments
3. Add your actual API endpoints
4. Set `REAL_API=1` in environment

---

## 🛠️ Adding a New Marketplace

Want to add a 5th marketplace? Here's how:

### **1. Create connector file:**

```typescript
// src/connectors/newmarketplace.ts
import type { MarketplaceConnector, TestConnectionResult } from "./types";

export const newMarketplaceConnector: MarketplaceConnector = {
  async testConnection(creds: any): Promise<TestConnectionResult> {
    // Test API connection
    return { ok: true, accountLabel: "New MP Account" };
  },

  async fetchOrders(creds: any) {
    // Fetch and normalize orders
    return [];
  },

  async fetchStocks(creds: any) {
    // Fetch and normalize stocks
    return [];
  },

  async fetchAds(creds: any) {
    // Fetch and normalize ads
    return [];
  },

  async fetchPrices(creds: any) {
    // Fetch and normalize prices
    return [];
  },
};
```

### **2. Update types:**

```typescript
// src/connectors/types.ts
export type MarketplaceId = "wb" | "ozon" | "uzum" | "ym" | "newmp"; // Add here
```

### **3. Add to API routes:**

```typescript
// app/api/integrations/test/route.ts
import { newMarketplaceConnector } from "@/src/connectors/newmarketplace";

const connectors = {
  wb: wbConnector,
  ozon: ozonConnector,
  uzum: uzumConnector,
  ym: ymConnector,
  newmp: newMarketplaceConnector, // Add here
};
```

### **4. Update UI:**

```typescript
// app/integrations/page.tsx
const marketplaceNames: Record<MarketplaceId, string> = {
  wb: "Wildberries",
  ozon: "Ozon",
  uzum: "Uzum",
  ym: "Yandex Market",
  newmp: "New Marketplace", // Add here
};
```

Done! Your new marketplace appears in the integrations page! 🎉

---

## 📊 Quick Reference

| Marketplace | Credentials | Where to Get |
|------------|-------------|--------------|
| **Wildberries** | `token` | seller.wildberries.ru → Settings → API |
| **Ozon** | `clientId` + `apiKey` | seller.ozon.ru → Settings → API Keys |
| **Uzum** | `token` (no Bearer!) | Uzum seller portal → API |
| **Yandex Market** | `apiKey` | partner.market.yandex.ru → Settings → API |

---

## 🎉 That's It!

**To connect a marketplace:**
1. Visit `/integrations`
2. Click "Подключить"
3. Enter credentials
4. Select data types
5. Test connection
6. Save!
7. Click "Синхр." to sync data

**Your data appears in:**
- `/data/canonical/orders.json`
- `/data/canonical/stocks.json`
- `/data/canonical/ads.json`
- `/data/canonical/prices.json`

**And is used by:**
- Analytics page (forecasting)
- Prices page (pricing decisions)
- Dashboard (metrics)

---

Need help? Check the files at:
- Connectors: `/src/connectors/`
- Integration page: `/app/integrations/page.tsx`
- API routes: `/app/api/integrations/`

🚀 Happy integrating!
