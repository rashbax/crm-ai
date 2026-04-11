import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  getFounderTasks,
  getResponsibilities,
  getSystemUsers,
  getIncidents,
  getApprovals,
  getAuditLogs,
  getAppeals,
} from "@/lib/founder-store";
import type { TeamMemberScore } from "@/types/founder";

type ProductStatus = "active" | "draft" | "blocked";

function getProductStatus(pricesCount: number, onHand: number, inbound: number, stockKnown: boolean, soldLast30d: number, onSale?: boolean): ProductStatus {
  if (onSale === false) return "blocked";
  if (onSale === true) return "active";
  if (stockKnown && onHand <= 0 && inbound <= 0) return "blocked";
  if (soldLast30d > 0) return "active";
  if (pricesCount > 0) return "draft";
  return stockKnown && (onHand > 0 || inbound > 0) ? "active" : "draft";
}

export async function GET(request: NextRequest) {
  try {
    const mp = request.nextUrl.searchParams.get("marketplace") || "all";
    const tasks = getFounderTasks();
    const matrix = getResponsibilities();
    const users = getSystemUsers();
    const incidents = getIncidents();
    const approvals = getApprovals();
    const auditLogs = getAuditLogs();

    // Read canonical data for risk calculations
    const { readFileSync } = require("fs");
    const { join } = require("path");

    let allStocks: { sku: string; onHand: number; inbound?: number; dailySales?: number; marketplace?: string }[] = [];
    try {
      allStocks = JSON.parse(readFileSync(join(process.cwd(), "data", "canonical", "stocks.json"), "utf-8"));
    } catch { /* no stock data */ }

    let allOrders: { sku: string; date: string; marketplace?: string; qty?: number }[] = [];
    try {
      allOrders = JSON.parse(readFileSync(join(process.cwd(), "data", "canonical", "orders.json"), "utf-8"));
    } catch { /* no orders data */ }

    let allPrices: { sku: string; marketplace?: string; onSale?: boolean }[] = [];
    try {
      allPrices = JSON.parse(readFileSync(join(process.cwd(), "data", "canonical", "prices.json"), "utf-8"));
    } catch { /* no prices data */ }

    // Apply marketplace filter
    const stocks = mp !== "all" ? allStocks.filter((s) => (s.marketplace || "").toLowerCase() === mp.toLowerCase()) : allStocks;
    const filteredOrders = mp !== "all" ? allOrders.filter((o) => (o.marketplace || "").toLowerCase() === mp.toLowerCase()) : allOrders;
    const filteredPrices = mp !== "all" ? allPrices.filter((p) => (p.marketplace || "").toLowerCase() === mp.toLowerCase()) : allPrices;

    // Compute per-SKU sold in last 30 days + price count for status determination
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const soldLast30d: Record<string, number> = {};
    for (const o of filteredOrders) {
      if (new Date(o.date).getTime() > thirtyDaysAgo) {
        soldLast30d[o.sku] = (soldLast30d[o.sku] || 0) + (o.qty || 1);
      }
    }
    const priceCountBySku: Record<string, number> = {};
    const onSaleBySku: Record<string, boolean | undefined> = {};
    for (const p of filteredPrices) {
      priceCountBySku[p.sku] = (priceCountBySku[p.sku] || 0) + 1;
      if (p.onSale === true || p.onSale === false) {
        onSaleBySku[p.sku] = p.onSale;
      }
    }

    // ============================================
    // SIGNAL CARDS (Row 1)
    // ============================================

    const overdueTasks = tasks.filter((t) => t.isOverdue).length;
    const pendingTaskApprovals = tasks.filter((t) => t.status === "need_approval").length;
    const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;
    // GAP 5/7 (T3-05): expired + stale approval signals
    const expiredApprovals = approvals.filter((a) => a.isExpired).length;
    const staleApprovals = approvals.filter((a) => a.isStale).length;
    const criticalPendingApprovals = approvals.filter(
      (a) => a.status === "pending" && a.priority === "critical"
    ).length;

    const assignedSkus = new Set(matrix.map((r) => r.skuId));
    const allSkus = Array.from(new Set(stocks.map((s: any) => s.sku)));
    const noOwnerSkus = allSkus.filter((sku: string) => !assignedSkus.has(sku)).length;

    const stockoutRiskSkus = stocks.filter((s) => {
      // Only count active products (same logic as products page)
      const skuSold = soldLast30d[s.sku] || 0;
      const skuPrices = priceCountBySku[s.sku] || 0;
      const skuOnSale = onSaleBySku[s.sku];
      const status = getProductStatus(skuPrices, s.onHand, s.inbound || 0, true, skuSold, skuOnSale);
      if (status !== "active") return false;
      if (s.onHand <= 0) return true;
      const daily = skuSold > 0 ? skuSold / 30 : (s.dailySales || 0);
      if (daily <= 0) return false;
      return s.onHand / daily < 7;
    }).length;

    const criticalIncidents = incidents.filter(
      (i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed"
    ).length;

    // GAP 5/7: silent incidents + SLA-breached high-severity
    const silentIncidents = incidents.filter((i) => i.isSilent).length;
    const SLA_HOURS: Record<string, number> = { critical: 1, high: 4 };
    const slaBreachedHighIncidents = incidents.filter((i) => {
      if (i.status === "resolved" || i.status === "closed") return false;
      if (i.severity !== "high" && i.severity !== "critical") return false;
      const hours = (Date.now() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60);
      return hours > SLA_HOURS[i.severity];
    }).length;

    const lossRiskItems = incidents.filter(
      (i) => (i.incidentType === "pricing_risk" || i.incidentType === "ad_overspend") &&
        i.status !== "resolved" && i.status !== "closed"
    ).length;

    const adStockConflicts = incidents.filter(
      (i) => (i.incidentType === "stock_mismatch" || i.incidentType === "supply_issue") &&
        (i.severity === "critical" || i.severity === "high") &&
        i.status !== "resolved" && i.status !== "closed"
    ).length;

    // ============================================
    // TEAM SCORECARD with KPI-ready metrics (Sprint 3)
    // ============================================

    const teamScorecard: (TeamMemberScore & {
      blockedTasks: number;
      waitingTasks: number;
      incidentCount: number;
      avgResolutionHours: number | null;
      approvalDelay: number | null;
      founderInterventions: number;
      lastUpdateAge: number | null;
    })[] = users
      .filter((u) => u.role === "manager")
      .map((u) => {
        const userTasks = tasks.filter((t) => t.assigneeId === u.id);
        const completed = userTasks.filter((t) => t.status === "done");
        const completedOnTime = completed.filter((t) => t.overdueDays === 0).length;
        const overdue = userTasks.filter((t) => t.isOverdue).length;
        const blocked = userTasks.filter((t) => t.status === "blocked").length;
        const waiting = userTasks.filter((t) => t.status === "waiting").length;
        const active = userTasks.filter((t) => t.status !== "done").length;
        const total = completed.length + overdue;

        // Incidents owned by this user
        const userIncidents = incidents.filter((i) => i.ownerId === u.id);
        const resolvedIncidents = userIncidents.filter((i) => i.resolvedAt);
        const avgResolutionHours = resolvedIncidents.length > 0
          ? resolvedIncidents.reduce((sum, i) => {
              const created = new Date(i.createdAt).getTime();
              const resolved = new Date(i.resolvedAt!).getTime();
              return sum + (resolved - created) / (1000 * 60 * 60);
            }, 0) / resolvedIncidents.length
          : null;

        // Approval delay: how long approvals requested by this user waited
        const userApprovals = approvals.filter((a) => a.requestedBy === u.id && a.decidedAt);
        const approvalDelay = userApprovals.length > 0
          ? userApprovals.reduce((sum, a) => {
              const req = new Date(a.requestedAt).getTime();
              const dec = new Date(a.decidedAt!).getTime();
              return sum + (dec - req) / (1000 * 60 * 60);
            }, 0) / userApprovals.length
          : null;

        // Founder interventions: need_approval tasks from this user
        const founderInterventions = userTasks.filter((t) => t.status === "need_approval").length;

        // Last update age: hours since last task update by this user
        const userTaskUpdates = userTasks.filter((t) => t.updatedAt).map((t) => new Date(t.updatedAt).getTime());
        const lastUpdateAge = userTaskUpdates.length > 0
          ? (Date.now() - Math.max(...userTaskUpdates)) / (1000 * 60 * 60)
          : null;

        return {
          userId: u.id,
          userName: u.name,
          role: u.role,
          activeTasks: active,
          completedOnTime,
          overdueTasks: overdue,
          completionRate: total > 0 ? Math.round((completedOnTime / total) * 100) : 100,
          blockedTasks: blocked,
          waitingTasks: waiting,
          incidentCount: userIncidents.filter((i) => i.status !== "resolved" && i.status !== "closed").length,
          avgResolutionHours: avgResolutionHours !== null ? Math.round(avgResolutionHours * 10) / 10 : null,
          approvalDelay: approvalDelay !== null ? Math.round(approvalDelay * 10) / 10 : null,
          founderInterventions,
          lastUpdateAge: lastUpdateAge !== null ? Math.round(lastUpdateAge * 10) / 10 : null,
        };
      });

    // ============================================
    // RECENT BLOCKERS (Sprint 3 — Row 2)
    // ============================================

    const recentBlockers = tasks
      .filter((t) => t.status === "blocked" || t.status === "waiting")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: users.find((u) => u.id === t.assigneeId)?.name || t.assigneeId,
        reason: t.blockedReason || t.waitingReason || "",
        dueDate: t.dueDate,
        overdueDays: t.overdueDays,
      }));

    // Recent critical incidents
    const recentCriticalIncidents = incidents
      .filter((i) => (i.severity === "critical" || i.severity === "high") && i.status !== "resolved" && i.status !== "closed")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        owner: users.find((u) => u.id === i.ownerId)?.name || i.ownerId,
        dueDate: i.dueDate,
      }));

    // Pending approvals list
    const pendingApprovalsList = approvals
      .filter((a) => a.status === "pending")
      .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        entityType: a.entityType,
        reason: a.reason,
        requestedBy: users.find((u) => u.id === a.requestedBy)?.name || a.requestedBy,
        requestedAt: a.requestedAt,
      }));

    // ============================================
    // KPI AGGREGATE METRICS (Sprint 3)
    // ============================================

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    const doneOnTime = tasks.filter((t) => t.status === "done" && t.overdueDays === 0).length;
    const onTimeRate = doneTasks > 0 ? Math.round((doneOnTime / doneTasks) * 100) : 100;
    const overdueCount = tasks.filter((t) => t.isOverdue).length;

    // GAP 6: Critical overdue escalations for founder panel
    const criticalEscalations = tasks
      .filter((t) => t.isOverdue && t.priority === "critical" && t.status !== "done")
      .sort((a, b) => b.overdueDays - a.overdueDays)
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        title: t.title,
        assignee: users.find((u) => u.id === t.assigneeId)?.name || t.assigneeId,
        priority: t.priority,
        impactLevel: t.impactLevel,
        dueDate: t.dueDate,
        overdueDays: t.overdueDays,
        marketplace: t.marketplace,
        status: t.status,
      }));

    const resolvedIncs = incidents.filter((i) => i.resolvedAt);
    const avgIncidentResolution = resolvedIncs.length > 0
      ? Math.round(resolvedIncs.reduce((sum, i) => {
          return sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60);
        }, 0) / resolvedIncs.length)
      : null;

    const decidedApprovals = approvals.filter((a) => a.decidedAt);
    const avgApprovalDelay = decidedApprovals.length > 0
      ? Math.round(decidedApprovals.reduce((sum, a) => {
          return sum + (new Date(a.decidedAt!).getTime() - new Date(a.requestedAt).getTime()) / (1000 * 60 * 60);
        }, 0) / decidedApprovals.length)
      : null;

    const founderInterventionCount = tasks.filter((t) => t.status === "need_approval").length
      + approvals.filter((a) => a.status === "pending").length;

    const stockoutCases = stocks.filter((s) => s.onHand <= 0).length;

    // ============================================
    // APPEAL SIGNALS (T3-13)
    // ============================================

    const appeals = getAppeals();
    const activeAppeals = appeals.filter((a) => a.status !== "yopilgan");
    const unansweredAppeals = appeals.filter((a) => a.status === "yangi").length;
    const slaBreachedAppeals = activeAppeals.filter((a) => a.slaBreached).length;
    const negativeAppeals = activeAppeals.filter((a) => a.sentiment === "negative").length;

    // ============================================
    // STALE TASKS (T3-01: tasks not updated in 48h+)
    // ============================================

    const STALE_HOURS = 48;
    const staleThreshold = Date.now() - STALE_HOURS * 60 * 60 * 1000;
    const staleTasksAll = tasks
      .filter((t) => t.status !== "done" && t.updatedAt && new Date(t.updatedAt).getTime() < staleThreshold)
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    const staleTasks = staleTasksAll.length;
    const staleTasksList = staleTasksAll.slice(0, 10).map((t) => ({
      id: t.id,
      title: t.title,
      assignee: users.find((u) => u.id === t.assigneeId)?.name || t.assigneeId,
      status: t.status,
      lastUpdated: t.updatedAt,
      hoursSinceUpdate: Math.round((Date.now() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60)),
    }));

    // ============================================
    // TOP RISKY SKUs (T3-01: cross-reference stocks, incidents, responsibilities)
    // ============================================

    const openIncidentsBySku: Record<string, number> = {};
    for (const inc of incidents) {
      if (inc.skuId && inc.status !== "resolved" && inc.status !== "closed") {
        openIncidentsBySku[inc.skuId] = (openIncidentsBySku[inc.skuId] || 0) + 1;
      }
    }

    const topRiskySkus = stocks
      .filter((s) => {
        // Use same status logic as products page — only show "active" SKUs
        const skuSold = soldLast30d[s.sku] || 0;
        const skuPrices = priceCountBySku[s.sku] || 0;
        const skuOnSale = onSaleBySku[s.sku];
        const status = getProductStatus(skuPrices, s.onHand, s.inbound || 0, true, skuSold, skuOnSale);
        return status === "active";
      })
      .map((s) => {
        const skuSold = soldLast30d[s.sku] || 0;
        const daily = skuSold > 0 ? skuSold / 30 : (s.dailySales || 0);
        const daysToStockout = daily > 0 && s.onHand > 0 ? Math.round((s.onHand / daily) * 10) / 10 : null;
        const skuIncidents = openIncidentsBySku[s.sku] || 0;
        const hasOwner = assignedSkus.has(s.sku);

        let riskScore = 0;
        if (s.onHand <= 0) riskScore += 5;                                        // out of stock — critical
        else if (daysToStockout !== null && daysToStockout < 3) riskScore += 4;    // <3 days — almost out
        else if (daysToStockout !== null && daysToStockout < 7) riskScore += 3;    // <7 days — urgent
        else if (daysToStockout !== null && daysToStockout < 14) riskScore += 1;   // <14 days — watch
        riskScore += skuIncidents * 2;
        if (!hasOwner) riskScore += 1;

        return {
          sku: s.sku,
          marketplace: (s as any).marketplace || "—",
          onHand: s.onHand,
          daysToStockout,
          openIncidents: skuIncidents,
          hasOwner,
          riskScore,
        };
      })
      .filter((s) => s.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    // ============================================
    // ENHANCED TEAM SCORECARD (T3-01: area, risky SKUs, interventions)
    // ============================================

    // Determine manager areas from responsibility matrix
    const roleColumns = ["marketplaceOwnerId", "adsOwnerId", "contentOwnerId", "supplyOwnerId", "reviewerId"] as const;
    const areaLabels: Record<string, string> = {
      marketplaceOwnerId: "Marketplace",
      adsOwnerId: "Ads",
      contentOwnerId: "Content",
      supplyOwnerId: "Supply",
      reviewerId: "Review",
    };

    const getManagerArea = (userId: string): string => {
      const counts: Record<string, number> = {};
      for (const r of matrix) {
        for (const col of roleColumns) {
          if ((r as any)[col] === userId) {
            counts[col] = (counts[col] || 0) + 1;
          }
        }
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return top ? areaLabels[top[0]] : "";
    };

    const getManagerRiskySkuCount = (userId: string): number => {
      const managerSkus = new Set<string>();
      for (const r of matrix) {
        for (const col of roleColumns) {
          if ((r as any)[col] === userId) managerSkus.add(r.skuId);
        }
      }
      return stocks.filter((s) => {
        if (!managerSkus.has(s.sku)) return false;
        const daily = s.dailySales || 0;
        if (s.onHand <= 0) return true;
        if (daily > 0 && s.onHand / daily < 7) return true;
        return (openIncidentsBySku[s.sku] || 0) > 0;
      }).length;
    };

    // Attach area and riskySkuCount to existing teamScorecard
    const enhancedTeamScorecard = teamScorecard.map((m) => ({
      ...m,
      area: getManagerArea(m.userId),
      riskySkuCount: getManagerRiskySkuCount(m.userId),
    }));

    // ============================================
    // INTEGRATION HEALTH SIGNALS (T3-12)
    // ============================================

    let integrationAlerts = 0;
    const integrationDetails: { marketplace: string; flow: string; issue: string }[] = [];
    try {
      const { readFileSync } = require("fs");
      const connFile = path.join(process.cwd(), "data", "secure", "connections.json");
      const connData = JSON.parse(readFileSync(connFile, "utf-8"));
      const conns = (connData?.connections || []).filter((c: any) => c.enabled);
      const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24h

      for (const c of conns) {
        if (c.marketplaceId !== "wb" && c.marketplaceId !== "ozon") continue;
        const mp = c.marketplaceId === "wb" ? "Wildberries" : "Ozon";
        const flows = ["orders", "stocks", "ads", "prices"] as const;
        for (const f of flows) {
          if (!c.enabledData?.[f]) continue;
          if (c.lastError) {
            integrationAlerts++;
            integrationDetails.push({ marketplace: mp, flow: f, issue: "error" });
          } else if (!c.lastSyncAt) {
            integrationAlerts++;
            integrationDetails.push({ marketplace: mp, flow: f, issue: "never_synced" });
          } else if (Date.now() - new Date(c.lastSyncAt).getTime() > STALE_THRESHOLD) {
            integrationAlerts++;
            integrationDetails.push({ marketplace: mp, flow: f, issue: "stale" });
          }
        }
      }
    } catch { /* no connections data */ }

    // ============================================
    // RESPONSE
    // ============================================

    return NextResponse.json({
      // Signal cards
      criticalIncidents,
      overdueTasks,
      pendingApprovals: pendingTaskApprovals + pendingApprovalsCount,
      noOwnerSkus,
      stockoutRiskSkus,
      lossRiskItems,
      adStockConflicts,

      // Appeal signals (T3-13)
      unansweredAppeals,
      slaBreachedAppeals,
      negativeAppeals,

      // Incident signals (T3-04 GAP 5/7)
      silentIncidents,
      slaBreachedHighIncidents,

      // Approval signals (T3-05 GAP 5/7)
      expiredApprovals,
      staleApprovals,
      criticalPendingApprovals,

      // Integration health signals (T3-12)
      integrationAlerts,
      integrationDetails: integrationDetails.slice(0, 5),

      // Stale tasks (T3-01)
      staleTasks,
      staleTasksList,

      // Critical overdue escalations (T3-02 GAP 6)
      criticalEscalations,

      // Top risky SKUs (T3-01)
      topRiskySkus,

      // Team (enhanced with area, riskySkuCount)
      teamScorecard: enhancedTeamScorecard,

      // Row 2: Recent blockers & incidents
      recentBlockers,
      recentCriticalIncidents,
      pendingApprovalsList,

      // KPI aggregates
      kpi: {
        onTimeCompletionRate: onTimeRate,
        overdueTaskCount: overdueCount,
        incidentResolutionTimeHours: avgIncidentResolution,
        approvalDelayHours: avgApprovalDelay,
        founderInterventionCount,
        stockoutCases,
        totalTasks,
        doneTasks,
        openIncidents: incidents.filter((i) => i.status !== "resolved" && i.status !== "closed").length,
        totalApprovals: approvals.length,
      },
    });
  } catch (error) {
    console.error("Failed to get founder dashboard:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
