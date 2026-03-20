"use client";

import { useState, useEffect } from "react";
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

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "escalated"],
  in_progress: ["resolved", "escalated"],
  escalated: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
};

export default function IncidentsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "all">("all");

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
  const [formError, setFormError] = useState("");

  // Status change
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusIncident, setStatusIncident] = useState<Incident | null>(null);
  const [newStatus, setNewStatus] = useState<IncidentStatus>("in_progress");
  const [statusRootCause, setStatusRootCause] = useState("");
  const [statusActionPlan, setStatusActionPlan] = useState("");

  useEffect(() => {
    setLang(storage.getLang());
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
      resolved: { ru: "Решён", uz: "Hal qilindi" },
      escalated: { ru: "Эскалирован", uz: "Eskalatsiya" },
      closed: { ru: "Закрыт", uz: "Yopildi" },
    };
    return names[s]?.[lang] || s;
  };

  const filtered = incidents
    .filter((i) => {
      const matchSearch = !search ||
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        (i.skuId || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || i.status === statusFilter;
      const matchSev = severityFilter === "all" || i.severity === severityFilter;
      return matchSearch && matchStatus && matchSev;
    })
    .sort((a, b) => {
      // Critical/escalated first
      const sevOrder = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
      if (sevOrder !== 0) return sevOrder;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const openCreateModal = () => {
    setFormTitle(""); setFormType("other"); setFormSeverity("medium");
    setFormMp("all"); setFormSku(""); setFormOwner("");
    setFormDue(""); setFormRootCause(""); setFormActionPlan(""); setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!formTitle.trim()) { setFormError(lang === "ru" ? "Заголовок обязателен" : "Sarlavha majburiy"); return; }
    if (!formOwner) { setFormError(lang === "ru" ? "Назначьте владельца" : "Owner tayinlang"); return; }
    if (!formDue) { setFormError(lang === "ru" ? "Укажите дедлайн" : "Muddatni belgilang"); return; }

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
        dueDate: formDue,
        rootCause: formRootCause || undefined,
        actionPlan: formActionPlan || undefined,
        changedBy: "user-001",
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
    const res = await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_status",
        id: statusIncident.id,
        status: newStatus,
        rootCause: statusRootCause || undefined,
        actionPlan: statusActionPlan || undefined,
        changedBy: "user-001",
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Error");
      return;
    }
    setShowStatusModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/founder/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: "user-001" }),
    });
    loadData();
  };

  const l = {
    title: lang === "ru" ? "Инциденты" : "Hodisalar",
    subtitle: lang === "ru" ? "Реестр проблем: ни одна не потеряется" : "Muammolar registri: hech biri yo'qolmaydi",
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

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {(["open", "in_progress", "escalated", "resolved", "closed"] as IncidentStatus[]).map((s) => (
          <Card
            key={s}
            className={`cursor-pointer ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
          >
            <div className="p-3 text-center">
              <p className="text-xs text-text-muted">{getStatusName(s)}</p>
              <p className={`text-xl font-bold ${
                s === "escalated" ? "text-danger" : s === "resolved" || s === "closed" ? "text-success" : "text-text-main"
              }`}>
                {stats[s === "in_progress" ? "inProgress" : s] || 0}
              </p>
            </div>
          </Card>
        ))}
        <Card className="cursor-pointer" onClick={() => setSeverityFilter(severityFilter === "critical" ? "all" : "critical")}>
          <div className="p-3 text-center">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Критических" : "Kritik"}</p>
            <p className="text-xl font-bold text-danger">{stats.critical || 0}</p>
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
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{getSeverityName(s)}</option>
            ))}
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
              <TableHead>{lang === "ru" ? "SLA" : "SLA"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((inc) => {
                const slaHours: Record<IncidentSeverity, number> = { low: 24, medium: 12, high: 4, critical: 1 };
                const hoursSinceCreation = (Date.now() - new Date(inc.createdAt).getTime()) / (1000 * 60 * 60);
                const slaBreached = inc.status !== "resolved" && inc.status !== "closed" && hoursSinceCreation > slaHours[inc.severity];

                return (
                  <TableRow key={inc.id} className={
                    inc.severity === "critical" && inc.status !== "resolved" && inc.status !== "closed"
                      ? "bg-danger/5"
                      : slaBreached ? "bg-warning/5" : ""
                  }>
                    <TableCell>
                      <span className={`text-sm ${getSeverityColor(inc.severity)}`}>
                        {getSeverityName(inc.severity)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{inc.title}</p>
                        {inc.skuId && <p className="text-xs text-text-muted">SKU: {inc.skuId}</p>}
                        {inc.marketplace !== "all" && <p className="text-xs text-text-muted">{inc.marketplace}</p>}
                        {inc.rootCause && (
                          <p className="text-xs text-text-muted mt-1">
                            {lang === "ru" ? "Причина:" : "Sabab:"} {inc.rootCause}
                          </p>
                        )}
                        {inc.actionPlan && (
                          <p className="text-xs text-primary mt-1">
                            {lang === "ru" ? "План:" : "Reja:"} {inc.actionPlan}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{getTypeName(inc.incidentType)}</TableCell>
                    <TableCell className="text-sm">{getUserName(inc.ownerId)}</TableCell>
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
                      ) : (
                        <span className="text-success">
                          {slaHours[inc.severity]}h {lang === "ru" ? "лимит" : "limit"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(VALID_TRANSITIONS[inc.status] || []).map((ts) => (
                          <button
                            key={ts}
                            onClick={() => openStatusChange(inc, ts)}
                            className="text-xs text-primary hover:text-primary-dark font-medium text-left"
                          >
                            → {getStatusName(ts)}
                          </button>
                        ))}
                        {inc.status !== "closed" && inc.status !== "resolved" && (
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

      {/* Create Modal */}
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
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Дедлайн *" : "Muddat *"}</label>
                    <input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
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
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Корневая причина" : "Asosiy sabab"}</label>
                  <textarea value={formRootCause} onChange={(e) => setFormRootCause(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "План действий" : "Harakat rejasi"}</label>
                  <textarea value={formActionPlan} onChange={(e) => setFormActionPlan(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
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

      {/* Status Change Modal */}
      {showStatusModal && statusIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowStatusModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {getStatusName(statusIncident.status)} → {getStatusName(newStatus)}
              </h2>
              <p className="text-sm text-text-muted mb-4">{statusIncident.title}</p>

              {(newStatus === "resolved" || newStatus === "in_progress") && (
                <>
                  <div className="mb-4">
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Корневая причина" : "Asosiy sabab"}
                    </label>
                    <textarea value={statusRootCause} onChange={(e) => setStatusRootCause(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "План действий" : "Harakat rejasi"}
                    </label>
                    <textarea value={statusActionPlan} onChange={(e) => setStatusActionPlan(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]" />
                  </div>
                </>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowStatusModal(false)}>{l.cancel}</Button>
                <Button variant="primary" onClick={handleStatusChange}>{l.apply}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
