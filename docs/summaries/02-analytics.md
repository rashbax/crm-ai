# Analytics — Business Intelligence & Forecasting

## Overview

The Analytics module transforms raw marketplace data into actionable business intelligence. It goes beyond simple reporting: it automatically surfaces warning signals, forecasts stockouts before they happen, estimates potential revenue loss, and highlights both top-performing and underperforming products — all in one view. The goal is to give decision-makers the full picture of business health without manually digging through data.

---

## Top KPI Cards

Five headline metrics provide an instant read on business performance for the selected period:

| Metric | Detail |
|---|---|
| **Total Revenue (₽)** | Gross sales with % change vs. previous period |
| **Total Orders** | Order count with % change vs. previous period |
| **Average Check (₽)** | Revenue per order — measures whether pricing & product mix is improving |
| **Cancellation Rate (%)** | Share of orders cancelled — rising cancellations signal fulfilment or listing issues |
| **Estimated Profit (₽)** | Revenue after estimated 15% marketplace commission — shows real take-home performance |

Each card displays a directional indicator (up/down arrow + percentage) so trends are immediately visible without reading numbers.

---

## Period Selection

The analytics period can be set to **7 days** or **28 days**, with automatic comparison to the equivalent prior period. All metrics, charts, and signals update in real time when the period changes.

---

## Automated Signal Cards

The system continuously monitors the data and generates warning cards when it detects problems. These are not manually created — they are auto-derived from the numbers:

- **Declining Revenue SKUs** — Products where revenue has dropped more than 20% vs. the prior period. Triggers a review of pricing, stock, or listing quality.
- **Rising Cancellations** — SKUs where the cancellation rate exceeds 20%. Indicates potential listing mismatch, stock quality issues, or delivery problems.
- **Declining Average Check** — The per-order value is trending down over the period, which may indicate discount pressure or a shift to lower-value products.
- **Overall Trend Direction** — A single summary signal: is the business growing, stable, or declining?
- **Bottom SKU Count** — How many products are underperforming (low sales, poor conversion, or negative contribution).

Signals are designed to immediately direct attention toward areas that need intervention.

---

## Orders Trend Chart

A line chart showing daily order volume for the selected period, with the current period overlaid against the previous one. This allows managers to instantly see:

- Whether this week's performance matches last week
- Which specific days had drops or spikes
- Whether a trend is consistent or a one-day anomaly

---

## Top 10 Products Table

A ranked table of the 10 best-performing SKUs for the period, showing:

- **SKU identifier** (marketplace article number)
- **Units sold**
- **Revenue generated (₽)**

This table identifies which products are carrying the business and deserve priority attention in terms of stock, advertising, and content quality.

---

## Bottom 10 Products Table

The inverse of the Top 10 — the 10 worst-performing SKUs. This table helps identify products that may need repricing, content improvement, advertising review, or — in some cases — removal from the catalogue.

---

## Stockout Forecast Table

This is one of the most powerful features in the Analytics module. For every active SKU, the system calculates a forward-looking stockout risk assessment:

| Column | What It Shows |
|---|---|
| **SKU** | Product identifier |
| **Daily Sales Forecast** | Projected units sold per day based on recent trend |
| **Stock Remaining** | Current on-hand inventory |
| **Days Until Stockout** | Stock ÷ daily sales — color-coded (red <7d, amber <14d) |
| **Risk Level** | CRITICAL / HIGH / MED / LOW — determined by days left |
| **Potential Loss (₽)** | Revenue that will be lost if the SKU goes out of stock |
| **Recommended Reorder Qty** | System-calculated quantity needed to cover the forecast period |
| **Quick Actions** | One-click buttons to create a Task or Incident directly from this row |

The Quick Actions are particularly valuable: if a SKU is showing CRITICAL risk, a manager can create a stock replenishment task or incident without leaving the Analytics page.

### Risk Level Definitions

| Level | Condition |
|---|---|
| **CRITICAL** | Stockout within 7 days |
| **HIGH** | Stockout within 14 days |
| **MED** | Stockout within 28 days |
| **LOW** | Sufficient stock for 28+ days |

---

## Marketplace Filtering

All analytics data is filtered globally by the selected marketplace (Ozon, Wildberries, or both). When a specific marketplace is selected, all KPIs, charts, and tables reflect only that platform's data — enabling focused analysis per sales channel.

---

## How It Connects to Other Modules

The Analytics module is a read-and-act hub:

- **Stockout forecast → Tasks**: Create a supply order task directly from a risky SKU row
- **Stockout forecast → Incidents**: Open an incident if the situation is urgent or blocking
- **Signals → Automation**: Rising ad costs combined with declining orders may trigger an automation review
- **Bottom SKUs → Prices**: Underperforming SKUs are candidates for repricing in the Prices module

---

## Who Uses This Module

Used daily by **operations managers** and the **founder** to monitor business performance, identify risks before they become crises, and prioritize where to focus attention. The automation of signal generation means the system proactively guides users to what matters most.
