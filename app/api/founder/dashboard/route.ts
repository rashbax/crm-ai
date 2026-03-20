import { NextResponse } from "next/server";
import {
  getFounderTasks,
  getResponsibilities,
  getSystemUsers,
  getIncidents,
  getApprovals,
  getAuditLogs,
} from "@/lib/founder-store";
import type { TeamMemberScore } from "@/types/founder";

export async function GET() {
  try {
    const tasks = getFounderTasks();
    const matrix = getResponsibilities();
    const users = getSystemUsers();
    const incidents = getIncidents();
    const approvals = getApprovals();
    const auditLogs = getAuditLogs();

    // Read stocks for risk calculations
    let stocks: { sku: string; onHand: number; dailySales?: number }[] = [];
    try {
      const { readFileSync } = require("fs");
      const { join } = require("path");
      const raw = readFileSync(join(process.cwd(), "data", "canonical", "stocks.json"), "utf-8");
      stocks = JSON.parse(raw);
    } catch { /* no stock data */ }

    // ============================================
    // SIGNAL CARDS (Row 1)
    // ============================================

    const overdueTasks = tasks.filter((t) => t.status === "overdue").length;
    const pendingTaskApprovals = tasks.filter((t) => t.status === "need_approval").length;
    const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;

    const assignedSkus = new Set(matrix.map((r) => r.skuId));
    const allSkus = Array.from(new Set(stocks.map((s: any) => s.sku)));
    const noOwnerSkus = allSkus.filter((sku: string) => !assignedSkus.has(sku)).length;

    const stockoutRiskSkus = stocks.filter((s) => {
      if (s.onHand <= 0) return true;
      const daily = s.dailySales || 0;
      if (daily <= 0) return false;
      return s.onHand / daily < 7;
    }).length;

    const criticalIncidents = incidents.filter(
      (i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed"
    ).length;

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
        const overdue = userTasks.filter((t) => t.status === "overdue").length;
        const blocked = userTasks.filter((t) => t.status === "blocked").length;
        const waiting = userTasks.filter((t) => t.status === "waiting").length;
        const active = userTasks.filter(
          (t) => t.status !== "done" && t.status !== "overdue"
        ).length;
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
    const overdueCount = tasks.filter((t) => t.status === "overdue").length;

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

      // Team
      teamScorecard,

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
