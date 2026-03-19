"use client";

import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type { SkuResponsibility, SystemUser, MarketplaceId } from "@/types/founder";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
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

interface ProductInfo {
  sku: string;
  name: string;
  marketplaces: string[];
}

export default function ResponsibilityMatrixPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [matrix, setMatrix] = useState<SkuResponsibility[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [search, setSearch] = useState("");
  const [mpFilter, setMpFilter] = useState<MarketplaceId | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<SkuResponsibility | null>(null);

  // Form state
  const [formSku, setFormSku] = useState("");
  const [formMp, setFormMp] = useState<MarketplaceId>("WB");
  const [formMpOwner, setFormMpOwner] = useState("");
  const [formAdsOwner, setFormAdsOwner] = useState("");
  const [formContentOwner, setFormContentOwner] = useState("");
  const [formSupplyOwner, setFormSupplyOwner] = useState("");
  const [formReviewer, setFormReviewer] = useState("");
  const [formBackup, setFormBackup] = useState("");

  const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

  useEffect(() => {
    setLang(storage.getLang());
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [respRes, prodRes] = await Promise.all([
        fetch("/api/founder/responsibilities", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
      ]);
      const respData = await respRes.json();
      const prodData = await prodRes.json();
      setMatrix(respData.matrix || []);
      setUsers(respData.users || []);
      setProducts(
        (prodData.products || []).map((p: any) => ({
          sku: p.sku,
          name: p.name || p.sku,
          marketplaces: p.marketplaces || [],
        }))
      );
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

  const filtered = matrix.filter((r) => {
    const matchSearch =
      !search ||
      r.skuId.toLowerCase().includes(search.toLowerCase()) ||
      getSkuName(r.skuId).toLowerCase().includes(search.toLowerCase());
    const matchMp = mpFilter === "all" || r.marketplace === mpFilter;
    return matchSearch && matchMp;
  });

  // Count no-owner
  const noOwnerCount = matrix.filter(
    (r) => !r.marketplaceOwnerId && !r.adsOwnerId && !r.contentOwnerId && !r.supplyOwnerId
  ).length;

  // SKUs in products but not in matrix
  const unassignedSkus = products.filter(
    (p) => !matrix.some((r) => r.skuId === p.sku)
  );

  const openCreateModal = (sku?: string, mp?: MarketplaceId) => {
    setEditItem(null);
    setFormSku(sku || "");
    setFormMp(mp || "WB");
    setFormMpOwner("");
    setFormAdsOwner("");
    setFormContentOwner("");
    setFormSupplyOwner("");
    setFormReviewer("");
    setFormBackup("");
    setShowModal(true);
  };

  const openEditModal = (item: SkuResponsibility) => {
    setEditItem(item);
    setFormSku(item.skuId);
    setFormMp(item.marketplace);
    setFormMpOwner(item.marketplaceOwnerId);
    setFormAdsOwner(item.adsOwnerId);
    setFormContentOwner(item.contentOwnerId);
    setFormSupplyOwner(item.supplyOwnerId);
    setFormReviewer(item.reviewerId);
    setFormBackup(item.backupOwnerId);
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload: any = {
      skuId: formSku,
      marketplace: formMp,
      marketplaceOwnerId: formMpOwner,
      adsOwnerId: formAdsOwner,
      contentOwnerId: formContentOwner,
      supplyOwnerId: formSupplyOwner,
      reviewerId: formReviewer,
      backupOwnerId: formBackup,
      changedBy: "user-001",
    };
    if (editItem) payload.id = editItem.id;

    await fetch("/api/founder/responsibilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/founder/responsibilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: "user-001" }),
    });
    loadData();
  };

  const label = {
    title: lang === "ru" ? "Матрица ответственности" : "Javobgarlik matritsasi",
    subtitle: lang === "ru" ? "SKU bo'yicha ownerlar" : "SKU bo'yicha ownerlar",
    addBtn: lang === "ru" ? "Назначить владельца" : "Owner tayinlash",
    sku: "SKU",
    marketplace: lang === "ru" ? "Площадка" : "Platforma",
    mpOwner: lang === "ru" ? "Менеджер МП" : "MP manager",
    adsOwner: lang === "ru" ? "Менеджер рекламы" : "Reklama manager",
    contentOwner: lang === "ru" ? "Контент-менеджер" : "Kontent manager",
    supplyOwner: lang === "ru" ? "Снабжение" : "Ta'minot",
    reviewer: lang === "ru" ? "Ревьюер" : "Tekshiruvchi",
    backup: lang === "ru" ? "Бэкап" : "Zaxira",
    actions: lang === "ru" ? "Действия" : "Amallar",
    save: lang === "ru" ? "Сохранить" : "Saqlash",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    edit: lang === "ru" ? "Редактировать" : "Tahrirlash",
    delete: lang === "ru" ? "Удалить" : "O'chirish",
    noOwner: lang === "ru" ? "Без владельца" : "Ownersiz",
    unassigned: lang === "ru" ? "Не назначенные SKU" : "Tayinlanmagan SKUlar",
    assignNow: lang === "ru" ? "Назначить" : "Tayinlash",
    newAssignment: lang === "ru" ? "Новое назначение" : "Yangi tayinlash",
    editAssignment: lang === "ru" ? "Редактирование" : "Tahrirlash",
  };

  const UserSelect = ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <option value="">{placeholder}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.role})
        </option>
      ))}
    </select>
  );

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{label.title}</h1>
          <p className="page-subtitle">{label.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => openCreateModal()}>
          {label.addBtn}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Всего SKU" : "Jami SKU"}</p>
            <p className="text-2xl font-bold text-primary">{matrix.length}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted">{label.noOwner}</p>
            <p className={`text-2xl font-bold ${noOwnerCount > 0 ? "text-danger" : "text-success"}`}>
              {noOwnerCount}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted">{label.unassigned}</p>
            <p className={`text-2xl font-bold ${unassignedSkus.length > 0 ? "text-warning" : "text-success"}`}>
              {unassignedSkus.length}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted">{lang === "ru" ? "Команда" : "Jamoa"}</p>
            <p className="text-2xl font-bold text-text-main">{users.length}</p>
          </div>
        </Card>
      </div>

      {/* Unassigned SKUs warning */}
      {unassignedSkus.length > 0 && (
        <Card className="mb-6 border-l-4 border-warning">
          <div className="p-4">
            <p className="font-semibold text-sm text-warning mb-2">
              {label.unassigned} ({unassignedSkus.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {unassignedSkus.slice(0, 10).map((p) => (
                <button
                  key={p.sku}
                  onClick={() => openCreateModal(p.sku, p.marketplaces[0] as MarketplaceId)}
                  className="px-3 py-1 text-xs rounded-full bg-warning/10 text-warning hover:bg-warning/20 font-medium"
                >
                  {p.sku} → {label.assignNow}
                </button>
              ))}
              {unassignedSkus.length > 10 && (
                <span className="text-xs text-text-muted">
                  +{unassignedSkus.length - 10} {lang === "ru" ? "ещё" : "yana"}
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px]">
            <SearchInput
              placeholder={lang === "ru" ? "Поиск по SKU..." : "SKU bo'yicha qidirish..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={mpFilter}
            onChange={(e) => setMpFilter(e.target.value as MarketplaceId | "all")}
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">{lang === "ru" ? "Все площадки" : "Barcha platformalar"}</option>
            <option value="WB">Wildberries</option>
            <option value="Ozon">Ozon</option>
          </select>
        </div>
      </Card>

      {/* Matrix Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label.sku}</TableHead>
              <TableHead>{label.marketplace}</TableHead>
              <TableHead>{label.mpOwner}</TableHead>
              <TableHead>{label.adsOwner}</TableHead>
              <TableHead>{label.contentOwner}</TableHead>
              <TableHead>{label.supplyOwner}</TableHead>
              <TableHead>{label.reviewer}</TableHead>
              <TableHead>{label.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((r) => {
                const hasAllOwners = r.marketplaceOwnerId && r.adsOwnerId && r.contentOwnerId && r.supplyOwnerId;
                return (
                  <TableRow key={r.id} className={!hasAllOwners ? "bg-danger/5" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{getSkuName(r.skuId)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.marketplace === "Ozon" ? "primary" : "default"}>
                        {r.marketplace}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{getUserName(r.marketplaceOwnerId)}</TableCell>
                    <TableCell className="text-sm">{getUserName(r.adsOwnerId)}</TableCell>
                    <TableCell className="text-sm">{getUserName(r.contentOwnerId)}</TableCell>
                    <TableCell className="text-sm">{getUserName(r.supplyOwnerId)}</TableCell>
                    <TableCell className="text-sm">{getUserName(r.reviewerId)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(r)}
                          className="text-primary hover:text-primary-dark text-sm font-medium"
                        >
                          {label.edit}
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-danger hover:text-danger/80 text-sm font-medium"
                        >
                          {label.delete}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                  {lang === "ru"
                    ? "Нет назначений. Добавьте владельцев для SKU."
                    : "Tayinlovlar yo'q. SKU uchun ownerlarni qo'shing."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <Card
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-text-main mb-4">
                {editItem ? label.editAssignment : label.newAssignment}
              </h2>

              <div className="space-y-4">
                {/* SKU */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.sku}</label>
                  {editItem ? (
                    <p className="font-medium">{getSkuName(formSku)}</p>
                  ) : (
                    <select
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">-- SKU tanlang --</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Marketplace */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.marketplace}</label>
                  <select
                    value={formMp}
                    onChange={(e) => setFormMp(e.target.value as MarketplaceId)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="WB">Wildberries</option>
                    <option value="Ozon">Ozon</option>
                  </select>
                </div>

                {/* Owners */}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.mpOwner}</label>
                  <UserSelect value={formMpOwner} onChange={setFormMpOwner} placeholder="-- tanlang --" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.adsOwner}</label>
                  <UserSelect value={formAdsOwner} onChange={setFormAdsOwner} placeholder="-- tanlang --" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.contentOwner}</label>
                  <UserSelect value={formContentOwner} onChange={setFormContentOwner} placeholder="-- tanlang --" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.supplyOwner}</label>
                  <UserSelect value={formSupplyOwner} onChange={setFormSupplyOwner} placeholder="-- tanlang --" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.reviewer}</label>
                  <UserSelect value={formReviewer} onChange={setFormReviewer} placeholder="-- tanlang --" />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">{label.backup}</label>
                  <UserSelect value={formBackup} onChange={setFormBackup} placeholder="-- tanlang --" />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  {label.cancel}
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={!formSku}>
                  {label.save}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
