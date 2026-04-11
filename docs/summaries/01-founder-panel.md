# Founder Panel — Executive Control Dashboard

## Overview

The Founder Panel is the nerve center of the entire platform — a real-time executive dashboard designed exclusively for business leadership. It aggregates critical data from every area of the operation into a single, scannable view: revenue KPIs, team performance, stock risk, escalations, and pending decisions. Everything that demands the founder's attention surfaces here, ranked by urgency, so no critical issue ever gets missed.

---

## Key Metrics at a Glance

The top section of the dashboard displays live financial KPIs for the selected period:

| Metric | What It Shows |
|---|---|
| **Revenue** | Total sales revenue with period-over-period % change |
| **Order Count** | Number of confirmed orders vs. previous period |
| **Balance** | Available funds ready for withdrawal |
| **Accrued Amount** | Revenue recognized but not yet withdrawn |

Each metric card shows a directional arrow and percentage change so the founder immediately knows whether performance is trending up or down — no drilling required.

---

## Revenue Trend Chart

A 7/14/28-day revenue trend chart provides visual context behind the numbers. The founder can switch between time windows to understand short-term spikes vs. sustained growth patterns. The chart overlays the current period against the previous one, making it easy to spot anomalies.

---

## Critical Escalations

A live-updated list of the most urgent tasks across the entire organization:

- **Status** — current task state (blocked, waiting, in-progress)
- **Assignee** — who is responsible
- **Marketplace** — which platform is affected (Ozon / Wildberries)
- **Overdue Days** — how many days past the deadline

Tasks that have passed their due date are highlighted in red. This section is the founder's primary triage view for deciding where to intervene.

---

## Stale Tasks

Any task that has not been updated in more than **48 hours** is flagged as stale and surfaced here with its exact age (in hours). Stale tasks are a proxy for blocked communication or neglected ownership — catching them early prevents minor delays from becoming major incidents.

---

## Top Risky SKUs

A stock-risk matrix that ranks products by their likelihood to cause revenue damage:

- **Days to Stockout** — calculated from current inventory and daily sales rate
- **Open Incidents** — how many active incidents are linked to this SKU
- **Owner Assignment** — whether a responsible person is assigned
- **Risk Score** — composite score used for ranking

SKUs that are selling well but running low on stock are the most dangerous — this section makes them impossible to overlook.

---

## Team Scorecard

A performance table covering every manager on the team:

| Column | Meaning |
|---|---|
| **Active Tasks** | Currently open tasks assigned to this person |
| **Completed On Time** | Tasks closed before their deadline |
| **Overdue** | Tasks past deadline |
| **Completion Rate %** | Closed on-time ÷ total assigned |
| **Incident Count** | Open incidents owned by this person |
| **Avg Resolution Time** | Average hours to close an incident |
| **Approval Delay** | Average hours between approval request and decision |
| **Founder Interventions** | How many times the founder had to step in |
| **Risky SKUs** | Number of high-risk SKUs in this person's area |

This scorecard makes accountability visible. The founder can identify who is executing reliably and who needs support — without asking anyone for a status update.

---

## Recent Blockers

A list of tasks currently in **Blocked** status, along with the stated reason for the block. Blockers represent organizational friction — a person cannot proceed until something external is resolved. This section allows the founder to unblock the team quickly.

---

## Critical & High-Severity Incidents

Recent incidents of severity **Critical** or **High** are surfaced here regardless of their current status. If a listing was blocked, a barcode problem emerged, or returns spiked on a key SKU, it appears in this section immediately.

---

## Pending Approvals

A summary list of approvals waiting for a founder decision, showing the entity type (price change, promo, ads budget, etc.) and how long each request has been waiting. One-click access to the full Approvals module is provided for faster decision-making.

---

## Automated Alerts

The dashboard generates up to **12 automatic alerts** based on live inventory and sales data:

- **Critical**: SKU is fully out of stock while orders are still coming in
- **Warning**: Stock is critically low on a SKU with high recent sales
- **Info**: Stock is below the safety threshold

Alerts are color-coded (red / amber) and link directly to the affected SKU for immediate action.

---

## Who Uses This Module

This module is designed for the **founder or CEO** only. All other team members see their own task queues, incident registries, and SKU responsibilities through their respective modules — but only the founder has this unified executive view.
