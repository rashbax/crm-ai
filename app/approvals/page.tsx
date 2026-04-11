"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import type {
  Approval,
  SystemUser,
  ApprovalEntityType,
  ApprovalType,
  ApprovalStatus,
  ApprovalPriority,
} from "@/types/founder";
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  SearchInput,
  Button,
  StatusPill,
} from "@/components/ui";

const ENTITY_TYPES: ApprovalEntityType[] = [
  "price", "promo", "ads_budget", "stock_scale", "responsibility_change", "other",
];
const APPROVAL_TYPES: ApprovalType[] = [
  "price_below_min", "promo_loss_risk", "budget_over_limit",
  "critical_stock_scale", "owner_change", "general",
];
const PRIORITIES: ApprovalPriority[] = ["critical", "high", "medium", "low"];

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [lang, setLang] = useState<Language>("ru");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<ApprovalPriority | "all">("all");
  const [signalFilter, setSignalFilter] = useState<"all" | "expired" | "stale" | "critical">("all");

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formEntityType, setFormEntityType] = useState<ApprovalEntityType>("other");
  const [formApprovalType, setFormApprovalType] = useState<ApprovalType>("general");
  const [formPriority, setFormPriority] = useState<ApprovalPriority>("medium");
  const [formEntityId, setFormEntityId] = useState("");
  const [formMarketplace, setFormMarketplace] = useState("");
  const [formSkuId, setFormSkuId] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formOldValue, setFormOldValue] = useState("");
  const [formNewValue, setFormNewValue] = useState("");
  const [formBusinessImpact, setFormBusinessImpact] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formRequestedBy, setFormRequestedBy] = useState("");
  const [formError, setFormError] = useState("");

  // Decision modal
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionApproval, setDecisionApproval] = useState<Approval | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionError, setDecisionError] = useState("");

  // Resubmit modal (GAP 8)
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitApproval, setResubmitApproval] = useState<Approval | null>(null);
  const [resubmitReason, setResubmitReason] = useState("");
  const [resubmitNewValue, setResubmitNewValue] = useState("");

  useEffect(() => {
    setLang(storage.getLang());
    const params = new URLSearchParams(window.location.search);
    const st = params.get("status");
    const f = params.get("filter");
    const pri = params.get("priority");
    if (st === "pending" || st === "approved" || st === "rejected") setStatusFilter(st);
    if (f === "expired") setSignalFilter("expired");
    else if (f === "stale") setSignalFilter("stale");
    else if (f === "critical") setSignalFilter("critical");
    if (pri === "critical" || pri === "high" || pri === "medium" || pri === "low") setPriorityFilter(pri as ApprovalPriority);
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/founder/approvals", { cache: "no-store" });
      const data = await res.json();
      setApprovals(data.approvals || []);
      setUsers(data.users || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error("Failed to load approvals:", err);
    }
  };

  const getUserName = (id: string) => users.find((u) => u.id === id)?.name || id || "—";

  const getEntityTypeName = (t: ApprovalEntityType) => {
    const names: Record<ApprovalEntityType, { ru: string; uz: string }> = {
      price: { ru: "Цена", uz: "Narx" },
      promo: { ru: "Акция", uz: "Aksiya" },
      ads_budget: { ru: "Рекламный бюджет", uz: "Reklama byudjeti" },
      stock_scale: { ru: "Масштабирование стока", uz: "Zaxira kengaytirish" },
      responsibility_change: { ru: "Смена владельца", uz: "Owner almashtirish" },
      other: { ru: "Другое", uz: "Boshqa" },
    };
    return names[t]?.[lang] || t;
  };

  const getApprovalTypeName = (t: ApprovalType) => {
    const names: Record<ApprovalType, { ru: string; uz: string }> = {
      price_below_min: { ru: "Цена ниже мин. маржи", uz: "Narx minimal marjadan past" },
      promo_loss_risk: { ru: "Акция с риском убытка", uz: "Zarar xavfli aksiya" },
      budget_over_limit: { ru: "Бюджет выше лимита", uz: "Byudjet limitdan yuqori" },
      critical_stock_scale: { ru: "Масштаб при крит. стоке", uz: "Kritik zaxirada kengaytirish" },
      owner_change: { ru: "Смена ответственного", uz: "Javobgar almashtirish" },
      general: { ru: "Общий запрос", uz: "Umumiy so'rov" },
    };
    return names[t]?.[lang] || t;
  };

  const getStatusName = (s: ApprovalStatus) => {
    const names: Record<ApprovalStatus, { ru: string; uz: string }> = {
      pending: { ru: "Ожидает", uz: "Kutmoqda" },
      approved: { ru: "Одобрен", uz: "Tasdiqlandi" },
      rejected: { ru: "Отклонён", uz: "Rad etildi" },
    };
    return names[s]?.[lang] || s;
  };

  const getPriorityName = (p: ApprovalPriority) => {
    const names: Record<ApprovalPriority, { ru: string; uz: string }> = {
      critical: { ru: "Критический", uz: "Kritik" },
      high: { ru: "Высокий", uz: "Yuqori" },
      medium: { ru: "Средний", uz: "O'rta" },
      low: { ru: "Низкий", uz: "Past" },
    };
    return names[p]?.[lang] || p;
  };

  const getPriorityColor = (p: ApprovalPriority) => {
    const c: Record<ApprovalPriority, string> = {
      critical: "text-danger font-bold",
      high: "text-warning font-semibold",
      medium: "text-text-main",
      low: "text-text-muted",
    };
    return c[p] || "";
  };

  // Expiry helpers
  const isExpiringSoon = (a: Approval) => {
    if (!a.expiresAt || a.status !== "pending") return false;
    const hoursLeft = (new Date(a.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursLeft > 0 && hoursLeft < 24;
  };

  const filtered = approvals.filter((a) => {
    if (signalFilter === "expired") return a.isExpired;
    if (signalFilter === "stale") return a.isStale;
    if (signalFilter === "critical") return a.status === "pending" && a.priority === "critical";
    const matchSearch = !search ||
      a.reason.toLowerCase().includes(search.toLowerCase()) ||
      (a.entityId || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.skuId || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchPri = priorityFilter === "all" || a.priority === priorityFilter;
    return matchSearch && matchStatus && matchPri;
  });

  // Signals
  const staleApprovals = approvals.filter((a) => a.isStale);
  const expiredApprovals = approvals.filter((a) => a.isExpired);

  const openCreateModal = () => {
    setFormEntityType("other"); setFormApprovalType("general"); setFormPriority("medium");
    setFormEntityId(""); setFormMarketplace(""); setFormSkuId("");
    setFormReason(""); setFormOldValue(""); setFormNewValue("");
    setFormBusinessImpact(""); setFormExpiresAt(""); setFormRequestedBy(""); setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!formReason.trim()) { setFormError(lang === "ru" ? "Укажите причину" : "Sababni kiriting"); return; }
    if (!formRequestedBy) { setFormError(lang === "ru" ? "Укажите инициатора" : "Tashabbuskorni tanlang"); return; }
    // P1: mandatory per spec §4 + §10
    if (!formOldValue.trim()) { setFormError(lang === "ru" ? "Укажите текущее значение" : "Joriy qiymatni kiriting"); return; }
    if (!formNewValue.trim()) { setFormError(lang === "ru" ? "Укажите новое значение" : "Yangi qiymatni kiriting"); return; }

    const res = await fetch("/api/founder/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: formEntityType,
        approvalType: formApprovalType,
        priority: formPriority,
        entityId: formEntityId || "",
        marketplace: formMarketplace || undefined,
        skuId: formSkuId || undefined,
        reason: formReason.trim(),
        oldValue: formOldValue.trim() || undefined,
        newValue: formNewValue.trim() || undefined,
        businessImpact: formBusinessImpact.trim() || undefined,
        expiresAt: formExpiresAt || undefined,
        requestedBy: formRequestedBy,
      }),
    });
    if (!res.ok) { const d = await res.json(); setFormError(d.error || "Error"); return; }
    setShowModal(false);
    loadData();
  };

  const openDecisionModal = (approval: Approval) => {
    setDecisionApproval(approval);
    setDecisionComment("");
    setDecisionError("");
    setShowDecisionModal(true);
  };

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!decisionApproval) return;
    setDecisionError("");
    // GAP 6: mandatory comment
    if (!decisionComment.trim()) {
      setDecisionError(lang === "ru" ? "Комментарий обязателен" : "Izoh majburiy");
      return;
    }
    const res = await fetch("/api/founder/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "decide",
        id: decisionApproval.id,
        decision,
        decisionComment: decisionComment.trim(),
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    if (!res.ok) { const d = await res.json(); setDecisionError(d.error || "Error"); return; }
    setShowDecisionModal(false);
    loadData();
  };

  const openResubmitModal = (approval: Approval) => {
    setResubmitApproval(approval);
    setResubmitReason(approval.reason);
    setResubmitNewValue(approval.newValue || "");
    setShowResubmitModal(true);
  };

  const handleResubmit = async () => {
    if (!resubmitApproval) return;
    const res = await fetch("/api/founder/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resubmit",
        id: resubmitApproval.id,
        reason: resubmitReason.trim() || resubmitApproval.reason,
        newValue: resubmitNewValue.trim() || undefined,
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || "Error"); return; }
    setShowResubmitModal(false);
    loadData();
  };

  const l = {
    title: lang === "ru" ? "Согласования" : "Tasdiqlar",
    subtitle: lang === "ru"
      ? "Очередь решений Founder: только важные пороговые запросы"
      : "Founder qaror navbati: faqat muhim chegaradan oshgan so'rovlar",
    newBtn: lang === "ru" ? "Новый запрос" : "Yangi so'rov",
    save: lang === "ru" ? "Отправить" : "Yuborish",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    approve: lang === "ru" ? "Одобрить" : "Tasdiqlash",
    reject: lang === "ru" ? "Отклонить" : "Rad etish",
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{l.title}</h1>
          <p className="page-subtitle">{l.subtitle}</p>
        </div>
        <Button variant="primary" onClick={openCreateModal}>{l.newBtn}</Button>
      </div>

      {/* GAP 7: Stale reminder banner */}
      {staleApprovals.length > 0 && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <span className="text-warning font-semibold text-sm">
            {lang === "ru"
              ? `⏰ ${staleApprovals.length} запрос(ов) ожидают >24ч без ответа — требуют внимания Founder`
              : `⏰ ${staleApprovals.length} ta so'rov >24 soat javobsiz — Founder e'tiborini talab qiladi`}
          </span>
        </div>
      )}

      {/* GAP 5: Expired approvals banner */}
      {expiredApprovals.length > 0 && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg">
          <span className="text-danger font-semibold text-sm">
            {lang === "ru"
              ? `🔴 ${expiredApprovals.length} запрос(ов) просрочены — срок действия истёк`
              : `🔴 ${expiredApprovals.length} ta so'rov muddati o'tib ketgan`}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {(["pending", "approved", "rejected"] as ApprovalStatus[]).map((s) => (
          <Card
            key={s}
            className={`cursor-pointer ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
          >
            <div className="p-3 text-center">
              <p className="text-xs text-text-muted">{getStatusName(s)}</p>
              <p className={`text-xl font-bold ${
                s === "pending" ? "text-warning" : s === "approved" ? "text-success" : "text-danger"
              }`}>{stats[s] || 0}</p>
            </div>
          </Card>
        ))}
        {/* Signal cards */}
        <Card className={`cursor-pointer ${priorityFilter === "critical" ? "ring-2 ring-danger" : ""}`}
          onClick={() => setPriorityFilter(priorityFilter === "critical" ? "all" : "critical")}>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Критических" : "Kritik"}</p>
            <p className="text-xl font-bold text-danger">{stats.critical || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "🔴 Истёкших" : "🔴 O'tgan"}</p>
            <p className="text-xl font-bold text-danger">{stats.expired || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "⏰ Без ответа" : "⏰ Javobsiz"}</p>
            <p className="text-xl font-bold text-warning">{stats.stale || 0}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              placeholder={lang === "ru" ? "Поиск по запросам..." : "So'rovlar bo'yicha qidirish..."}
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as ApprovalPriority | "all")}
            className="px-3 py-2 border border-border rounded-lg text-sm">
            <option value="all">{lang === "ru" ? "Все приоритеты" : "Barcha prioritetlar"}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{getPriorityName(p)}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === "ru" ? "Приоритет" : "Prioritet"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип / Причина" : "Turi / Sabab"}</TableHead>
              <TableHead>{lang === "ru" ? "Изменение" : "O'zgarish"}</TableHead>
              <TableHead>{lang === "ru" ? "Влияние" : "Ta'sir"}</TableHead>
              <TableHead>{lang === "ru" ? "Инициатор" : "Tashabbuskor"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
              <TableHead>{lang === "ru" ? "Срок" : "Muddat"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((appr) => {
                const rowBg =
                  appr.isExpired ? "bg-danger/5" :
                  appr.priority === "critical" && appr.status === "pending" ? "bg-danger/5" :
                  appr.isStale ? "bg-warning/5" :
                  appr.status === "pending" ? "bg-warning/5" : "";

                return (
                  <TableRow key={appr.id} className={rowBg}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`text-sm ${getPriorityColor(appr.priority)}`}>
                          {getPriorityName(appr.priority)}
                        </span>
                        {/* GAP 5: expired badge */}
                        {appr.isExpired && (
                          <span className="text-xs text-danger font-semibold">
                            🔴 {lang === "ru" ? "Истёк" : "Muddati o'tdi"}
                          </span>
                        )}
                        {/* GAP 7: stale badge */}
                        {appr.isStale && !appr.isExpired && (
                          <span className="text-xs text-warning font-semibold">
                            ⏰ {lang === "ru" ? "Нет ответа" : "Javobsiz"}
                          </span>
                        )}
                        {/* Expiring soon */}
                        {isExpiringSoon(appr) && (
                          <span className="text-xs text-warning">
                            ⚡ {lang === "ru" ? "Истекает скоро" : "Tez o'tadi"}
                          </span>
                        )}
                        {/* Resubmit chain */}
                        {appr.parentApprovalId && (
                          <span className="text-xs text-text-muted">
                            ↩ {lang === "ru" ? "Переотправлен" : "Qayta yuborilgan"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{getEntityTypeName(appr.entityType)}</p>
                        <p className="text-xs text-text-muted">{getApprovalTypeName(appr.approvalType)}</p>
                        <p className="text-xs mt-1">{appr.reason}</p>
                        {appr.skuId && <p className="text-xs text-text-muted mt-0.5">SKU: {appr.skuId}</p>}
                        {appr.marketplace && <p className="text-xs text-text-muted">{appr.marketplace}</p>}
                      </div>
                    </TableCell>
                    {/* GAP 2: old/new value */}
                    <TableCell>
                      {(appr.oldValue || appr.newValue) ? (
                        <div className="text-xs">
                          {appr.oldValue && (
                            <p className="text-danger line-through">{appr.oldValue}</p>
                          )}
                          {appr.newValue && (
                            <p className="text-success font-medium">→ {appr.newValue}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </TableCell>
                    {/* GAP 3: business impact */}
                    <TableCell>
                      {appr.businessImpact ? (
                        <p className="text-xs text-warning">{appr.businessImpact}</p>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {getUserName(appr.requestedBy)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StatusPill status={appr.status}>
                          {getStatusName(appr.status)}
                        </StatusPill>
                        {appr.decisionComment && (
                          <p className="text-xs text-text-muted mt-1 italic">
                            "{appr.decisionComment}"
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {appr.expiresAt ? (
                        <div>
                          <p className={`text-xs ${appr.isExpired ? "text-danger font-semibold" : isExpiringSoon(appr) ? "text-warning" : "text-text-muted"}`}>
                            {new Date(appr.expiresAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                          </p>
                          <p className="text-xs text-text-muted">
                            {lang === "ru" ? "Создан:" : "Yaratildi:"} {new Date(appr.requestedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                          </p>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">
                          {new Date(appr.requestedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {appr.status === "pending" && (
                          <Button variant="primary" size="sm" onClick={() => openDecisionModal(appr)}>
                            {lang === "ru" ? "Решить" : "Qaror berish"}
                          </Button>
                        )}
                        {/* GAP 8: resubmit for rejected */}
                        {appr.status === "rejected" && (
                          <button
                            onClick={() => openResubmitModal(appr)}
                            className="text-xs text-primary hover:text-primary-dark font-medium text-left"
                          >
                            ↩ {lang === "ru" ? "Переотправить" : "Qayta yuborish"}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                  {lang === "ru" ? "Запросов нет" : "So'rovlar yo'q"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Create Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-text-main mb-4">{l.newBtn}</h2>
              {formError && <div className="bg-danger/10 text-danger text-sm p-3 rounded-lg mb-4">{formError}</div>}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Область" : "Soha"}</label>
                    <select value={formEntityType} onChange={(e) => setFormEntityType(e.target.value as ApprovalEntityType)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {ENTITY_TYPES.map((t) => <option key={t} value={t}>{getEntityTypeName(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Тип запроса" : "So'rov turi"}</label>
                    <select value={formApprovalType} onChange={(e) => setFormApprovalType(e.target.value as ApprovalType)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{getApprovalTypeName(t)}</option>)}
                    </select>
                  </div>
                </div>
                {/* GAP 4: priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Приоритет *" : "Prioritet *"}</label>
                    <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as ApprovalPriority)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {PRIORITIES.map((p) => <option key={p} value={p}>{getPriorityName(p)}</option>)}
                    </select>
                  </div>
                  {/* GAP 5: expiry */}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Срок действия" : "Amal qilish muddati"}</label>
                    <input type="datetime-local" value={formExpiresAt} onChange={(e) => setFormExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                </div>
                {/* GAP 1: marketplace + SKU */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Площадка" : "Platforma"}</label>
                    <select value={formMarketplace} onChange={(e) => setFormMarketplace(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      <option value="">{lang === "ru" ? "Не указано" : "Ko'rsatilmagan"}</option>
                      <option value="WB">Wildberries</option>
                      <option value="Ozon">Ozon</option>
                      <option value="all">{lang === "ru" ? "Все" : "Barchasi"}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">SKU</label>
                    <input value={formSkuId} onChange={(e) => setFormSkuId(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder={lang === "ru" ? "Необязательно" : "Ixtiyoriy"} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Причина запроса *" : "So'rov sababi *"}</label>
                  <textarea value={formReason} onChange={(e) => setFormReason(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                    placeholder={lang === "ru" ? "Почему нужно одобрение?" : "Nima uchun tasdiqlash kerak?"} />
                </div>
                {/* GAP 2: old/new value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Текущее значение *" : "Joriy qiymat *"}
                    </label>
                    <input value={formOldValue} onChange={(e) => setFormOldValue(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder={lang === "ru" ? "До изменения" : "O'zgarishdan oldin"} />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Новое значение *" : "Yangi qiymat *"}
                    </label>
                    <input value={formNewValue} onChange={(e) => setFormNewValue(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder={lang === "ru" ? "После изменения" : "O'zgarishdan keyin"} />
                  </div>
                </div>
                {/* GAP 3: business impact */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Влияние на бизнес" : "Biznesga ta'siri"}</label>
                  <textarea value={formBusinessImpact} onChange={(e) => setFormBusinessImpact(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[50px]"
                    placeholder={lang === "ru" ? "Какой риск или выгода?" : "Qanday xavf yoki foyda?"} />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Инициатор *" : "Tashabbuskor *"}</label>
                  <select value={formRequestedBy} onChange={(e) => setFormRequestedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                    <option value="">-- {lang === "ru" ? "выберите" : "tanlang"} --</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => setShowModal(false)}>{l.cancel}</Button>
                <Button variant="primary" onClick={handleSave}>{l.save}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Decision Modal ────────────────────────────────────────────────── */}
      {showDecisionModal && decisionApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDecisionModal(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-1">
                {lang === "ru" ? "Решение Founder" : "Founder qarori"}
              </h2>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-sm font-semibold ${getPriorityColor(decisionApproval.priority)}`}>
                  {getPriorityName(decisionApproval.priority)}
                </span>
                <span className="text-sm text-text-muted">•</span>
                <span className="text-sm text-text-muted">{getEntityTypeName(decisionApproval.entityType)}</span>
              </div>
              <p className="text-sm mb-2">{decisionApproval.reason}</p>
              {/* Show old/new value in decision context */}
              {(decisionApproval.oldValue || decisionApproval.newValue) && (
                <div className="mb-3 p-2 bg-surface-alt rounded text-xs flex gap-4">
                  {decisionApproval.oldValue && <span className="text-danger">{lang === "ru" ? "Было" : "Oldin"}: {decisionApproval.oldValue}</span>}
                  {decisionApproval.newValue && <span className="text-success">{lang === "ru" ? "Станет" : "Yangi"}: {decisionApproval.newValue}</span>}
                </div>
              )}
              {decisionApproval.businessImpact && (
                <div className="mb-3 p-2 bg-warning/5 border border-warning/20 rounded text-xs text-warning">
                  {lang === "ru" ? "Влияние:" : "Ta'sir:"} {decisionApproval.businessImpact}
                </div>
              )}
              <p className="text-xs text-text-muted mb-4">
                {lang === "ru" ? "Запросил:" : "So'ragan:"} {getUserName(decisionApproval.requestedBy)}
              </p>

              {decisionError && <div className="bg-danger/10 text-danger text-sm p-2 rounded mb-3">{decisionError}</div>}

              <div className="mb-4">
                <label className="text-xs text-text-muted mb-1 block">
                  {lang === "ru" ? "Комментарий к решению *" : "Qaror izohi *"}
                  {/* GAP 6: mandatory */}
                  <span className="text-danger ml-1">{lang === "ru" ? "(обязательно)" : "(majburiy)"}</span>
                </label>
                <textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[70px]"
                  placeholder={lang === "ru" ? "Почему одобрено / отклонено?" : "Nima uchun tasdiqlandi / rad etildi?"} />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowDecisionModal(false)}>{l.cancel}</Button>
                <Button variant="danger" onClick={() => handleDecision("rejected")}>{l.reject}</Button>
                <Button variant="primary" onClick={() => handleDecision("approved")}>{l.approve}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Resubmit Modal (GAP 8) ────────────────────────────────────────── */}
      {showResubmitModal && resubmitApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowResubmitModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {lang === "ru" ? "Переотправить запрос" : "So'rovni qayta yuborish"}
              </h2>
              <p className="text-xs text-text-muted mb-1">
                {lang === "ru" ? "Причина отклонения:" : "Rad etish sababi:"}
              </p>
              <p className="text-sm mb-3 text-danger italic">
                "{resubmitApproval.decisionComment || "—"}"
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Обновлённая причина запроса" : "Yangilangan so'rov sababi"}
                  </label>
                  <textarea value={resubmitReason} onChange={(e) => setResubmitReason(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Новое значение (если изменилось)" : "Yangi qiymat (agar o'zgartilgan bo'lsa)"}
                  </label>
                  <input value={resubmitNewValue} onChange={(e) => setResubmitNewValue(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="ghost" onClick={() => setShowResubmitModal(false)}>{l.cancel}</Button>
                <Button variant="primary" onClick={handleResubmit}>
                  {lang === "ru" ? "Отправить повторно" : "Qayta yuborish"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
