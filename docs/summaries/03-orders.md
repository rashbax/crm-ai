# Orders — Order Management & Trend Monitoring

## Overview

The Orders module provides a complete, filterable view of every order across connected marketplaces. Beyond a simple order list, it monitors order trends in real time and automatically flags anomalies — surges, drops, rising returns, and rising cancellations — so that problems are caught early. Every order row is enriched with context: SKU health status, delay indicators, and problem flags make this far more than a basic transaction log.

---

## Summary Statistics

Six summary cards sit at the top of the page, giving an at-a-glance read of the current dataset:

| Card | Description |
|---|---|
| **Row Count** | Total number of orders matching current filters |
| **Total Quantity** | Sum of all units ordered |
| **Revenue (₽)** | Total revenue from matching orders |
| **Unique SKUs** | Number of distinct products in the filtered set |
| **Returns** | Count of orders with return status |
| **Cancellations** | Count of cancelled orders |

These cards update instantly as filters are applied, so managers always know exactly what they're looking at.

---

## Automated Trend Signals

The system compares the last 7 days of orders against the prior 7 days and generates four types of automatic signals. These signals are displayed as clickable filter pills — clicking a signal immediately filters the table to show only the relevant orders:

| Signal | Trigger Condition |
|---|---|
| **Surge** | A SKU received 3+ orders in the past 7 days AND volume is up 50%+ vs. prior period |
| **Drop** | A SKU had 3+ orders in the prior period AND volume fell 50%+ in the current period |
| **Rising Returns** | A SKU has 2+ returns in the current period AND the return count increased vs. prior |
| **Rising Cancellations** | A SKU has 2+ cancellations AND the count increased vs. prior period |

Surges are opportunities (ensure stock is sufficient, ads are running). Drops and rising returns/cancellations are warning signs requiring investigation.

---

## Filtering System

The orders table supports multiple simultaneous filters:

- **Search** — Filter by Order ID or SKU article number
- **Status Filter** — Marketplace-aware status options:
  - **Wildberries**: 3 statuses (pending, confirmed, cancelled)
  - **Ozon**: 6 statuses (awaiting_packaging, awaiting_deliver, delivering, delivered, cancelled, returned)
- **Problematic Orders Filter** — One-click to show only orders with returns, cancellations, or delivery delays (5+ days in processing)
- **Date Range Picker** — Filter orders by creation date
- **Signal Filter** — Show only orders associated with a specific trend signal (Surge / Drop / Rising Returns / Rising Cancellations)

---

## Order Table

Each row in the order table contains:

| Column | Description |
|---|---|
| **Order ID** | Unique identifier; rows with problems are marked with a red left border |
| **Date** | Order creation timestamp, formatted in the business timezone |
| **SKU** | Product article number in monospace font for easy reading |
| **SKU Health** | Shows a badge if the SKU has critical/low stock or open incidents |
| **Quantity** | Number of units in this order |
| **Price per Unit (₽)** | Unit price at time of order |
| **Revenue (₽)** | Total value of this order line |
| **Status** | Current order status with a **"Delayed"** badge if the order has been in processing for 5+ days |

The red problem indicator on a row means the order has at least one of: return, cancellation, or extended delay. This visual cue lets managers scan for problems at a glance without reading every row.

---

## SKU Health Context

One of the most useful features of the Orders module is the **SKU Health** column. Rather than requiring managers to cross-reference the Products module, each order row shows inline health context:

- **Critical / Low stock badge** — The SKU is at risk of running out
- **Open incident count** — There is an active incident tied to this SKU

This means a manager reviewing orders can immediately see if a high-volume SKU is heading toward stockout or has an unresolved operational issue — without leaving the orders view.

---

## Marketplace Filtering

All order data is filtered globally by the marketplace selector in the top navigation. When Ozon is selected, only Ozon orders appear; when Wildberries is selected, only WB orders appear. Status options in the filter adapt to match each platform's terminology.

---

## How It Connects to Other Modules

- **SKU Health badge → Products**: Click-through to the full SKU detail in the Products module
- **Rising Returns signal → Incidents**: A spike in returns can trigger an incident (return_spike type) for investigation
- **Surge signal → Automation**: A surging SKU should have ads running and stock confirmed — links to the Automation module for campaign review
- **Problematic orders → Tasks**: Delayed or problematic orders can be escalated into tasks for resolution

---

## Who Uses This Module

Used daily by **marketplace managers** and **operations leads** to monitor order flow, identify fulfilment problems, and respond to trend changes. The automated signals mean managers do not need to manually compare periods — the system surfaces what changed automatically.
