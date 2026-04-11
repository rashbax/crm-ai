"use client";

import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type { SkuResponsibility, SystemUser, MarketplaceId, AssignmentStatus, GeneralAuditLog } from "@/types/founder";
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
  Badge,
  StatusPill,
} from "@/components/ui";

interface ProductInfo { sku: string; name: string; marketplaces: string[] }
interface ManagerWorkload { userId: string; userName: string; role: string; skuCount: number; openIncidents: number; overdueTasks: number }
interface OverloadedUser { userId: string; userName: string; skuCount: number }

const ROLE_FIELDS = ["marketplaceOwnerId", "adsOwnerId", "contentOwnerId", "supplyOwnerId", "reviewerId", "backupOwnerId"] as const;
type RoleField = typeof ROLE_FIELDS[number];
type RoleFilter = "all" | RoleField;
type QuickFilter = "all" | "no_owner" | "no_backup" | "inactive";

const DEFAULT_AUTHORITY: Record<RoleField, { ru: string; uz: string }> = {
  marketplaceOwnerId: { ru: "Ежедневные операции и стандартные задачи", uz: "Kundalik operatsiya va odatiy tasklar" },
  adsOwnerId: { ru: "Кампании и бюджет в рамках согласованного лимита", uz: "Kelishilgan limit ichida kampaniya va byudjet" },
  contentOwnerId: { ru: "Обновление контента и исправление листинга", uz: "Kontent yangilash va listing tuzatish" },
  supplyOwnerId: { ru: "Стандартные задачи по риску остатков", uz: "Stock xavfi bo'yicha standart tasklar" },
  reviewerId: { ru: "Проверка закрытых работ и важных изменений", uz: "Yopilgan ish va muhim o'zgarishni tekshirish" },
  backupOwnerId: { ru: "Все полномочия при отсутствии основного", uz: "Asosiy egasi yo'qligida barcha vakolatlar" },
};

export default function ResponsibilityMatrixPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [matrix, setMatrix] = useState<SkuResponsibility[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [managerWorkload, setManagerWorkload] = useState<ManagerWorkload[]>([]);
  const [overloadedUsers, setOverloadedUsers] = useState<OverloadedUser[]>([]);
  const [noBackupCount, setNoBackupCount] = useState(0);

  // Filters — marketplace comes from global selector, no local override
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<SkuResponsibility | null>(null);

  // GAP 8: SKU detail modal
  const [detailItem, setDetailItem] = useState<SkuResponsibility | null>(null);

  // GAP 9: History modal
  const [historyItem, setHistoryItem] = useState<SkuResponsibility | null>(null);
  const [historyLogs, setHistoryLogs] = useState<GeneralAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form state
  const [formSku, setFormSku] = useState("");
  const [formMp, setFormMp] = useState<MarketplaceId>("WB");
  const [formMpOwner, setFormMpOwner] = useState("");
  const [formAdsOwner, setFormAdsOwner] = useState("");
  const [formContentOwner, setFormContentOwner] = useState("");
  const [formSupplyOwner, setFormSupplyOwner] = useState("");
  const [formReviewer, setFormReviewer] = useState("");
  const [formBackup, setFormBackup] = useState("");
  const [formStartDate, setFormStartDate] = useState("");       // GAP 1
  const [formStatus, setFormStatus] = useState<AssignmentStatus>("active"); // GAP 2
  const [formAuthority, setFormAuthority] = useState("");        // GAP 3
  const [formNotes, setFormNotes] = useState("");                // GAP 4

  const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

  useEffect(() => {
    setLang(storage.getLang());
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f === "noOwner") setQuickFilter("no_owner");
    else if (f === "noBackup") setQuickFilter("no_backup");
    else if (f === "inactive") setQuickFilter("inactive");
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [respRes, prodRes] = await Promise.all([
        fetch("/api/founder/responsibilities", { cache: "no-store" }),
        fetch(`/api/products?marketplace=${storage.getMarketplace()}`, { cache: "no-store" }),
      ]);
      const respData = await respRes.json();
      const prodData = await prodRes.json();
      setMatrix(respData.matrix || []);
      setUsers(respData.users || []);
      setManagerWorkload(respData.managerWorkload || []);
      setOverloadedUsers(respData.overloadedUsers || []);
      setNoBackupCount(respData.noBackupCount || 0);
      setProducts((prodData.products || []).map((p: any) => ({ sku: p.sku, name: p.name || p.sku, marketplaces: p.marketplaces || [] })));
    } catch (err) {
      console.error("Failed to load:", err);
    }
  };

  const getUserName = (id: string) => {
    if (!id) return lang === "ru" ? "— не назначен —" : "— tayinlanmagan —";
    return users.find((u) => u.id === id)?.name || id;
  };

  const getSkuName = (skuId: string) => {
    const p = products.find((p) => p.sku === skuId);
    return p ? `${p.name} (${p.sku})` : skuId;
  };

  const getRoleLabel = (field: RoleField) => {
    const labels: Record<RoleField, { ru: string; uz: string }> = {
      marketplaceOwnerId: { ru: "Менеджер МП", uz: "MP manager" },
      adsOwnerId: { ru: "Реклама", uz: "Reklama" },
      contentOwnerId: { ru: "Контент", uz: "Kontent" },
      supplyOwnerId: { ru: "Снабжение", uz: "Ta'minot" },
      reviewerId: { ru: "Ревьюер", uz: "Tekshiruvchi" },
      backupOwnerId: { ru: "Бэкап", uz: "Zaxira" },
    };
    return labels[field][lang];
  };

  const getStatusLabel = (s: AssignmentStatus) => {
    const labels: Record<AssignmentStatus, { ru: string; uz: string }> = {
      active: { ru: "Активен", uz: "Faol" },
      temporary: { ru: "Временный", uz: "Vaqtinchalik" },
      backup_active: { ru: "Бэкап активен", uz: "Zaxira faol" },
      inactive: { ru: "Неактивен", uz: "Nofaol" },
    };
    return labels[s]?.[lang] || s;
  };

  const getStatusColor = (s: AssignmentStatus) => {
    const colors: Record<AssignmentStatus, string> = {
      active: "success",
      temporary: "warning",
      backup_active: "primary",
      inactive: "default",
    };
    return colors[s] || "default";
  };

  // Counts
  const noOwnerCount = matrix.filter(
    (r) => !r.marketplaceOwnerId && !r.adsOwnerId && !r.contentOwnerId && !r.supplyOwnerId
  ).length;

  const unassignedSkus = products.filter((p) => !matrix.some((r) => r.skuId === p.sku));

  // Filtering — marketplace from global selector
  const globalMp = storage.getMarketplace(); // "wb" | "ozon" | "all"
  const filtered = matrix.filter((r) => {
    const matchSearch =
      !search ||
      r.skuId.toLowerCase().includes(search.toLowerCase()) ||
      getSkuName(r.skuId).toLowerCase().includes(search.toLowerCase());
    const matchMp =
      globalMp === "all" ||
      r.marketplace.toLowerCase() === globalMp.toLowerCase();

    // GAP 5: role filter — show rows where that role slot is empty
    const matchRole =
      roleFilter === "all" ||
      !r[roleFilter as RoleField];

    // GAP 6: quick filter
    const matchQuick =
      quickFilter === "all" ||
      (quickFilter === "no_owner" && !r.marketplaceOwnerId && !r.adsOwnerId && !r.contentOwnerId && !r.supplyOwnerId) ||
      (quickFilter === "no_backup" && !r.backupOwnerId) ||
      (quickFilter === "inactive" && r.assignmentStatus === "inactive");

    return matchSearch && matchMp && matchRole && matchQuick;
  });

  // Modal helpers
  const openCreateModal = (sku?: string, mp?: MarketplaceId) => {
    setEditItem(null);
    setFormSku(sku || ""); setFormMp(mp || "WB");
    setFormMpOwner(""); setFormAdsOwner(""); setFormContentOwner("");
    setFormSupplyOwner(""); setFormReviewer(""); setFormBackup("");
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormStatus("active"); setFormAuthority(""); setFormNotes("");
    setShowModal(true);
  };

  const openEditModal = (item: SkuResponsibility) => {
    setEditItem(item);
    setFormSku(item.skuId); setFormMp(item.marketplace);
    setFormMpOwner(item.marketplaceOwnerId); setFormAdsOwner(item.adsOwnerId);
    setFormContentOwner(item.contentOwnerId); setFormSupplyOwner(item.supplyOwnerId);
    setFormReviewer(item.reviewerId); setFormBackup(item.backupOwnerId);
    setFormStartDate(item.startDate || new Date().toISOString().slice(0, 10));
    setFormStatus(item.assignmentStatus || "active");
    setFormAuthority(item.authorityLimit || "");
    setFormNotes(item.notes || "");
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload: any = {
      skuId: formSku, marketplace: formMp,
      marketplaceOwnerId: formMpOwner, adsOwnerId: formAdsOwner,
      contentOwnerId: formContentOwner, supplyOwnerId: formSupplyOwner,
      reviewerId: formReviewer, backupOwnerId: formBackup,
      startDate: formStartDate,
      assignmentStatus: formStatus,
      authorityLimit: formAuthority || DEFAULT_AUTHORITY.marketplaceOwnerId[lang],
      notes: formNotes || undefined,
      changedBy: "user-001",
    };
    if (editItem) payload.id = editItem.id;
    await fetch("/api/founder/responsibilities", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/founder/responsibilities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: "user-001" }),
    });
    loadData();
  };

  // GAP 9: Load history
  const openHistoryModal = async (item: SkuResponsibility) => {
    setHistoryItem(item);
    setHistoryLogs([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/founder/audit?entityType=responsibility&entityId=${item.id}&limit=30`, { cache: "no-store" });
      const data = await res.json();
      setHistoryLogs(data.logs || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  };

  const label = {
    title: lang === "ru" ? "SKU ответственность" : "SKU javobgarligi",
    subtitle: lang === "ru" ? "Ответственные по каждому SKU" : "Har bir SKU uchun javobgarlar",
    addBtn: lang === "ru" ? "Назначить" : "Tayinlash",
    save: lang === "ru" ? "Сохранить" : "Saqlash",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    edit: lang === "ru" ? "Редактировать" : "Tahrirlash",
    delete: lang === "ru" ? "Удалить" : "O'chirish",
    history: lang === "ru" ? "История" : "Tarix",
    detail: lang === "ru" ? "Карточка" : "Kartochka",
  };

  const UserSelect = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
      <option value="">{placeholder}</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
    </select>
  );

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{label.title}</h1>
          <p className="page-subtitle">{label.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => openCreateModal()}>{label.addBtn}</Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Card><div className="p-4">
          <p className="text-xs text-text-muted">{lang === "ru" ? "Всего SKU" : "Jami SKU"}</p>
          <p className="text-2xl font-bold text-primary">{matrix.length}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-xs text-text-muted">{lang === "ru" ? "Без владельца" : "Ownersiz"}</p>
          <p className={`text-2xl font-bold ${noOwnerCount > 0 ? "text-danger" : "text-success"}`}>{noOwnerCount}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-xs text-text-muted">{lang === "ru" ? "Без бэкапа" : "Zaxirasiz"}</p>
          <p className={`text-2xl font-bold ${noBackupCount > 0 ? "text-warning" : "text-success"}`}>{noBackupCount}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-xs text-text-muted">{lang === "ru" ? "Не назначены" : "Tayinlanmagan"}</p>
          <p className={`text-2xl font-bold ${unassignedSkus.length > 0 ? "text-warning" : "text-success"}`}>{unassignedSkus.length}</p>
        </div></Card>
      </div>

      {/* GAP 10: Signals */}
      {overloadedUsers.length > 0 && (
        <Card className="mb-4 border-l-4 border-danger">
          <div className="p-4">
            <p className="font-semibold text-sm text-danger mb-2">
              🔴 {lang === "ru" ? "Перегруженные менеджеры (>5 SKU)" : "Haddan ko'p yukli managerlar (>5 SKU)"}
            </p>
            <div className="flex flex-wrap gap-2">
              {overloadedUsers.map((u) => (
                <span key={u.userId} className="px-3 py-1 text-xs rounded-full bg-danger/10 text-danger font-medium">
                  {u.userName}: {u.skuCount} SKU
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {unassignedSkus.length > 0 && (
        <Card className="mb-4 border-l-4 border-warning">
          <div className="p-4">
            <p className="font-semibold text-sm text-warning mb-2">
              🟡 {lang === "ru" ? "SKU без назначения" : "Tayinlanmagan SKUlar"} ({unassignedSkus.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {unassignedSkus.slice(0, 10).map((p) => (
                <button key={p.sku} onClick={() => openCreateModal(p.sku, p.marketplaces[0] as MarketplaceId)}
                  className="px-3 py-1 text-xs rounded-full bg-warning/10 text-warning hover:bg-warning/20 font-medium">
                  {p.sku} → {lang === "ru" ? "Назначить" : "Tayinlash"}
                </button>
              ))}
              {unassignedSkus.length > 10 && <span className="text-xs text-text-muted">+{unassignedSkus.length - 10} {lang === "ru" ? "ещё" : "yana"}</span>}
            </div>
          </div>
        </Card>
      )}

      {/* GAP 7: Manager workload cards */}
      {managerWorkload.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-text-main mb-3">
            {lang === "ru" ? "Нагрузка по менеджерам" : "Managerlar yuklamasi"}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {managerWorkload.map((m) => (
              <Card key={m.userId} className={m.overdueTasks > 0 ? "border-l-4 border-danger" : m.openIncidents > 0 ? "border-l-4 border-warning" : ""}>
                <div className="p-3">
                  <p className="font-semibold text-sm text-text-main">{m.userName}</p>
                  <p className="text-xs text-text-muted mb-2 capitalize">{m.role}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">SKU</span>
                      <span className="font-bold text-primary">{m.skuCount}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">{lang === "ru" ? "Инциденты" : "Hodisalar"}</span>
                      <span className={`font-bold ${m.openIncidents > 0 ? "text-warning" : "text-success"}`}>{m.openIncidents}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">{lang === "ru" ? "Просрочено" : "Muddati o'tgan"}</span>
                      <span className={`font-bold ${m.overdueTasks > 0 ? "text-danger" : "text-success"}`}>{m.overdueTasks}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* GAP 6: Quick-filter chips + GAP 5: Role filter + marketplace filter */}
      <Card className="mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              placeholder={lang === "ru" ? "Поиск по SKU..." : "SKU bo'yicha qidirish..."}
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* GAP 5: Role filter — shows SKUs where that role slot is EMPTY */}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="px-3 py-2 border border-border rounded-lg text-sm">
            <option value="all">{lang === "ru" ? "Все роли" : "Barcha rollar"}</option>
            {ROLE_FIELDS.map((f) => (
              <option key={f} value={f}>{lang === "ru" ? "Нет: " : "Yo'q: "}{getRoleLabel(f)}</option>
            ))}
          </select>
        </div>
        {/* GAP 6: Quick-filter chips */}
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {(["no_owner", "no_backup", "inactive"] as QuickFilter[]).map((qf) => {
            const labels: Record<string, { ru: string; uz: string }> = {
              no_owner: { ru: "🔴 Без владельца", uz: "🔴 Ownersiz" },
              no_backup: { ru: "🟡 Без бэкапа", uz: "🟡 Zaxirasiz" },
              inactive: { ru: "⚪ Неактивные", uz: "⚪ Nofaollar" },
            };
            const counts: Record<string, number> = {
              no_owner: noOwnerCount,
              no_backup: noBackupCount,
              inactive: matrix.filter((r) => r.assignmentStatus === "inactive").length,
            };
            return (
              <button key={qf}
                onClick={() => setQuickFilter(quickFilter === qf ? "all" : qf)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  quickFilter === qf
                    ? "bg-primary text-white border-primary"
                    : "bg-surface text-text-muted border-border hover:border-primary"
                }`}>
                {labels[qf][lang]} ({counts[qf]})
              </button>
            );
          })}
        </div>
      </Card>

      {/* Matrix Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>{lang === "ru" ? "Площадка" : "Platforma"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус / Дата" : "Status / Sana"}</TableHead>
              <TableHead>{lang === "ru" ? "МП Менеджер" : "MP Manager"}</TableHead>
              <TableHead>{lang === "ru" ? "Реклама" : "Reklama"}</TableHead>
              <TableHead>{lang === "ru" ? "Контент" : "Kontent"}</TableHead>
              <TableHead>{lang === "ru" ? "Снабжение" : "Ta'minot"}</TableHead>
              <TableHead>{lang === "ru" ? "Ревьюер / Бэкап" : "Tekshiruvchi / Zaxira"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((r) => {
                const hasAllOwners = r.marketplaceOwnerId && r.adsOwnerId && r.contentOwnerId && r.supplyOwnerId;
                const isInactive = r.assignmentStatus === "inactive";
                return (
                  <TableRow key={r.id} className={
                    !hasAllOwners ? "bg-danger/5" :
                    isInactive ? "bg-surface/50 opacity-70" :
                    !r.backupOwnerId ? "bg-warning/5" : ""
                  }>
                    <TableCell>
                      <button onClick={() => setDetailItem(r)} className="font-medium text-sm text-primary hover:underline text-left">
                        {getSkuName(r.skuId)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.marketplace === "Ozon" ? "primary" : "default"}>{r.marketplace}</Badge>
                    </TableCell>
                    <TableCell>
                      {/* GAP 2: status pill + GAP 1: start date */}
                      <div>
                        <StatusPill status={getStatusColor(r.assignmentStatus || "active") as any}>
                          {getStatusLabel(r.assignmentStatus || "active")}
                        </StatusPill>
                        {r.startDate && (
                          <p className="text-xs text-text-muted mt-1">
                            {lang === "ru" ? "с " : "dan "}{new Date(r.startDate).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-sm ${!r.marketplaceOwnerId ? "text-danger" : ""}`}>
                      {getUserName(r.marketplaceOwnerId)}
                    </TableCell>
                    <TableCell className={`text-sm ${!r.adsOwnerId ? "text-danger" : ""}`}>
                      {getUserName(r.adsOwnerId)}
                    </TableCell>
                    <TableCell className={`text-sm ${!r.contentOwnerId ? "text-danger" : ""}`}>
                      {getUserName(r.contentOwnerId)}
                    </TableCell>
                    <TableCell className={`text-sm ${!r.supplyOwnerId ? "text-danger" : ""}`}>
                      {getUserName(r.supplyOwnerId)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{getUserName(r.reviewerId)}</div>
                      <div className={`text-xs mt-0.5 ${!r.backupOwnerId ? "text-warning" : "text-text-muted"}`}>
                        {!r.backupOwnerId
                          ? (lang === "ru" ? "⚠ нет бэкапа" : "⚠ zaxira yo'q")
                          : `↳ ${getUserName(r.backupOwnerId)}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setDetailItem(r)} className="text-xs text-primary hover:underline text-left">
                          {label.detail}
                        </button>
                        <button onClick={() => openEditModal(r)} className="text-xs text-primary hover:underline text-left">
                          {label.edit}
                        </button>
                        <button onClick={() => openHistoryModal(r)} className="text-xs text-text-muted hover:text-text-main text-left">
                          📋 {label.history}
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="text-xs text-danger hover:text-danger/80 text-left">
                          {label.delete}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-text-muted">
                  {lang === "ru" ? "Нет данных" : "Ma'lumot yo'q"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* GAP 8: SKU Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailItem(null)}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-text-main">{getSkuName(detailItem.skuId)}</h2>
                  <p className="text-sm text-text-muted">{detailItem.marketplace}</p>
                </div>
                <StatusPill status={getStatusColor(detailItem.assignmentStatus || "active") as any}>
                  {getStatusLabel(detailItem.assignmentStatus || "active")}
                </StatusPill>
              </div>

              {/* GAP 1: start date */}
              {detailItem.startDate && (
                <p className="text-xs text-text-muted mb-4">
                  {lang === "ru" ? "Назначено с:" : "Tayinlangan:"} {new Date(detailItem.startDate).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                </p>
              )}

              {/* Roles */}
              <div className="space-y-3 mb-4">
                {ROLE_FIELDS.map((field) => {
                  const userId = detailItem[field];
                  return (
                    <div key={field} className="flex items-center justify-between py-2 border-b border-border">
                      <div>
                        <p className="text-xs text-text-muted">{getRoleLabel(field)}</p>
                        {/* GAP 3: authority limit */}
                        <p className="text-xs text-text-muted/70 italic mt-0.5">
                          {DEFAULT_AUTHORITY[field][lang]}
                        </p>
                      </div>
                      <span className={`text-sm font-medium ${!userId ? "text-danger" : "text-text-main"}`}>
                        {getUserName(userId)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* GAP 3: custom authority limit */}
              {detailItem.authorityLimit && (
                <div className="bg-surface rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-text-muted mb-1">
                    {lang === "ru" ? "Полномочия" : "Vakolatlar"}
                  </p>
                  <p className="text-sm text-text-main">{detailItem.authorityLimit}</p>
                </div>
              )}

              {/* GAP 4: notes */}
              {detailItem.notes && (
                <div className="bg-surface rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-text-muted mb-1">
                    {lang === "ru" ? "Примечание" : "Izoh"}
                  </p>
                  <p className="text-sm text-text-main">{detailItem.notes}</p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setDetailItem(null); openHistoryModal(detailItem); }}>
                  📋 {label.history}
                </Button>
                <Button variant="primary" onClick={() => { setDetailItem(null); openEditModal(detailItem); }}>
                  {label.edit}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* GAP 9: History Modal */}
      {historyItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHistoryItem(null)}>
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-1">
                {lang === "ru" ? "История изменений" : "O'zgarishlar tarixi"}
              </h2>
              <p className="text-sm text-text-muted mb-4">{getSkuName(historyItem.skuId)}</p>

              {historyLoading ? (
                <p className="text-sm text-text-muted py-4 text-center">{lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}</p>
              ) : historyLogs.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">{lang === "ru" ? "История пуста" : "Tarix bo'sh"}</p>
              ) : (
                <div className="space-y-3">
                  {historyLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 items-start border-l-2 border-border pl-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-text-main capitalize">{log.fieldName}</span>
                          {log.oldValue && <><span className="text-xs text-text-muted line-through">{log.oldValue}</span><span className="text-xs text-text-muted">→</span></>}
                          <span className="text-xs font-medium text-primary">{log.newValue}</span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {users.find((u) => u.id === log.changedBy)?.name || log.changedBy} · {new Date(log.changedAt).toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button variant="ghost" onClick={() => setHistoryItem(null)}>{label.cancel}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-text-main mb-4">
                {editItem ? (lang === "ru" ? "Редактирование" : "Tahrirlash") : (lang === "ru" ? "Новое назначение" : "Yangi tayinlash")}
              </h2>

              <div className="space-y-4">
                {/* SKU */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">SKU *</label>
                  {editItem ? (
                    <p className="font-medium text-sm">{getSkuName(formSku)}</p>
                  ) : (
                    <select value={formSku} onChange={(e) => setFormSku(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      <option value="">-- SKU {lang === "ru" ? "выберите" : "tanlang"} --</option>
                      {products.map((p) => <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>)}
                    </select>
                  )}
                </div>

                {/* Marketplace */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Площадка" : "Platforma"}</label>
                  <select value={formMp} onChange={(e) => setFormMp(e.target.value as MarketplaceId)} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                    <option value="WB">Wildberries</option>
                    <option value="Ozon">Ozon</option>
                  </select>
                </div>

                {/* GAP 1+2: Start date + Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Дата начала *" : "Boshlanish sanasi *"}</label>
                    <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Статус *" : "Status *"}</label>
                    <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as AssignmentStatus)} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                      {(["active", "temporary", "backup_active", "inactive"] as AssignmentStatus[]).map((s) => (
                        <option key={s} value={s}>{getStatusLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Owners */}
                {ROLE_FIELDS.map((field) => (
                  <div key={field}>
                    <label className="text-xs text-text-muted mb-1 block">{getRoleLabel(field)}</label>
                    <UserSelect
                      value={field === "marketplaceOwnerId" ? formMpOwner : field === "adsOwnerId" ? formAdsOwner : field === "contentOwnerId" ? formContentOwner : field === "supplyOwnerId" ? formSupplyOwner : field === "reviewerId" ? formReviewer : formBackup}
                      onChange={field === "marketplaceOwnerId" ? setFormMpOwner : field === "adsOwnerId" ? setFormAdsOwner : field === "contentOwnerId" ? setFormContentOwner : field === "supplyOwnerId" ? setFormSupplyOwner : field === "reviewerId" ? setFormReviewer : setFormBackup}
                      placeholder={`-- ${lang === "ru" ? "выберите" : "tanlang"} --`}
                    />
                  </div>
                ))}

                {/* GAP 3: Authority limit */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Полномочия (до какого уровня решает сам)" : "Vakolatlar (qaysi qarorlarni o'zi qabul qiladi)"}</label>
                  <textarea value={formAuthority} onChange={(e) => setFormAuthority(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                    placeholder={DEFAULT_AUTHORITY.marketplaceOwnerId[lang]} />
                </div>

                {/* GAP 4: Notes */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{lang === "ru" ? "Примечание (необязательно)" : "Izoh (ixtiyoriy)"}</label>
                  <input value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder={lang === "ru" ? "Дополнительная информация..." : "Qo'shimcha ma'lumot..."} />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => setShowModal(false)}>{label.cancel}</Button>
                <Button variant="primary" onClick={handleSave} disabled={!formSku}>{label.save}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
