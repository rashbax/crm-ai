import { NextResponse } from "next/server";
import {
  getFounderTasks,
  getResponsibilities,
  getSystemUsers,
} from "@/lib/founder-store";
import type { FounderWidgetData, TeamMemberScore } from "@/types/founder";

export async function GET() {
  try {
    const tasks = getFounderTasks();
    const matrix = getResponsibilities();
    const users = getSystemUsers();

    // Read stocks and prices for risk calculations
    let stocks: { sku: string; onHand: number; dailySales?: number }[] = [];
    try {
      const { readFileSync } = require("fs");
      const { join } = require("path");
      const raw = readFileSync(join(process.cwd(), "data", "canonical", "stocks.json"), "utf-8");
      stocks = JSON.parse(raw);
    } catch { /* no stock data */ }

    // Widget calculations
    const overdueTasks = tasks.filter((t) => t.status === "overdue").length;
    const pendingApprovals = tasks.filter((t) => t.status === "need_approval").length;

    // SKUs from stocks that have no owner in responsibility matrix
    const assignedSkus = new Set(matrix.map((r) => r.skuId));
    const allSkus = Array.from(new Set(stocks.map((s: any) => s.sku)));
    const noOwnerSkus = allSkus.filter((sku: string) => !assignedSkus.has(sku)).length;

    // Stockout risk: onHand > 0 but daysCover < 7
    const stockoutRiskSkus = stocks.filter((s) => {
      if (s.onHand <= 0) return true;
      const daily = s.dailySales || 0;
      if (daily <= 0) return false;
      const daysCover = s.onHand / daily;
      return daysCover < 7;
    }).length;

    // Team scorecard
    const teamScorecard: TeamMemberScore[] = users
      .filter((u) => u.role === "manager")
      .map((u) => {
        const userTasks = tasks.filter((t) => t.assigneeId === u.id);
        const completed = userTasks.filter((t) => t.status === "done");
        const completedOnTime = completed.filter((t) => t.overdueDays === 0).length;
        const overdue = userTasks.filter((t) => t.status === "overdue").length;
        const active = userTasks.filter(
          (t) => t.status !== "done" && t.status !== "overdue"
        ).length;
        const total = completed.length + overdue;
        return {
          userId: u.id,
          userName: u.name,
          role: u.role,
          activeTasks: active,
          completedOnTime,
          overdueTasks: overdue,
          completionRate: total > 0 ? Math.round((completedOnTime / total) * 100) : 100,
        };
      });

    const widgetData: FounderWidgetData = {
      criticalIncidents: 0, // Sprint 2
      overdueTasks,
      pendingApprovals,
      noOwnerSkus,
      stockoutRiskSkus,
      lossRiskItems: 0, // Sprint 2
      adStockConflicts: 0, // Sprint 2
      teamScorecard,
    };

    return NextResponse.json(widgetData);
  } catch (error) {
    console.error("Failed to get founder dashboard:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
