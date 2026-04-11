"use client";

import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type {
  Appeal,
  AppealType,
  AppealStatus,
  AppealPriority,
  AppealSentiment,
  SystemUser,
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
  Badge,
} from "@/components/ui";

const APPEAL_TYPES: AppealType[] = ["savol", "sharh", "shikoyat", "buyurtma"];
const PRIORITIES: AppealPriority[] = ["critical", "high", "medium", "low"];
const SENTIMENTS: AppealSentiment[] = ["positive", "neutral", "negative"];

const VALID_TRANSITIONS: Record<AppealStatus, AppealStatus[]> = {
  yangi: ["jarayonda", "kutyapti"],
  jarayonda: ["javob_berilgan", "kutyapti"],
  kutyapti: ["jarayonda"],
  javob_berilgan: ["yopilgan", "yangi"],
  yopilgan: ["yangi"],
};

const TYPE_ICONS: Record<AppealType, string> = {
  savol: "?",
  sharh: "\u2605",
  shikoyat: "!",
  buyurtma: "\u25A0",
};

export default function AppealsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AppealType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AppealStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<AppealPriority | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 15;

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formCustomer, setFormCustomer] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState<AppealType>("savol");
  const [selectedMp, setSelectedMp] = useState("all");
  const [formMp, setFormMp] = useState<MarketplaceId>("Ozon");
  const [formPriority, setFormPriority] = useState<AppealPriority>("medium");
  const [formSentiment, setFormSentiment] = useState<AppealSentiment>("neutral");
  const [formOwner, setFormOwner] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [formSkuId, setFormSkuId] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formError, setFormError] = useState("");

  // Detail/Reply modal
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyOutcome, setReplyOutcome] = useState<"resolved" | "pending" | "reopened">("pending");

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusAppeal, setStatusAppeal] = useState<Appeal | null>(null);
  const [newStatus, setNewStatus] = useState<AppealStatus>("jarayonda");

  useEffect(() => {
    setLang(storage.getLang());
    const mp = storage.getMarketplace();
    setSelectedMp(mp || "all");
    if (mp === "wb") setFormMp("WB");
    else setFormMp("Ozon");
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/founder/appeals", { cache: "no-store" });
      const data = await res.json();
      setAppeals(data.appeals || []);
      setUsers(data.users || []);
      setStats(data.stats || {});
    } catch (e) {
      console.error("Failed to load appeals:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/founder/appeals/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const msg = lang === "ru"
          ? `Импортировано: ${data.imported}, пропущено: ${data.skipped}`
          : `Import: ${data.imported}, o'tkazildi: ${data.skipped}`;
        setSyncResult(msg);
        loadData();
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } catch {
      setSyncResult("Network error");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const t = (key: string) => getTranslation(lang, key);
  const getUserName = (id: string) => users.find((u) => u.id === id)?.name || id || "—";

  // Marketplace filter from global Topbar selector
  const mpFiltered = selectedMp && selectedMp !== "all"
    ? appeals.filter((a) => a.marketplace.toLowerCase() === selectedMp.toLowerCase())
    : appeals;

  // Local stats from marketplace-filtered data
  const localStats = {
    total: mpFiltered.length,
    yangi: mpFiltered.filter((a) => a.status === "yangi").length,
    jarayonda: mpFiltered.filter((a) => a.status === "jarayonda").length,
    slaBreached: mpFiltered.filter((a) => a.status !== "yopilgan" && a.slaBreached).length,
    negative: mpFiltered.filter((a) => a.status !== "yopilgan" && a.sentiment === "negative").length,
  };

  // Filtering
  const filtered = mpFiltered.filter((a) => {
    if (typeFilter !== "all" && a.appealType !== typeFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.customerName.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.orderId || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sort: slaBreached first, then yangi, then by createdAt desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.slaBreached && !b.slaBreached) return -1;
    if (!a.slaBreached && b.slaBreached) return 1;
    if (a.status === "yangi" && b.status !== "yangi") return -1;
    if (a.status !== "yangi" && b.status === "yangi") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageAppeals = sorted.slice((currentPage - 1) * perPage, currentPage * perPage);

  const pageNumbers = useMemo(() => {
    const visible = 5;
    const start = Math.max(1, Math.min(currentPage - 2, Math.max(1, totalPages - visible + 1)));
    const end = Math.min(totalPages, start + visible - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage((prev) => {
      if (sorted.length === 0) return 1;
      return Math.min(prev, totalPages);
    });
  }, [sorted.length, totalPages]);

  // Create appeal
  const handleCreate = async () => {
    setFormError("");
    if (!formCustomer || !formMessage || !formOwner) {
      setFormError(lang === "ru" ? "Заполните все обязательные поля" : "Barcha majburiy maydonlarni to'ldiring");
      return;
    }
    try {
      const res = await fetch("/api/founder/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: formCustomer,
          message: formMessage,
          appealType: formType,
          marketplace: formMp,
          priority: formPriority,
          sentiment: formSentiment,
          ownerId: formOwner,
          orderId: formOrderId || undefined,
          skuId: formSkuId || undefined,
          tags: formTags ? formTags.split(",").map((t) => t.trim()) : [],
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        resetCreateForm();
        loadData();
      } else {
        const err = await res.json();
        setFormError(err.error || "Error");
      }
    } catch {
      setFormError("Network error");
    }
  };

  const resetCreateForm = () => {
    setFormCustomer("");
    setFormMessage("");
    setFormType("savol");
    setFormMp("Ozon");
    setFormPriority("medium");
    setFormSentiment("neutral");
    setFormOwner("");
    setFormOrderId("");
    setFormSkuId("");
    setFormTags("");
    setFormError("");
  };

  // Reply
  const handleReply = async () => {
    if (!selectedAppeal || !replyText.trim()) return;
    try {
      const res = await fetch("/api/founder/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          id: selectedAppeal.id,
          text: replyText,
          outcome: replyOutcome,
          repliedBy: users[0]?.id || "system",
        }),
      });
      if (res.ok) {
        setReplyText("");
        setSelectedAppeal(null);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Status change
  const handleStatusChange = async () => {
    if (!statusAppeal) return;
    try {
      const res = await fetch("/api/founder/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          id: statusAppeal.id,
          status: newStatus,
        }),
      });
      if (res.ok) {
        setShowStatusModal(false);
        setStatusAppeal(null);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Escalate
  const handleEscalate = async (appeal: Appeal) => {
    try {
      await fetch("/api/founder/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "escalate",
          id: appeal.id,
          escalatedTo: "founder",
        }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/founder/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // SLA display
  const getSlaDisplay = (appeal: Appeal) => {
    if (appeal.status === "yopilgan" || appeal.status === "javob_berilgan") {
      return { text: t("appeals_sla_ok"), breached: false };
    }
    if (appeal.slaBreached) {
      const hours = Math.round((Date.now() - new Date(appeal.slaDeadline).getTime()) / 3600000);
      return { text: `${t("appeals_sla_breached")} (${hours}h)`, breached: true };
    }
    const remaining = Math.round((new Date(appeal.slaDeadline).getTime() - Date.now()) / 3600000);
    return { text: `${t("appeals_sla_remaining")} ${remaining}h`, breached: false };
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openStatusModal = (appeal: Appeal) => {
    const allowed = VALID_TRANSITIONS[appeal.status] || [];
    if (allowed.length === 0) return;
    setStatusAppeal(appeal);
    setNewStatus(allowed[0]);
    setShowStatusModal(true);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("appeals_title")}</h1>
          <p className="page-subtitle">{t("appeals_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className="text-sm text-text-muted">{syncResult}</span>
          )}
          <Button variant="ghost" onClick={handleSync} disabled={syncing}>
            {syncing
              ? (lang === "ru" ? "Синхронизация..." : "Sinxronlanmoqda...")
              : (lang === "ru" ? "Синхронизировать отзывы" : "Sharhlarni sinxronlash")}
          </Button>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            {t("appeals_new")}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">{t("appeals_status_yangi")}</p>
            <p className="text-2xl font-bold text-info">{localStats.yangi}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">{t("appeals_status_jarayonda")}</p>
            <p className="text-2xl font-bold text-warning">{localStats.jarayonda}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Просрочено" : "Muddati o'tgan"}</p>
            <p className="text-2xl font-bold text-danger">{localStats.slaBreached}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">{t("appeals_sentiment_negative")}</p>
            <p className="text-2xl font-bold text-danger">{localStats.negative}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">{t("appeals_total")}</p>
            <p className="text-2xl font-bold text-text-main">{localStats.total}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[250px]">
              <SearchInput
                placeholder={t("appeals_search")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{t("appeals_all_types")}</option>
              {APPEAL_TYPES.map((type) => (
                <option key={type} value={type}>{t(`appeals_type_${type}`)}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{t("appeals_all_statuses")}</option>
              <option value="yangi">{t("appeals_status_yangi")}</option>
              <option value="jarayonda">{t("appeals_status_jarayonda")}</option>
              <option value="kutyapti">{t("appeals_status_kutyapti")}</option>
              <option value="javob_berilgan">{t("appeals_status_javob_berilgan")}</option>
              <option value="yopilgan">{t("appeals_status_yopilgan")}</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{t("appeals_all_priorities")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`appeals_priority_${p}`)}</option>
              ))}
            </select>
            {(search || typeFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => {
                setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setPriorityFilter("all"); setCurrentPage(1);
              }}>
                {lang === "ru" ? "Сбросить" : "Tozalash"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results summary */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {lang === "ru"
            ? `${sorted.length} обращений`
            : `${sorted.length} ta murojaat`}
        </p>
      </div>

      {/* Table */}
      <Card>
        {sorted.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-text-muted text-lg mb-2">{t("appeals_empty")}</p>
            <p className="text-text-muted text-sm">{t("appeals_empty_hint")}</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
                  <TableHead>{t("appeals_customer")}</TableHead>
                  <TableHead>{t("appeals_message")}</TableHead>
                  <TableHead>{t("appeals_owner")}</TableHead>
                  <TableHead>{lang === "ru" ? "Срок" : "Muddat"}</TableHead>
                  <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
                  <TableHead>{t("appeals_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageAppeals.map((appeal) => {
                  const sla = getSlaDisplay(appeal);
                  return (
                    <TableRow
                      key={appeal.id}
                      className={appeal.slaBreached ? "bg-danger-light/20" : appeal.status === "yangi" ? "bg-info-light/20" : ""}
                    >
                      <TableCell className="font-mono text-xs">{appeal.id.slice(-8)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold">{TYPE_ICONS[appeal.appealType]}</span>
                          <span className="text-xs text-text-muted">{t(`appeals_type_${appeal.appealType}`)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{appeal.customerName}</div>
                          {appeal.orderId && <div className="text-xs text-text-muted">{appeal.orderId}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="text-sm truncate">{appeal.message}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {appeal.sentiment === "negative" && (
                              <Badge variant="danger">{t("appeals_sentiment_negative")}</Badge>
                            )}
                            {appeal.escalatedTo && (
                              <Badge variant="danger">{t("appeals_escalate")}</Badge>
                            )}
                            {appeal.tags?.map((tag, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{getUserName(appeal.ownerId)}</TableCell>
                      <TableCell>
                        {sla.breached ? (
                          <StatusPill status="sla_breached">{sla.text}</StatusPill>
                        ) : (
                          <span className="text-xs text-success">{sla.text}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={appeal.status}>
                          {t(`appeals_status_${appeal.status}`)}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => { setSelectedAppeal(appeal); setReplyText(""); }}
                            className="text-primary hover:text-primary-dark text-xs font-medium"
                          >
                            {t("appeals_reply")}
                          </button>
                          {VALID_TRANSITIONS[appeal.status]?.length > 0 && (
                            <button
                              onClick={() => openStatusModal(appeal)}
                              className="text-warning hover:text-warning-dark text-xs font-medium"
                            >
                              {lang === "ru" ? "Статус" : "Status"}
                            </button>
                          )}
                          {(appeal.priority === "critical" || appeal.priority === "high") && !appeal.escalatedTo && (
                            <button
                              onClick={() => handleEscalate(appeal)}
                              className="text-danger hover:text-danger-dark text-xs font-medium"
                            >
                              {t("appeals_escalate")}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    {lang === "ru" ? "Страница" : "Sahifa"} {currentPage} / {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      {lang === "ru" ? "Назад" : "Orqaga"}
                    </Button>
                    <div className="flex items-center gap-1">
                      {pageNumbers.map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded text-sm ${
                            page === currentPage
                              ? "bg-primary text-white font-medium"
                              : "hover:bg-background text-text-main"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {lang === "ru" ? "Далее" : "Oldinga"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">{t("appeals_new")}</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-text-muted hover:text-text-main">X</button>
              </div>

              {formError && <div className="bg-danger-light text-danger p-3 rounded-lg mb-4 text-sm">{formError}</div>}

              <div className="grid grid-cols-2 gap-4">
                {/* Customer */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{t("appeals_customer")} *</label>
                  <input
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={lang === "ru" ? "Имя клиента" : "Mijoz ismi"}
                  />
                </div>

                {/* Marketplace */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{t("appeals_marketplace")} *</label>
                  <select
                    value={formMp}
                    onChange={(e) => setFormMp(e.target.value as MarketplaceId)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Ozon">Ozon</option>
                    <option value="WB">Wildberries</option>
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{lang === "ru" ? "Тип" : "Turi"} *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AppealType)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {APPEAL_TYPES.map((type) => (
                      <option key={type} value={type}>{t(`appeals_type_${type}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{lang === "ru" ? "Приоритет" : "Ustuvorlik"} *</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as AppealPriority)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{t(`appeals_priority_${p}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Sentiment */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{lang === "ru" ? "Тон" : "Ohang"}</label>
                  <select
                    value={formSentiment}
                    onChange={(e) => setFormSentiment(e.target.value as AppealSentiment)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {SENTIMENTS.map((s) => (
                      <option key={s} value={s}>{t(`appeals_sentiment_${s}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Owner */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{t("appeals_owner")} *</label>
                  <select
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">{lang === "ru" ? "Выберите..." : "Tanlang..."}</option>
                    {users.filter((u) => u.active).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                {/* Order ID */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">{lang === "ru" ? "ID заказа" : "Buyurtma ID"}</label>
                  <input
                    value={formOrderId}
                    onChange={(e) => setFormOrderId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">SKU</label>
                  <input
                    value={formSkuId}
                    onChange={(e) => setFormSkuId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Tags */}
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1">{lang === "ru" ? "Теги (через запятую)" : "Teglar (vergul bilan)"}</label>
                  <input
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={lang === "ru" ? "Срочно, VIP" : "Shoshilinch, VIP"}
                  />
                </div>

                {/* Message */}
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1">{t("appeals_message")} *</label>
                  <textarea
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={lang === "ru" ? "Текст обращения..." : "Murojaat matni..."}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                  {lang === "ru" ? "Отмена" : "Bekor qilish"}
                </Button>
                <Button variant="primary" onClick={handleCreate}>
                  {lang === "ru" ? "Создать" : "Yaratish"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Detail / Reply Modal */}
      {selectedAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedAppeal(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {TYPE_ICONS[selectedAppeal.appealType]} {t(`appeals_type_${selectedAppeal.appealType}`)}
                  </h2>
                  <p className="text-sm text-text-muted">{selectedAppeal.id} | {formatDate(selectedAppeal.createdAt)}</p>
                </div>
                <button onClick={() => setSelectedAppeal(null)} className="text-text-muted hover:text-text-main">X</button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("appeals_customer")}</p>
                  <p className="font-semibold">{selectedAppeal.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("appeals_marketplace")}</p>
                  <p>{selectedAppeal.marketplace}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("appeals_owner")}</p>
                  <p>{getUserName(selectedAppeal.ownerId)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{lang === "ru" ? "Статус" : "Status"}</p>
                  <StatusPill status={selectedAppeal.status}>{t(`appeals_status_${selectedAppeal.status}`)}</StatusPill>
                </div>
                {selectedAppeal.orderId && (
                  <div>
                    <p className="text-xs text-text-muted mb-0.5">{lang === "ru" ? "Заказ" : "Buyurtma"}</p>
                    <p className="font-mono text-primary">{selectedAppeal.orderId}</p>
                  </div>
                )}
                {selectedAppeal.skuId && (
                  <div>
                    <p className="text-xs text-text-muted mb-0.5">SKU</p>
                    <p className="font-mono">{selectedAppeal.skuId}</p>
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="mb-4">
                <p className="text-xs text-text-muted mb-1">{t("appeals_message")}</p>
                <div className="bg-background p-4 rounded-lg">
                  <p className="text-sm">{selectedAppeal.message}</p>
                </div>
              </div>

              {/* Reply history */}
              {selectedAppeal.replies && selectedAppeal.replies.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-text-muted mb-2">{t("appeals_reply_history")}</p>
                  <div className="space-y-2">
                    {selectedAppeal.replies.map((r) => (
                      <div key={r.id} className="bg-primary-soft/10 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{getUserName(r.repliedBy)}</span>
                          <span className="text-xs text-text-muted">{formatDate(r.repliedAt)}</span>
                        </div>
                        <p className="text-sm">{r.text}</p>
                        {r.outcome && (
                          <span className="text-xs text-text-muted mt-1 inline-block">
                            {t(`appeals_outcome_${r.outcome}`)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New reply */}
              {selectedAppeal.status !== "yopilgan" && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-text-muted mb-2">{t("appeals_reply")}</p>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary mb-2"
                    placeholder={t("appeals_reply_placeholder")}
                  />
                  <div className="flex items-center gap-4">
                    <select
                      value={replyOutcome}
                      onChange={(e) => setReplyOutcome(e.target.value as any)}
                      className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="pending">{t("appeals_outcome_pending")}</option>
                      <option value="resolved">{t("appeals_outcome_resolved")}</option>
                      <option value="reopened">{t("appeals_outcome_reopened")}</option>
                    </select>
                    <div className="flex gap-2 ml-auto">
                      <Button variant="ghost" onClick={() => setSelectedAppeal(null)}>
                        {lang === "ru" ? "Отмена" : "Bekor qilish"}
                      </Button>
                      <Button variant="primary" onClick={handleReply} disabled={!replyText.trim()}>
                        {t("appeals_send_reply")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete */}
              <div className="border-t border-border pt-4 mt-4 flex justify-end">
                <Button variant="danger" size="sm" onClick={() => { handleDelete(selectedAppeal.id); setSelectedAppeal(null); }}>
                  {lang === "ru" ? "Удалить" : "O'chirish"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Status Change Modal */}
      {showStatusModal && statusAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowStatusModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold mb-4">{lang === "ru" ? "Изменить статус" : "Statusni o'zgartirish"}</h3>
              <p className="text-sm text-text-muted mb-2">
                {statusAppeal.customerName} — {t(`appeals_type_${statusAppeal.appealType}`)}
              </p>
              <p className="text-sm mb-4">
                {t(`appeals_status_${statusAppeal.status}`)} →
              </p>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AppealStatus)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              >
                {(VALID_TRANSITIONS[statusAppeal.status] || []).map((s) => (
                  <option key={s} value={s}>{t(`appeals_status_${s}`)}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowStatusModal(false)}>
                  {lang === "ru" ? "Отмена" : "Bekor qilish"}
                </Button>
                <Button variant="primary" onClick={handleStatusChange}>
                  {lang === "ru" ? "Сохранить" : "Saqlash"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
