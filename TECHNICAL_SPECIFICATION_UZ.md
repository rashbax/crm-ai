# TEXNIK TOPSHIRIQNOMA (TS)

## Loyiha: Navruz CRM — Ko'p marketpleysli e-tijorat boshqaruv tizimi

**Versiya:** 1.0
**Sana:** 2026-yil 18-mart
**Texnologiya steki:** Next.js 14, React 18, TypeScript 5.5, Tailwind CSS
**Holat:** Bajarildi

---

## 1. LOYIHA HAQIDA UMUMIY MA'LUMOT

Navruz CRM — Rossiya va Markaziy Osiyo marketpleyslarida (Wildberries, Ozon, Uzum, Yandex Market) savdo qiluvchi tadbirkorlar uchun mo'ljallangan professional CRM tizimi. Tizim buyurtmalar, mahsulotlar, narxlar, reklama, moliya va zaxiralarni yagona interfeysdan boshqarish imkonini beradi.

**Asosiy maqsad:** Bir nechta marketpleyslardan keladigan ma'lumotlarni markazlashtirilgan holda boshqarish, avtomatlashtirish va tahlil qilish.

---

## 2. BAJARILGAN ISHLAR RO'YXATI

### 2.1. Autentifikatsiya tizimi

| Band | Tafsilot |
|------|----------|
| Texnologiya | NextAuth v4 + bcryptjs |
| Funksionallik | Foydalanuvchi login/logout, parol xeshlash, sessiya boshqaruvi |
| API marshrutlar | `POST /api/auth/[...nextauth]` |
| Fayllar | `app/login/page.tsx`, `lib/auth-guard.ts`, `data/secure/users.json` |

---

### 2.2. Asosiy boshqaruv paneli (Dashboard)

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/dashboard/page.tsx` |
| Funksionallik | Real-vaqt savdo ko'rsatkichlari, daromad grafigi, balans kuzatuvi |
| Imkoniyatlar | 7/14/28 kunlik davr tanlash, vazifalar ro'yxati, zaxira salomatligi |
| Grafik kutubxonasi | Recharts 2.10 |
| Ma'lumot manbalari | Barcha ulangan marketpleyslardan aggregatsiya |

---

### 2.3. Buyurtmalar boshqaruvi

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/orders/page.tsx` |
| API | `GET /api/orders` |
| Funksionallik | Buyurtmalar ro'yxati, sahifalash (20 ta/sahifa), filterlar |
| Filterlar | Holat (yangi/jarayonda/yuborilgan/bekor qilingan), marketpleys |
| Qidiruv | SKU va tafsilotlar bo'yicha |
| Ma'lumot normalizatsiyasi | Barcha marketpleyslardan yagona `OrderEvent` formatiga |

---

### 2.4. Mahsulotlar katalogi

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/products/page.tsx` |
| API | `GET /api/products` |
| Funksionallik | SKU asosida inventarizatsiya, ko'p marketpleysli narx ko'rsatish |
| Zaxira holati | Tanqidiy / Past / Normal / Yaxshi klassifikatsiyasi |
| Ko'rsatkichlar | Min/Maks/O'rtacha narx, oxirgi 30 kunda sotilganlar, tranzitdagi tovarlar |
| Holatlar | Faol / Qoralama / Bloklangan |

---

### 2.5. Integratsiyalar boshqaruvi

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/integrations/page.tsx` |
| API marshrutlar | `GET /api/integrations`, `POST /api/integrations/connect`, `POST /api/integrations/disconnect`, `POST /api/integrations/remove`, `POST /api/integrations/test`, `POST /api/integrations/sync`, `GET /api/integrations/enabled`, `POST /api/integrations/toggle`, `GET /api/integrations/capability` |

**Qo'llab-quvvatlanadigan marketpleyslar:**

| Marketpleys | Hisob ma'lumotlari | Holat |
|-------------|---------------------|-------|
| Wildberries | API Token | To'liq ishlaydi |
| Ozon | Client ID + API Key | To'liq ishlaydi (ikki APIli: Seller + Performance) |
| Uzum | Token | Placeholder |
| Yandex Market | API Key | Placeholder |

**Asosiy xususiyatlar:**
- Bir marketpleysda bir nechta hisob ulash imkoniyati
- Qobiliyatga asoslangan arxitektura (Orders, Stocks, Ads, Prices)
- Ulanishni sinash funksiyasi
- Ma'lumot turlarini alohida yoqish/o'chirish
- Hisob ma'lumotlarini shifrlash (AES-256-GCM)
- Sinxronizatsiya holati va xato hisobotlari

---

### 2.6. Konnektorlar (Marketplace Connectors)

| Band | Tafsilot |
|------|----------|
| Fayllar | `src/connectors/wb.ts`, `src/connectors/ozon.ts`, `src/connectors/types.ts` |
| Interfeys | `MarketplaceConnector` — yagona interfeys barcha marketpleyslar uchun |

**Konnektorlar funksionalligi:**
- Buyurtmalarni olish va normalizatsiya qilish
- Zaxira holatini sinxronlash
- Narxlarni olish va yangilash
- Reklama statistikasini yig'ish
- Ulanishni sinovdan o'tkazish
- Ma'lumotlarni kanonik formatga aylantirish

**Kanonik ma'lumot turlari:**
- `OrderEvent` — normallashtirilgan buyurtma
- `StockState` — inventarizatsiya holati
- `AdsDaily` — kunlik reklama ko'rsatkichlari
- `PriceState` — joriy narx ma'lumotlari

---

### 2.7. Narxlash mexanizmi (Pricing Engine)

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/prices/page.tsx` |
| API | `GET /api/pricing`, `POST /api/pricing/drafts`, `POST /api/pricing/apply` |
| Asosiy fayllar | `src/pricing/engine.ts`, `src/pricing/calculator.ts`, `src/pricing/config.ts`, `src/pricing/priceIndex.ts` |

**Hisoblash formulalari:**
- **Zarar chegarasi** = (Tannarx + Komissiyalar) / (1 - O'zgaruvchan komissiya %)
- **Marja** = (Narx - Tannarx - Komissiyalar) / Narx
- **Maqsadli narx** = belgilangan marja % asosida tavsiya etilgan narx

**Komissiya tuzilmasi (har bir marketpleys uchun):**
- Komissiya foizi
- Logistika narxi (birlik uchun)
- Saqlash narxi (birlik uchun)
- To'lov komissiyasi foizi

**Marketpleyslar bo'yicha marja chegaralari:**

| Marketpleys | Past | O'rta | Yaxshi |
|-------------|------|-------|--------|
| WB | 5% | 11% | 20% |
| Ozon | 5% | 12% | 22% |
| Uzum | 4% | 10% | 18% |
| YM | 5% | 12% | 21% |

**Xavf darajalari:** NONE / LOW / MED / HIGH / CRITICAL

**Qo'riqlash tizimi (Guardrails):**
- Minimal foyda chegarasini bloklash (standart 5%)
- Past marja haqida ogohlantirish
- Zarar chegarasidan pastga tushishning oldini olish

**Ish oqimi:**
1. Narx o'zgartirish qoralamasi yaratish
2. Qo'riqlash tekshiruvi bilan ko'rib chiqish
3. Bekor qilish imkoniyati bilan qo'llash

---

### 2.8. Avtomatlashtirish mexanizmi (Automation Engine)

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/automation/page.tsx` |
| API | `GET /api/automation` |
| Asosiy fayl | `lib/automation-engine.ts` |

**Zaxiraga asoslangan reklama boshqaruvi:**

| Zaxira darajasi | Miqdor | Harakat |
|-----------------|--------|---------|
| Tanqidiy | <200 | Reklamani to'xtatish |
| Past | 200-499 | Byudjetni 30% kamaytirish |
| Normal | 500-999 | Kengaytirmaslik |
| Yaxshi | 1000+ | Operatsiyalarni qayta boshlash |

**Qoidalar tizimi:**
- Miqdor asosidagi triggerlar
- Qolgan kunlar prognozi
- Operatorlar: lt, lte, gt, gte, eq
- Ustunlik asosidagi bajarilish

**Samaradorlik tahlili:**
- ACOS (Reklama xarajati / Sotuvlar nisbati) maqsadga erishish
- Konversiya darajasi tahlili
- Bosish/konversiya nisbatlari

**Qaror qabul qilish:**
- Zaxira qoplash tahlili (zaxira tugashiga qolgan kunlar)
- Reklama xarajatlarini behuda sarflashning oldini olish
- Samaradorlikka asoslangan harakatlar

**Qo'shimcha xususiyatlar:**
- Barcha harakatlar uchun audit jurnali
- Tejangan pul miqdorini hisoblash
- Uch rejim: Sinov (Dry-run) / Qo'lda / Avtomatik

---

### 2.9. Analitika va prognozlash

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/analytics/page.tsx` |
| API | `GET /api/analytics` |
| Asosiy fayllar | `src/analytics/engine.ts`, `src/analytics/forecast.ts`, `src/analytics/risk.ts` |

**Prognoz tizimi:**
- Tahlil oynasi: 14-28 kunlik tarixiy ma'lumot
- Prognoz gorizonti: 14 kun oldinga
- Reklama ta'siri koeffitsienti (standart 0.5)
- Hafta kunlari mavsumiyligi
- Ishonch darajalari: YUQORI / O'RTA / PAST

**Xavf baholash:**
- Zaxira qoplash tahlili
- Mumkin bo'lgan yo'qotishlar hisoblash (pul va birlik)
- Dinamik chegaralar prognozga asoslangan

**Har bir SKU uchun natijalar:**
- Kunlik prognoz (birlik/kun)
- Prognoz seriyasi (keyingi N kun)
- Mavjud birliklar (omborda + tranzitda)
- Qoplash kunlari
- Zaxira tugash prognozi
- Xavf darajasi
- Qayta buyurtma nuqtasi (ROP)
- Tavsiya etilgan qayta buyurtma miqdori

**KPI kuzatuv:**
- Umumiy daromad
- Umumiy buyurtmalar
- O'rtacha chek
- Bekor qilish darajasi

---

### 2.10. Moliya moduli

| Band | Tafsilot |
|------|----------|
| Sahifalar | `app/finance/page.tsx`, `app/finance/ozon/page.tsx`, `app/finance/wb/page.tsx` |
| API | `GET /api/finance` |

**Kuzatiladigan tranzaksiyalar:**
- Sotuvlar (daromad)
- Qaytarishlar
- Komissiyalar
- Yetkazib berish xizmatlari
- Agent xizmatlari
- FBO xizmatlari
- Reklama/Aksiya xarajatlari
- Boshqa jarimalar
- Kompensatsiyalar
- Pul yechish
- Qo'lda tuzatishlar

**Hisob-kitoblar:**
- Jami hisoblangan daromad
- Jami xarajatlar
- Joriy balans
- Sof daromad
- Taxminiy va haqiqiy taqqoslash

**Xususiyatlar:**
- Sozlanadigan vaqt oraligi
- Grafik ma'lumotlari (kunlik daromad, buyurtmalar)
- Tranzaksiya turlari bo'yicha taqsimlash
- Moliyaviy snapshotlar keshlash

---

### 2.11. CRM / Vazifalar boshqaruvi

| Band | Tafsilot |
|------|----------|
| Sahifa | `app/crm/page.tsx` |
| Saqlash | localStorage |

**Vazifa xususiyatlari:**
- ID, Sarlavha, Havola
- Muddat
- Izohlar
- Yaratilgan sana
- To'liq CRUD operatsiyalari

---

### 2.12. AI integratsiyasi (ixtiyoriy)

| Band | Tafsilot |
|------|----------|
| Fayllar | `lib/ai/openai.ts`, `lib/ai/automationAssistant.ts` |
| API | `POST /api/ai/ask`, `POST /api/ai/explain`, `GET /api/ai/summary` |
| Texnologiya | OpenAI API (standart model: gpt-5-mini) |

**Imkoniyatlar:**
- Avtomatlashtirish holati bo'yicha AI xulosalar
- Ko'rsatkichlar va qarorlarni tabiiy tilda tushuntirish
- Zaxira/reklama holati bo'yicha AI tahlil
- Ixtiyoriy — `OPENAI_API_KEY` muhit o'zgaruvchisi talab qilinadi

---

### 2.13. Ko'p tillilik (Internationalization)

| Band | Tafsilot |
|------|----------|
| Fayl | `lib/translations.ts` |
| Tillar | Rus tili (ru) — asosiy, O'zbek tili (uz) — qo'shimcha |

**Tarjima qamrovi:**
- Navigatsiya elementlari (10 ta asosiy bo'lim)
- Boshqaruv paneli yorliqlari va KPI'lar
- Buyurtma boshqaruvi atamalari
- Mahsulot xususiyatlari
- Moliya terminologiyasi
- Integratsiya UI matni
- Holat yorliqlari
- Tugma yorliqlari
- Forma maydonlari
- Xato xabarlari

---

### 2.14. UI komponentlar kutubxonasi

| Komponent | Fayl | Vazifasi |
|-----------|------|----------|
| Layout | `components/Layout.tsx` | Asosiy tartib |
| Navigation | `components/Navigation.tsx` | Yon navigatsiya paneli (10 ta tab) |
| Topbar | `components/Topbar.tsx` | Yuqori panel, til almashtirish |
| RevenueChart | `components/RevenueChart.tsx` | Daromad grafigi |
| Badge | `components/ui/Badge.tsx` | Holat belgilari |
| Button | `components/ui/Button.tsx` | Qayta foydalanuvchi tugma |
| Card | `components/ui/Card.tsx` | Karta konteyner |
| Input | `components/ui/Input.tsx` | Forma kiritish maydoni |
| Metrics | `components/ui/Metrics.tsx` | Ko'rsatkichlar komponenti |
| StatusPill | `components/ui/StatusPill.tsx` | Holat indikatori |
| Table | `components/ui/Table.tsx` | Ma'lumotlar jadvali |

---

### 2.15. Xavfsizlik

| Band | Tafsilot |
|------|----------|
| Autentifikatsiya | NextAuth v4 sessiya boshqaruvi |
| Parol | bcryptjs bilan xeshlash |
| Hisob ma'lumotlari | AES-256-GCM shifrlash |
| Muhit o'zgaruvchilari | `.env.local` orqali boshqarish |
| Shifrlash kaliti | `ENCRYPTION_KEY` muhit o'zgaruvchisi |

---

### 2.16. Ma'lumotlar saqlash arxitekturasi

| Papka | Maqsad |
|-------|--------|
| `data/canonical/orders.json` | Normallashtirilgan buyurtmalar |
| `data/canonical/stocks.json` | Joriy zaxira holati |
| `data/canonical/prices.json` | Marketpleys narxlari |
| `data/canonical/ads.json` | Kunlik reklama ko'rsatkichlari |
| `data/canonical/cogs.json` | Tovar tannarxi (ixtiyoriy) |
| `data/canonical/fees.json` | Komissiya sozlamalari (ixtiyoriy) |
| `data/secure/connections.json` | Shifrlangan ulanishlar |
| `data/secure/users.json` | Foydalanuvchi hisoblar |
| `data/cache/finance-snapshots.json` | Moliyaviy kesh |

**Ma'lumot oqimi:**
1. Foydalanuvchi marketpleysni ulaydi → hisob ma'lumotlari shifrlanadi → `connections.json`da saqlanadi
2. Sinxronizatsiya mexanizmi konnektorlar orqali ma'lumot oladi
3. Ma'lumotlar kanonik formatga normallashtiriladi
4. `canonical/*.json` fayllarida saqlanadi
5. Barcha sahifalar faqat yoqilgan ulanishlar ma'lumotlarini ko'rsatadi

---

## 3. TEXNOLOGIYA STEKI

| Qatlam | Texnologiya | Versiya |
|--------|-------------|---------|
| Freymvork | Next.js (App Router) | 14.2.5 |
| Dasturlash tili | TypeScript | 5.5.3 |
| UI kutubxona | React | 18.3.1 |
| Stillar | Tailwind CSS | 3.4.4 |
| Holat boshqaruvi | React Hooks + localStorage | — |
| Autentifikatsiya | NextAuth | 4.24.13 |
| Xavfsizlik | bcryptjs, Node.js crypto | 3.0.3 |
| Grafiklar | Recharts | 2.10.0 |
| Validatsiya | Zod | 4.3.6 |
| Deploy | gh-pages | — |

---

## 4. LOYIHA TUZILISHI

```
crm-nextjs/
├── app/                          # Next.js 14 App Router
│   ├── dashboard/               # Boshqaruv paneli
│   ├── orders/                  # Buyurtmalar
│   ├── products/                # Mahsulotlar
│   ├── automation/              # Avtomatlashtirish
│   ├── prices/                  # Narxlash
│   ├── finance/                 # Moliya
│   │   ├── ozon/               # Ozon moliyasi
│   │   └── wb/                 # WB moliyasi
│   ├── analytics/               # Analitika
│   ├── integrations/            # Integratsiyalar
│   ├── crm/                     # Vazifalar
│   ├── promo/                   # Aksiyalar
│   ├── api/                     # Backend API marshrutlar
│   │   ├── auth/               # Autentifikatsiya
│   │   ├── orders/             # Buyurtmalar API
│   │   ├── products/           # Mahsulotlar API
│   │   ├── pricing/            # Narxlash API
│   │   ├── finance/            # Moliya API
│   │   ├── analytics/          # Analitika API
│   │   ├── automation/         # Avtomatlashtirish API
│   │   ├── integrations/       # Integratsiyalar API
│   │   └── ai/                 # AI API
│   └── login/                   # Login sahifasi
├── components/                  # React komponentlar
│   ├── ui/                     # UI kutubxona
│   ├── Layout.tsx              # Asosiy tartib
│   ├── Navigation.tsx          # Navigatsiya
│   ├── Topbar.tsx              # Yuqori panel
│   └── RevenueChart.tsx        # Grafiklar
├── lib/                         # Yordamchi kutubxonalar
│   ├── automation-engine.ts    # Avtomatlashtirish logikasi
│   ├── encryption.ts           # Shifrlash
│   ├── translations.ts         # Tarjimalar
│   └── ai/                     # AI integratsiya
├── src/                         # Biznes logika
│   ├── connectors/             # Marketpleys konnektorlar
│   ├── integrations/           # Integratsiya boshqaruvi
│   ├── pricing/                # Narxlash mexanizmi
│   ├── analytics/              # Analitika mexanizmi
│   └── marketplaces/           # Marketpleys ta'riflari
├── types/                       # TypeScript turlari
└── data/                        # Ma'lumotlar saqlash
    ├── canonical/              # Normallashtirilgan ma'lumot
    ├── secure/                 # Shifrlangan ma'lumot
    └── cache/                  # Kesh
```

---

## 5. API MARSHRUTLAR JADVALI

| Metod | Marshrutlar | Vazifasi |
|-------|------------|----------|
| POST | `/api/auth/[...nextauth]` | Autentifikatsiya |
| GET | `/api/integrations` | Katalog va ulanishlar ro'yxati |
| POST | `/api/integrations/connect` | Yangi marketpleys ulash |
| POST | `/api/integrations/disconnect` | Marketpleysni uzish |
| POST | `/api/integrations/remove` | Ulanishni o'chirish |
| POST | `/api/integrations/test` | Ulanishni sinash |
| POST | `/api/integrations/sync` | Ma'lumotlarni sinxronlash |
| GET | `/api/integrations/enabled` | Yoqilgan ulanishlar |
| POST | `/api/integrations/toggle` | Ulanishni yoqish/o'chirish |
| GET | `/api/integrations/capability` | Qobiliyat holati |
| GET | `/api/orders` | Buyurtmalar (filter + sahifalash) |
| GET | `/api/products` | Mahsulotlar (zaxira + holat) |
| GET | `/api/pricing` | Narxlash paneli |
| POST | `/api/pricing/drafts` | Narx qoralamasi |
| POST | `/api/pricing/apply` | Narx qo'llash |
| GET | `/api/finance` | Moliya ma'lumotlari |
| GET | `/api/analytics` | Analitika va xavf baholash |
| GET | `/api/automation` | Avtomatlashtirish holati |
| POST | `/api/ai/ask` | AI savol |
| POST | `/api/ai/explain` | AI tushuntirish |
| GET | `/api/ai/summary` | AI xulosa |

---

## 6. XULOSA

Navruz CRM loyihasi doirasida quyidagi ishlar to'liq bajarildi:

1. **15 ta sahifa** — login, dashboard, buyurtmalar, mahsulotlar, narxlar, avtomatlashtirish, analitika, moliya (umumiy + Ozon + WB), integratsiyalar, CRM, aksiyalar
2. **21 ta API endpoint** — autentifikatsiya, integratsiyalar, buyurtmalar, mahsulotlar, narxlash, moliya, analitika, avtomatlashtirish, AI
3. **4 ta marketpleys konnektori** — Wildberries va Ozon to'liq ishlaydi, Uzum va Yandex Market tayyor interfeys
4. **Narxlash mexanizmi** — marja hisoblash, zarar chegarasi, qo'riqlash tizimi, qoralama asosida ish oqimi
5. **Avtomatlashtirish mexanizmi** — zaxiraga asoslangan reklama boshqaruvi, qoidalar tizimi, audit jurnali
6. **Analitika va prognozlash** — sotuvlar prognozi, xavf baholash, KPI kuzatuv
7. **Moliya moduli** — tranzaksiyalar, balans, daromad/xarajat tahlili
8. **Xavfsizlik** — AES-256-GCM shifrlash, bcrypt parol xeshlash, NextAuth sessiyalar
9. **Ko'p tillilik** — rus va o'zbek tillarida to'liq interfeys
10. **UI komponentlar kutubxonasi** — 11 ta qayta foydalanuvchi komponent
11. **AI integratsiyasi** — ixtiyoriy OpenAI asosidagi xulosalar va tushuntirishlar

---

*Ushbu hujjat loyiha doirasida bajarilgan barcha ishlarning texnik tavsifini o'z ichiga oladi.*
