"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import type {
  Approval,
  SystemUser,
  ApprovalEntityType,
  ApprovalType,
  ApprovalStatus,
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

export default function ApprovalsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formEntityType, setFormEntityType] = useState<ApprovalEntityType>("other");
  const [formApprovalType, setFormApprovalType] = useState<ApprovalType>("general");
  const [formEntityId, setFormEntityId] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formRequestedBy, setFormRequestedBy] = useState("");
  const [formError, setFormError] = useState("");

  // Decision modal
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionApproval, setDecisionApproval] = useState<Approval | null>(null);
  const [decisionComment, setDecisionComment] = useState("");

  useEffect(() => {
    setLang(storage.getLang());
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
      price_below_min: { ru: "Цена ниже минимальной маржи", uz: "Narx minimal marjadan past" },
      promo_loss_risk: { ru: "Акция с риском убытка", uz: "Zarar xavfli aksiya" },
      budget_over_limit: { ru: "Бюджет выше лимита", uz: "Byudjet limitdan yuqori" },
      critical_stock_scale: { ru: "Масштабирование при критическом стоке", uz: "Kritik zaxirada kengaytirish" },
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

  const filtered = approvals.filter((a) => {
    const matchSearch = !search ||
      a.reason.toLowerCase().includes(search.toLowerCase()) ||
      a.entityId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openCreateModal = () => {
    setFormEntityType("other"); setFormApprovalType("general");
    setFormEntityId(""); setFormReason(""); setFormRequestedBy(""); setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!formReason.trim()) { setFormError(lang === "ru" ? "Укажите причину" : "Sababni kiriting"); return; }
    if (!formRequestedBy) { setFormError(lang === "ru" ? "Укажите инициатора" : "Tashabbuskorni tanlang"); return; }

    const res = await fetch("/api/founder/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: formEntityType,
        approvalType: formApprovalType,
        entityId: formEntityId || "",
        reason: formReason.trim(),
        requestedBy: formRequestedBy,
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

  const openDecisionModal = (approval: Approval) => {
    setDecisionApproval(approval);
    setDecisionComment("");
    setShowDecisionModal(true);
  };

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!decisionApproval) return;
    const res = await fetch("/api/founder/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "decide",
        id: decisionApproval.id,
        decision,
        decisionComment: decisionComment || undefined,
        changedBy: "user-001",
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Error");
      return;
    }
    setShowDecisionModal(false);
    loadData();
  };

  const l = {
    title: lang === "ru" ? "Одобрения" : "Tasdiqlar",
    subtitle: lang === "ru" ? "Очередь решений Founder: цены, бюджеты, ответственные" : "Founder qaror navbati: narxlar, byudjetlar, javobgarlar",
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
              }`}>
                {stats[s] || 0}
              </p>
            </div>
          </Card>
        ))}
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
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Причина запроса" : "So'rov sababi"}</TableHead>
              <TableHead>{lang === "ru" ? "Инициатор" : "Tashabbuskor"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
              <TableHead>{lang === "ru" ? "Дата" : "Sana"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((appr) => (
                <TableRow key={appr.id} className={appr.status === "pending" ? "bg-warning/5" : ""}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{getEntityTypeName(appr.entityType)}</p>
                      <p className="text-xs text-text-muted">{getApprovalTypeName(appr.approvalType)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{appr.reason}</p>
                      {appr.entityId && <p className="text-xs text-text-muted">ID: {appr.entityId}</p>}
                      {appr.decisionComment && (
                        <p className="text-xs mt-1 text-primary">
                          {lang === "ru" ? "Комментарий:" : "Izoh:"} {appr.decisionComment}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{getUserName(appr.requestedBy)}</TableCell>
                  <TableCell>
                    <StatusPill status={appr.status}>
                      {getStatusName(appr.status)}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(appr.requestedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                    {appr.decidedAt && (
                      <p className="text-xs text-text-muted">
                        {lang === "ru" ? "Решено:" : "Hal:"} {new Date(appr.decidedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {appr.status === "pending" ? (
                      <Button variant="primary" size="sm" onClick={() => openDecisionModal(appr)}>
                        {lang === "ru" ? "Решить" : "Qaror berish"}
                      </Button>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-text-muted">
                  {lang === "ru" ? "Запросов нет" : "So'rovlar yo'q"}
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
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "ID объекта" : "Obyekt ID"}</label>
                  <input value={formEntityId} onChange={(e) => setFormEntityId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder={lang === "ru" ? "SKU, task ID и т.д." : "SKU, task ID va h.k."} />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Причина запроса *" : "So'rov sababi *"}</label>
                  <textarea value={formReason} onChange={(e) => setFormReason(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[80px]"
                    placeholder={lang === "ru" ? "Почему нужно одобрение?" : "Nima uchun tasdiqlash kerak?"} />
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

      {/* Decision Modal */}
      {showDecisionModal && decisionApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDecisionModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {lang === "ru" ? "Решение Founder" : "Founder qarori"}
              </h2>
              <p className="text-sm text-text-muted mb-2">{getEntityTypeName(decisionApproval.entityType)}</p>
              <p className="text-sm mb-4">{decisionApproval.reason}</p>
              <p className="text-xs text-text-muted mb-4">
                {lang === "ru" ? "Запросил:" : "So'ragan:"} {getUserName(decisionApproval.requestedBy)}
              </p>

              <div className="mb-4">
                <label className="text-xs text-text-muted mb-1 block">
                  {lang === "ru" ? "Комментарий к решению" : "Qaror izohi"}
                </label>
                <textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                  placeholder={lang === "ru" ? "Необязательно" : "Ixtiyoriy"} />
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
    </Layout>
  );
}
