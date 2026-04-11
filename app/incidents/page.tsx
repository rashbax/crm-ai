"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import type {
  Incident,
  SystemUser,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  MarketplaceId,
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

const INCIDENT_TYPES: IncidentType[] = [
  "stock_mismatch", "barcode_problem", "return_spike", "listing_blocked",
  "pricing_risk", "ad_overspend", "supply_issue", "document_issue", "other",
];
const SEVERITIES: IncidentSeverity[] = ["critical", "high", "medium", "low"];
// GAP 2: waiting + reopened added; escalated removed as status
const STATUSES: IncidentStatus[] = ["open", "in_progress", "waiting", "reopened", "resolved", "closed"];

const SLA_HOURS: Record<IncidentSeverity, number> = { critical: 1, high: 4, medium: 12, low: 24 };

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "waiting"],
  in_progress: ["waiting", "resolved"],
  waiting: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
  reopened: ["in_progress", "waiting"],
};

export default function IncidentsPage() {
  const { data: session } = useSession();
  const [lang, setLang] = useState<Language>("ru");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "all">("all");
  const [signalFilter, setSignalFilter] = useState<"all" | "silent" | "no_owner">("all");

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<IncidentType>("other");
  const [formSeverity, setFormSeverity] = useState<IncidentSeverity>("medium");
  const [formMp, setFormMp] = useState<MarketplaceId | "all">("all");
  const [formSku, setFormSku] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formDue, setFormDue] = useState("");
  const [formRootCause, setFormRootCause] = useState("");
  const [formActionPlan, setFormActionPlan] = useState("");
  const [formReviewer, setFormReviewer] = useState("");
  const [formEstimatedLoss, setFormEstimatedLoss] = useState("");
  const [formError, setFormError] = useState("");

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusIncident, setStatusIncident] = useState<Incident | null>(null);
  const [newStatus, setNewStatus] = useState<IncidentStatus>("in_progress");
  const [statusRootCause, setStatusRootCause] = useState("");
  const [statusActionPlan, setStatusActionPlan] = useState("");

  // Reopen modal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenIncident, setReopenIncident] = useState<Incident | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  // History modal (GAP 8 — linked tasks + audit)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailIncident, setDetailIncident] = useState<Incident | null>(null);

  useEffect(() => {
    setLang(storage.getLang());
    const params = new URLSearchParams(window.location.search);
    const sev = params.get("severity");
    const st = params.get("status");
    const f = params.get("filter");
    if (sev && SEVERITIES.includes(sev as IncidentSeverity)) setSeverityFilter(sev as IncidentSeverity);
    if (st && STATUSES.includes(st as IncidentStatus)) setStatusFilter(st as IncidentStatus);
    if (f === "silent") setSignalFilter("silent");
    if (f === "no_owner") setSignalFilter("no_owner");
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/founder/incidents", { cache: "no-store" });
      const data = await res.json();
      setIncidents(data.incidents || []);
      setUsers(data.users || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error("Failed to load incidents:", err);
    }
  };

  const getUserName = (id: string) => users.find((u) => u.id === id)?.name || id || "—";

  const getTypeName = (type: IncidentType) => {
    const names: Record<IncidentType, { ru: string; uz: string }> = {
      stock_mismatch: { ru: "Расхождение остатков", uz: "Qoldiq tafovuti" },
      barcode_problem: { ru: "Проблема штрихкода", uz: "Shtrix-kod muammosi" },
      return_spike: { ru: "Скачок возвратов", uz: "Qaytarish ko'payishi" },
      listing_blocked: { ru: "Листинг заблокирован", uz: "Listing bloklangan" },
      pricing_risk: { ru: "Ценовой риск", uz: "Narx xavfi" },
      ad_overspend: { ru: "Перерасход рекламы", uz: "Reklama ortiqcha xarajati" },
      supply_issue: { ru: "Проблема поставки", uz: "Yetkazish muammosi" },
      document_issue: { ru: "Проблема документов", uz: "Hujjat muammosi" },
      other: { ru: "Другое", uz: "Boshqa" },
    };
    return names[type]?.[lang] || type;
  };

  const getSeverityName = (s: IncidentSeverity) => {
    const names: Record<IncidentSeverity, { ru: string; uz: string }> = {
      critical: { ru: "Критический", uz: "Kritik" },
      high: { ru: "Высокий", uz: "Yuqori" },
      medium: { ru: "Средний", uz: "O'rta" },
      low: { ru: "Низкий", uz: "Past" },
    };
    return names[s]?.[lang] || s;
  };

  const getSeverityColor = (s: IncidentSeverity) => {
    const c: Record<IncidentSeverity, string> = {
      critical: "text-danger font-bold",
      high: "text-warning font-semibold",
      medium: "text-text-main",
      low: "text-text-muted",
    };
    return c[s] || "";
  };

  const getStatusName = (s: IncidentStatus) => {
    const names: Record<IncidentStatus, { ru: string; uz: string }> = {
      open: { ru: "Открыт", uz: "Ochiq" },
      in_progress: { ru: "В работе", uz: "Jarayonda" },
      waiting: { ru: "Ожидание", uz: "Kutilmoqda" },
      resolved: { ru: "Решён", uz: "Hal qilindi" },
      closed: { ru: "Закрыт", uz: "Yopildi" },
      reopened: { ru: "Переоткрыт", uz: "Qayta ochildi" },
    };
    return names[s]?.[lang] || s;
  };

  const filtered = incidents
    .filter((i) => {
      if (signalFilter === "silent") return i.isSilent && i.status !== "resolved" && i.status !== "closed";
      if (signalFilter === "no_owner") return !i.ownerId && i.status !== "resolved" && i.status !== "closed";
      const matchSearch = !search ||
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        (i.skuId || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || i.status === statusFilter;
      const matchSev = severityFilter === "all" || i.severity === severityFilter;
      return matchSearch && matchStatus && matchSev;
    })
    .sort((a, b) => {
      const sevOrder = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
      if (sevOrder !== 0) return sevOrder;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // GAP 6: no-owner incidents (active)
  const noOwnerIncidents = incidents.filter(
    (i) => !i.ownerId && i.status !== "resolved" && i.status !== "closed"
  );
  // GAP 5: silent incidents
  const silentIncidents = incidents.filter(
    (i) => i.isSilent && i.status !== "resolved" && i.status !== "closed"
  );

  const openCreateModal = () => {
    setFormTitle(""); setFormType("other"); setFormSeverity("medium");
    setFormMp("all"); setFormSku(""); setFormOwner("");
    setFormDue(""); setFormRootCause(""); setFormActionPlan("");
    setFormReviewer(""); setFormEstimatedLoss(""); setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!formTitle.trim()) { setFormError(lang === "ru" ? "Заголовок обязателен" : "Sarlavha majburiy"); return; }
    if (!formOwner) { setFormError(lang === "ru" ? "Назначьте владельца" : "Owner tayinlang"); return; }
    if (!formDue) { setFormError(lang === "ru" ? "Укажите дедлайн" : "Muddatni belgilang"); return; }
    // GAP 4: mandatory rootCause and actionPlan
    if (!formRootCause.trim()) { setFormError(lang === "ru" ? "Укажите корневую причину" : "Sabab majburiy"); return; }
    if (!formActionPlan.trim()) { setFormError(lang === "ru" ? "Укажите план действий" : "Harakat rejasi majburiy"); return; }

    const res = await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formTitle.trim(),
        incidentType: formType,
        severity: formSeverity,
        marketplace: formMp,
        skuId: formSku || undefined,
        ownerId: formOwner,
        reviewerId: formReviewer || undefined,
        dueDate: formDue,
        rootCause: formRootCause.trim(),
        actionPlan: formActionPlan.trim(),
        estimatedLoss: formEstimatedLoss ? parseFloat(formEstimatedLoss) : undefined,
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setFormError(d.error || "Error");
      return;
    }
    setShowModal(false);
    loadData();
  };

  const openStatusChange = (inc: Incident, status: IncidentStatus) => {
    setStatusIncident(inc);
    setNewStatus(status);
    setStatusRootCause(inc.rootCause || "");
    setStatusActionPlan(inc.actionPlan || "");
    setShowStatusModal(true);
  };

  const handleStatusChange = async () => {
    if (!statusIncident) return;
    // GAP 4: validate mandatory fields when resolving
    if (newStatus === "resolved") {
      if (!statusRootCause.trim()) { alert(lang === "ru" ? "Укажите корневую причину" : "Sabab majburiy"); return; }
      if (!statusActionPlan.trim()) { alert(lang === "ru" ? "Укажите план действий" : "Harakat rejasi majburiy"); return; }
    }
    const res = await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_status",
        id: statusIncident.id,
        status: newStatus,
        rootCause: statusRootCause || undefined,
        actionPlan: statusActionPlan || undefined,
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || "Error"); return; }
    setShowStatusModal(false);
    loadData();
  };

  const handleEscalate = async (inc: Incident) => {
    await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: inc.isEscalated ? "deescalate" : "escalate",
        id: inc.id,
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    loadData();
  };

  const openReopenModal = (inc: Incident) => {
    setReopenIncident(inc);
    setReopenReason("");
    setShowReopenModal(true);
  };

  const handleReopen = async () => {
    if (!reopenIncident) return;
    const res = await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reopen",
        id: reopenIncident.id,
        reason: reopenReason,
        changedBy: session?.user?.id ?? "user-001",
      }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || "Error"); return; }
    setShowReopenModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: session?.user?.id ?? "user-001" }),
    });
    loadData();
  };

  const l = {
    title: lang === "ru" ? "Инциденты" : "Hodisalar",
    subtitle: lang === "ru"
      ? "Реестр проблем: ни одна не потеряется"
      : "Muammolar registri: hech biri yo'qolmaydi",
    newBtn: lang === "ru" ? "Новый инцидент" : "Yangi hodisa",
    save: lang === "ru" ? "Сохранить" : "Saqlash",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    apply: lang === "ru" ? "Применить" : "Qo'llash",
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

      {/* GAP 6: No-owner red signal banner */}
      {noOwnerIncidents.length > 0 && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-center gap-2">
          <span className="text-danger font-bold text-sm">
            {lang === "ru"
              ? `🔴 ${noOwnerIncidents.length} инцидент(ов) без владельца — нельзя закрыть до назначения`
              : `🔴 ${noOwnerIncidents.length} ta hodisa egasiz — tayinlanmaguncha yopib bo'lmaydi`}
          </span>
        </div>
      )}

      {/* GAP 5: Silent incident signal banner */}
      {silentIncidents.length > 0 && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-2">
          <span className="text-warning font-semibold text-sm">
            {lang === "ru"
              ? `🔇 ${silentIncidents.length} инцидент(ов) без обновления >12ч — требуют внимания`
              : `🔇 ${silentIncidents.length} ta hodisa >12 soat yangilanmadi — e'tibor talab qiladi`}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {STATUSES.map((s) => (
          <Card
            key={s}
            className={`cursor-pointer ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
          >
            <div className="p-3 text-center">
              <p className="text-xs text-text-muted">{getStatusName(s)}</p>
              <p className={`text-xl font-bold ${
                s === "reopened" ? "text-warning" :
                s === "resolved" || s === "closed" ? "text-success" : "text-text-main"
              }`}>
                {stats[s === "in_progress" ? "inProgress" : s] || 0}
              </p>
            </div>
          </Card>
        ))}
        {/* Signal counters */}
        <Card className="cursor-pointer" onClick={() => setSeverityFilter(severityFilter === "critical" ? "all" : "critical")}>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Критических" : "Kritik"}</p>
            <p className="text-xl font-bold text-danger">{stats.critical || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "🔇 Тихих" : "🔇 Jim"}</p>
            <p className="text-xl font-bold text-warning">{stats.silent || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Эскалировано" : "Eskalatsiya"}</p>
            <p className="text-xl font-bold text-danger">{stats.escalated || 0}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              placeholder={lang === "ru" ? "Поиск по инцидентам..." : "Hodisalar bo'yicha qidirish..."}
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as IncidentSeverity | "all")}
            className="px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="all">{lang === "ru" ? "Все уровни" : "Barcha darajalar"}</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{getSeverityName(s)}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === "ru" ? "Уровень" : "Daraja"}</TableHead>
              <TableHead>{lang === "ru" ? "Инцидент" : "Hodisa"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Владелец" : "Owner"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((inc) => {
                const hoursSinceCreation = (Date.now() - new Date(inc.createdAt).getTime()) / (1000 * 60 * 60);
                const slaBreached = inc.status !== "resolved" && inc.status !== "closed" && hoursSinceCreation > SLA_HOURS[inc.severity];
                const isActive = inc.status !== "resolved" && inc.status !== "closed";

                return (
                  <TableRow
                    key={inc.id}
                    className={
                      inc.severity === "critical" && isActive ? "bg-danger/5" :
                      inc.isSilent ? "bg-warning/5" :
                      slaBreached ? "bg-warning/5" : ""
                    }
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`text-sm ${getSeverityColor(inc.severity)}`}>
                          {getSeverityName(inc.severity)}
                        </span>
                        {/* GAP 9: reopened badge */}
                        {inc.reopenCount > 0 && (
                          <span className="text-xs text-warning font-medium">
                            ↩ ×{inc.reopenCount}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <button
                          className="font-medium text-sm text-primary hover:text-primary-dark text-left"
                          onClick={() => { setDetailIncident(inc); setShowDetailModal(true); }}
                        >
                          {inc.title}
                        </button>
                        {inc.skuId && <p className="text-xs text-text-muted">SKU: {inc.skuId}</p>}
                        {inc.marketplace !== "all" && <p className="text-xs text-text-muted">{inc.marketplace}</p>}
                        {/* GAP 1: escalated as badge */}
                        {inc.isEscalated && (
                          <span className="inline-block mt-1 text-xs font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                            {lang === "ru" ? "⚡ Эскалировано" : "⚡ Eskalatsiya"}
                          </span>
                        )}
                        {/* GAP 5: silent badge */}
                        {inc.isSilent && (
                          <span className="inline-block mt-1 ml-1 text-xs font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                            🔇 {lang === "ru" ? "Тихий" : "Jim"}
                          </span>
                        )}
                        <p className="text-xs text-text-muted mt-1">
                          {lang === "ru" ? "Причина:" : "Sabab:"} {inc.rootCause || "—"}
                        </p>
                        <p className="text-xs text-primary mt-0.5">
                          {lang === "ru" ? "План:" : "Reja:"} {inc.actionPlan || "—"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{getTypeName(inc.incidentType)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {inc.ownerId ? getUserName(inc.ownerId) : (
                          <span className="text-danger font-semibold">
                            {lang === "ru" ? "❗ Не назначен" : "❗ Tayinlanmagan"}
                          </span>
                        )}
                        {inc.reviewerId && (
                          <p className="text-xs text-text-muted">
                            {lang === "ru" ? "Ревьюер:" : "Tekshiruvchi:"} {getUserName(inc.reviewerId)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={inc.status}>
                        {getStatusName(inc.status)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-sm">
                      {slaBreached ? (
                        <span className="text-danger font-semibold">
                          {lang === "ru" ? "Нарушен" : "Buzildi"} ({Math.round(hoursSinceCreation)}h)
                        </span>
                      ) : isActive ? (
                        <span className="text-success text-xs">
                          {SLA_HOURS[inc.severity]}h {lang === "ru" ? "лимит" : "limit"}
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {/* Status transitions */}
                        {(VALID_TRANSITIONS[inc.status] || []).map((ts) => (
                          <button
                            key={ts}
                            onClick={() => openStatusChange(inc, ts)}
                            className="text-xs text-primary hover:text-primary-dark font-medium text-left"
                          >
                            → {getStatusName(ts)}
                          </button>
                        ))}
                        {/* GAP 1: Escalate toggle */}
                        {isActive && (
                          <button
                            onClick={() => handleEscalate(inc)}
                            className={`text-xs font-medium text-left ${inc.isEscalated ? "text-text-muted" : "text-danger hover:text-danger/80"}`}
                          >
                            {inc.isEscalated
                              ? (lang === "ru" ? "↓ Снять эскалацию" : "↓ Eskalatsiyani olish")
                              : (lang === "ru" ? "⚡ Эскалировать" : "⚡ Eskalatsiya")}
                          </button>
                        )}
                        {/* GAP 9: Reopen button */}
                        {(inc.status === "resolved" || inc.status === "closed") && (
                          <button
                            onClick={() => openReopenModal(inc)}
                            className="text-xs text-warning hover:text-warning/80 font-medium text-left"
                          >
                            ↩ {lang === "ru" ? "Переоткрыть" : "Qayta ochish"}
                          </button>
                        )}
                        {isActive && inc.status !== "reopened" && (
                          <button
                            onClick={() => handleDelete(inc.id)}
                            className="text-xs text-danger hover:text-danger/80 font-medium text-left mt-1"
                          >
                            {lang === "ru" ? "Удалить" : "O'chirish"}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-text-muted">
                  {lang === "ru" ? "Инцидентов нет" : "Hodisalar yo'q"}
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
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Заголовок *" : "Sarlavha *"}</label>
                  <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder={lang === "ru" ? "Опишите проблему" : "Muammoni tasvirlang"} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Тип" : "Turi"}</label>
                    <select value={formType} onChange={(e) => setFormType(e.target.value as IncidentType)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{getTypeName(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Уровень *" : "Daraja *"}</label>
                    <select value={formSeverity} onChange={(e) => setFormSeverity(e.target.value as IncidentSeverity)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {SEVERITIES.map((s) => <option key={s} value={s}>{getSeverityName(s)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Владелец *" : "Owner *"}</label>
                    <select value={formOwner} onChange={(e) => setFormOwner(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      <option value="">-- {lang === "ru" ? "выберите" : "tanlang"} --</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  {/* GAP 3: reviewer */}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Ревьюер" : "Tekshiruvchi"}</label>
                    <select value={formReviewer} onChange={(e) => setFormReviewer(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      <option value="">-- {lang === "ru" ? "необязательно" : "ixtiyoriy"} --</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Дедлайн *" : "Muddat *"}</label>
                    <input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Ущерб (₽)" : "Zarar (₽)"}</label>
                    <input type="number" value={formEstimatedLoss} onChange={(e) => setFormEstimatedLoss(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Площадка" : "Platforma"}</label>
                    <select value={formMp} onChange={(e) => setFormMp(e.target.value as MarketplaceId | "all")}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      <option value="all">{lang === "ru" ? "Все" : "Barchasi"}</option>
                      <option value="WB">Wildberries</option>
                      <option value="Ozon">Ozon</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">SKU</label>
                    <input value={formSku} onChange={(e) => setFormSku(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder={lang === "ru" ? "Необязательно" : "Ixtiyoriy"} />
                  </div>
                </div>
                {/* GAP 4: mandatory fields */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Корневая причина *" : "Asosiy sabab *"}
                    <span className="text-danger ml-1">{lang === "ru" ? "(обязательно)" : "(majburiy)"}</span>
                  </label>
                  <textarea value={formRootCause} onChange={(e) => setFormRootCause(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                    placeholder={lang === "ru" ? "Почему возникла проблема?" : "Muammo nima sababdan chiqdi?"} />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "План действий *" : "Harakat rejasi *"}
                    <span className="text-danger ml-1">{lang === "ru" ? "(обязательно)" : "(majburiy)"}</span>
                  </label>
                  <textarea value={formActionPlan} onChange={(e) => setFormActionPlan(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                    placeholder={lang === "ru" ? "Как планируете решить?" : "Qanday yechish rejalashtirilgan?"} />
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

      {/* ── Status Change Modal ───────────────────────────────────────────── */}
      {showStatusModal && statusIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowStatusModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {getStatusName(statusIncident.status)} → {getStatusName(newStatus)}
              </h2>
              <p className="text-sm text-text-muted mb-4">{statusIncident.title}</p>
              <div className="mb-4">
                <label className="text-xs text-text-muted mb-1 block">
                  {lang === "ru" ? "Корневая причина" : "Asosiy sabab"}
                  {newStatus === "resolved" && <span className="text-danger ml-1">*</span>}
                </label>
                <textarea value={statusRootCause} onChange={(e) => setStatusRootCause(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-text-muted mb-1 block">
                  {lang === "ru" ? "План действий" : "Harakat rejasi"}
                  {newStatus === "resolved" && <span className="text-danger ml-1">*</span>}
                </label>
                <textarea value={statusActionPlan} onChange={(e) => setStatusActionPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowStatusModal(false)}>{l.cancel}</Button>
                <Button variant="primary" onClick={handleStatusChange}>{l.apply}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reopen Modal (GAP 9) ─────────────────────────────────────────── */}
      {showReopenModal && reopenIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReopenModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {lang === "ru" ? "Переоткрыть инцидент" : "Hodisani qayta ochish"}
              </h2>
              <p className="text-sm text-text-muted mb-1">{reopenIncident.title}</p>
              {reopenIncident.reopenCount > 0 && (
                <p className="text-xs text-warning mb-3">
                  {lang === "ru"
                    ? `Уже переоткрывался ${reopenIncident.reopenCount} раз`
                    : `Avval ${reopenIncident.reopenCount} marta qayta ochilgan`}
                </p>
              )}
              <div className="mb-4">
                <label className="text-xs text-text-muted mb-1 block">
                  {lang === "ru" ? "Причина повторного открытия" : "Qayta ochish sababi"}
                </label>
                <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                  placeholder={lang === "ru" ? "Почему проблема не решена?" : "Muammo nima uchun hal bo'lmadi?"} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowReopenModal(false)}>{l.cancel}</Button>
                <Button variant="primary" onClick={handleReopen}>
                  {lang === "ru" ? "Переоткрыть" : "Qayta ochish"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Detail Modal (GAP 8: linked tasks + full info) ───────────────── */}
      {showDetailModal && detailIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold text-text-main">{detailIncident.title}</h2>
                <StatusPill status={detailIncident.status}>{getStatusName(detailIncident.status)}</StatusPill>
              </div>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-text-muted">{lang === "ru" ? "Тип" : "Turi"}</p>
                    <p className="font-medium">{getTypeName(detailIncident.incidentType)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">{lang === "ru" ? "Уровень" : "Daraja"}</p>
                    <p className={`font-medium ${getSeverityColor(detailIncident.severity)}`}>{getSeverityName(detailIncident.severity)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">{lang === "ru" ? "Владелец" : "Owner"}</p>
                    <p className="font-medium">{getUserName(detailIncident.ownerId)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">{lang === "ru" ? "Создан" : "Yaratdi"}</p>
                    <p className="font-medium">{getUserName(detailIncident.createdBy)}</p>
                  </div>
                  {detailIncident.reviewerId && (
                    <div>
                      <p className="text-xs text-text-muted">{lang === "ru" ? "Ревьюер" : "Tekshiruvchi"}</p>
                      <p className="font-medium">{getUserName(detailIncident.reviewerId)}</p>
                    </div>
                  )}
                  {detailIncident.estimatedLoss != null && (
                    <div>
                      <p className="text-xs text-text-muted">{lang === "ru" ? "Ущерб (₽)" : "Zarar (₽)"}</p>
                      <p className="font-medium text-danger">{detailIncident.estimatedLoss.toLocaleString()}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-text-muted">{lang === "ru" ? "Площадка" : "Platforma"}</p>
                    <p className="font-medium">{detailIncident.marketplace}</p>
                  </div>
                  {detailIncident.skuId && (
                    <div>
                      <p className="text-xs text-text-muted">SKU</p>
                      <p className="font-medium">{detailIncident.skuId}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Корневая причина" : "Asosiy sabab"}</p>
                  <p className="bg-surface-alt rounded p-2 text-sm">{detailIncident.rootCause || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "План действий" : "Harakat rejasi"}</p>
                  <p className="bg-surface-alt rounded p-2 text-sm text-primary">{detailIncident.actionPlan || "—"}</p>
                </div>
                {/* GAP 9: reopen history */}
                {detailIncident.reopenCount > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">
                      {lang === "ru" ? `↩ Переоткрыт ${detailIncident.reopenCount} раз` : `↩ ${detailIncident.reopenCount} marta qayta ochilgan`}
                    </p>
                    {detailIncident.reopenReasons.length > 0 && (
                      <ul className="text-xs text-warning space-y-0.5">
                        {detailIncident.reopenReasons.map((r, i) => (
                          <li key={i} className="bg-warning/5 rounded px-2 py-1">#{i + 1}: {r || "—"}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {/* GAP 8: linked tasks */}
                {(detailIncident.linkedTaskIds || []).length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">
                      {lang === "ru" ? "Связанные задачи" : "Bog'liq vazifalar"}
                    </p>
                    <ul className="space-y-1">
                      {detailIncident.linkedTaskIds!.map((tid) => (
                        <li key={tid} className="text-xs bg-info/5 border border-info/20 rounded px-2 py-1 font-mono">
                          {tid}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-xs text-text-muted">
                  {lang === "ru" ? "Создан:" : "Yaratildi:"} {new Date(detailIncident.createdAt).toLocaleString()}
                  {detailIncident.resolvedAt && (
                    <span className="ml-3">{lang === "ru" ? "Решён:" : "Hal bo'ldi:"} {new Date(detailIncident.resolvedAt).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button variant="ghost" onClick={() => setShowDetailModal(false)}>{l.cancel}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
