# Prices — Pricing Management & Approval Workflow

## Overview

The Prices module provides full control over SKU pricing across both Ozon and Wildberries, with a structured workflow that separates price research, drafting, and execution. It includes built-in risk detection — automatically warning managers when a proposed change crosses approval thresholds — and maintains a complete history of every price change ever made, with the reasoning behind each one. No price change happens silently; every adjustment is traceable.

---

## Marketplace Selection

Pricing is managed per marketplace. The Ozon and Wildberries tabs at the top of the module switch the full dataset between platforms. Prices, history, and promotional data are all platform-specific.

---

## Three Operating Modes

The Prices module functions in three distinct modes:

### 1. Historical View (Research Mode)

The default view shows a summary table of all SKUs with their pricing history:

| Column | Description |
|---|---|
| **SKU** | Article number |
| **Min Price (₽)** | Lowest price recorded in the selected period |
| **Max Price (₽)** | Highest price recorded in the selected period |
| **Avg Price (₽)** | Average price over the period |
| **30-Day Trend** | Direction of pricing movement (rising / falling / stable) |
| **Status** | Active / Draft / Blocked |

**Period Selector**: The historical view can be set to 7 / 28 / 90 days, allowing both short-term and long-term pricing trend analysis.

Clicking any SKU row opens the Price Editor for that product.

---

### 2. Price Editor (Drafting Mode)

The Price Editor is where managers propose and prepare pricing changes before applying them:

- **Current Price** — The live marketplace price
- **New Price Input** — The proposed new price
- **Discount % (auto-calculated)** — The system automatically computes the discount percentage as the manager types the new price
- **Reason Field** — Mandatory free-text explanation for the change (e.g., "competitor repricing", "promo campaign", "cost increase")
- **Add to Draft** — Saves the proposed change to the Draft Queue without applying it immediately

**Automatic Risk Warnings**:

| Warning | Trigger |
|---|---|
| **Approval Required** | New price is more than 15% below the current price |
| **Deep Discount Alert** | New price creates a discount of more than 30% |

When an approval warning appears, the change cannot be applied directly — it must go through the Approval workflow and receive founder sign-off before taking effect on the marketplace. This prevents accidental or unauthorized deep discounts.

---

### 3. Draft Queue (Batch Execution Mode)

All proposed price changes accumulate in the Draft Queue before being applied. This allows managers to:

- Review all pending changes as a batch before committing
- See which changes require founder approval (flagged in the queue)
- Apply all changes at once with a single action, or apply individual changes selectively
- Remove a change from the draft if the situation has changed

The batch model prevents partial application errors and ensures the founder has reviewed any high-risk changes before they go live on the marketplace.

---

## Price Change History Modal

Every SKU has a full pricing history accessible via a modal. The history is a chronological timeline showing:

- **Old Price → New Price** — Exact values before and after the change
- **Reason** — The explanation provided at the time of change
- **Changed By** — Which team member made the adjustment
- **Approval Status** — Whether the change was:
  - Approved by the founder
  - Rejected (with rejection reason)
  - Pending (still awaiting decision)
  - Applied directly (no approval required)

This creates a complete audit trail for every pricing decision. If a price dropped unexpectedly, the reason and approver are always on record.

---

## Promotions Detail Modal

For each SKU, a Promotions modal shows all currently active promotional pricing configurations:

| Column | Description |
|---|---|
| **Promo Type** | The type of promotion (flash sale, coupon, etc.) |
| **Start / End Date** | Promotion validity window |
| **Action Price (₽)** | The discounted promotional price |
| **Discount %** | The promotion's discount depth |

Promo pricing is distinct from standard pricing changes — it operates within marketplace promotional frameworks and may require separate approval depending on the discount level.

---

## Filters

- **SKU Search** — Find a specific product by article number
- **Status Filter** — All / Active / Draft / Blocked
- **Period Selector** — 7 / 28 / 90 days for the historical view

---

## Approval Workflow Integration

The Prices module is tightly integrated with the Approvals module:

1. Manager proposes a price change exceeding the 15% threshold
2. System flags it as "Requires Approval" in the Draft Queue
3. An approval request is automatically created in the Approvals module
4. The founder reviews the request and approves or rejects it with a comment
5. Only after approval is the change released for application

This workflow ensures the founder maintains control over all significant pricing decisions without needing to be involved in routine, small adjustments.

---

## How It Connects to Other Modules

- **Deep discount warnings → Approvals**: Large price changes route to the approval queue automatically
- **Price history → Products**: Price history is also visible in the SKU Detail Modal in the Products module
- **Pricing risk signals → Analytics**: The Analytics module flags SKUs where pricing trends are creating business risk
- **Pricing decisions → Incidents**: If a pricing error caused a problem (e.g., sold below cost), it can be escalated to an Incident

---

## Who Uses This Module

Used primarily by **marketplace managers** and **category owners** for day-to-day pricing adjustments. The approval workflow ensures the **founder** is notified of and can veto significant pricing changes. All price changes are visible to any team member with access, maintaining full transparency.
