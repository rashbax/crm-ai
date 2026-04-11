# Products — SKU Registry & Ownership Matrix

## Overview

The Products module is the master catalogue of every SKU the business sells across marketplaces. It goes far beyond a simple product list: each SKU carries ownership information, stock health status, open task and incident counts, risk levels, and price history. This module is the central reference point for the entire operations team — the place to answer "who owns this SKU, how healthy is it, and what's happening with it right now?"

---

## Summary Cards

Four summary cards provide a health snapshot of the full catalogue:

| Card | Alert Condition |
|---|---|
| **Total SKUs** | Always shown |
| **Critical Stock** | Card turns **red** if any SKUs are at critical stock level |
| **Unassigned SKUs** | Card turns **amber** if any SKUs have no responsible owner |
| **High Risk Count** | Card turns **red** if any SKUs are at HIGH or CRITICAL risk |

The color alerts mean managers can see catalogue health at a glance — if the cards are all neutral, the catalogue is in good shape.

---

## Signal Pills (Quick Filters)

Clickable signal pills let managers instantly filter the table to a specific problem category:

- **Selling with low stock** — SKUs that are generating orders but have critically low inventory; the most urgent business risk
- **Unassigned SKUs** — Products with no owner assigned; a governance gap
- **Has open incident** — SKUs linked to at least one unresolved incident
- **Many tasks (3+)** — SKUs with 3 or more open tasks; potential operational overload
- **High/Critical price risk** — SKUs where the current price is at a risk threshold

---

## Filter System

The table supports five simultaneous filter dimensions:

- **Search** — By SKU article number or owner name
- **Status** — All / Active / Draft / Blocked
- **Stock Health** — All / Critical / Low / Normal / Good
- **Risk Level** — All / CRITICAL / HIGH / MED / LOW / NONE
- **Owner** — All / Unassigned / [specific team member]

---

## Product Table

Each row provides a complete operational summary of a single SKU:

| Column | Description |
|---|---|
| **SKU** | Article number and product identifier |
| **Avg Price (₽)** | Current average selling price |
| **On-Hand Qty** | Current warehouse inventory |
| **Inbound Qty** | Stock in transit / awaiting delivery (highlighted in blue if > 0) |
| **Sold (30d)** | Units sold in the last 30 days |
| **Stock Health** | Badge (Critical / Low / Normal / Good) + days of stock cover |
| **Owner** | Name of the responsible person; shown in amber as "not assigned" if empty |
| **Open Tasks** | Count badge; turns danger red if 3+ tasks are open |
| **Open Incidents** | Count badge in red; any open incident is a visible signal |
| **Risk Level** | CRITICAL / HIGH / MED / LOW / NONE badge |
| **Status** | Active / Draft / Blocked pill |

The **days of stock cover** next to the Stock Health badge is critical — it tells managers exactly how many days of sales the current inventory supports, calculated automatically from average daily sales.

---

## SKU Detail Modal

Clicking any SKU row opens a comprehensive detail modal with six sections:

### 1. Status & Overview
Current status, risk level badge, and the key metrics grid:
- Current price
- On-hand quantity
- Units sold in the last 30 days

### 2. Owner Assignment
Shows the currently assigned owner. If unassigned, displays a clear prompt to assign one.

### 3. Open Tasks
A list of all currently open tasks linked to this SKU, with their status badges (in-progress, waiting, blocked). Allows the manager to see the full operational picture for the SKU without switching modules.

### 4. Open Incidents
All active incidents linked to this SKU with severity and status. A SKU with multiple open incidents is a high-priority escalation candidate.

### 5. Price History
A chronological log of all price changes for this SKU:
- Old price → New price
- Reason for change
- Who made the change
- Timestamp

This history provides full traceability for pricing decisions and supports founder review of pricing patterns.

### 6. Audit Log
A field-level change log showing every modification to the SKU record:
- Entity type (product, task, incident, etc.)
- Field name
- Old value → New value
- Who changed it
- When it was changed

---

## Stock Health Levels

| Level | Meaning |
|---|---|
| **Good** | Sufficient stock for 28+ days of sales |
| **Normal** | 14–27 days of stock cover |
| **Low** | 7–13 days of stock cover |
| **Critical** | Less than 7 days of stock cover |

---

## Risk Level System

Risk levels are computed automatically based on a combination of factors including stock levels, open incidents, pricing status, and sales velocity. They are not manually assigned — the system derives them from live data.

| Level | Implication |
|---|---|
| **CRITICAL** | Immediate action required; likely revenue loss if unaddressed |
| **HIGH** | Elevated risk; should be addressed today |
| **MED** | Monitoring required; schedule corrective action |
| **LOW** | Minor risk factor; watch and maintain |
| **NONE** | SKU is healthy across all dimensions |

---

## How It Connects to Other Modules

- **Open Tasks** → Tasks module for full task management
- **Open Incidents** → Incidents module for investigation and resolution
- **Price History** → Prices module for full pricing management
- **Owner** → Responsibilities module for ownership matrix management
- **Stock Health** → Analytics module for stockout forecasting
- **Risk Level** → Automation module for ad spend decisions

---

## Who Uses This Module

Used by **all team members** as a daily reference. Marketplace managers check it to understand their SKU portfolio. The founder uses it to audit ownership gaps and risk levels. Supply managers use it to identify reorder candidates. It is the single source of truth for "what is the state of this product right now?"
