"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import type { Language } from "@/types";
import { Card, CardHeader, CardBody, CardTitle, Button, Input, Badge } from "@/components/ui";
import { Toast, useToast } from "@/src/ui/Toast";
import { INTEGRATIONS_COPY } from "@/src/integrations/uiCopy";

interface Connection {
  id: string;
  marketplaceId: string;
  name: string;
  enabled: boolean;
  enabledData: {
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  };
  lastTestAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  accountLabel?: string;
  createdAt: string;
  updatedAt: string;
}

interface MarketplaceDef {
  id: string;
  title: string;
  description: string;
  logoText: string;
  credentialSchema: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    helpText?: string;
  }>;
  capabilities: {
    orders: boolean;
    stocks: boolean;
    ads: boolean;
    prices: boolean;
  };
}

type ModalType = "disconnect" | "remove-step1" | "remove-step2" | "catalog" | "wizard" | null;

export default function IntegrationsPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MarketplaceDef[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceDef | null>(null);
  const [removeDataChoice, setRemoveDataChoice] = useState<"keep" | "delete">("keep");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardCreds, setWizardCreds] = useState<Record<string, string>>({});
  const [wizardEnabledData, setWizardEnabledData] = useState({
    orders: true,
    stocks: true,
    ads: true,
    prices: true,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    setLang(storage.getLang());
    loadIntegrations();
  }, []);

  const connectedMarketplaceIds = useMemo(
    () => new Set(connections.map((c) => c.marketplaceId)),
    [connections]
  );

  const availableCatalog = useMemo(
    () => catalog.filter((mp) => !connectedMarketplaceIds.has(mp.id)),
    [catalog, connectedMarketplaceIds]
  );

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/integrations");
      const data = await response.json();
      console.log("Integrations data loaded:", data); // Debug log
      setMode(data.mode);
      setWarnings(data.warnings || []);
      setCatalog(data.catalog || []);
      setConnections(data.connections || []);
      console.log("Catalog length:", data.catalog?.length); // Debug log
    } catch (error) {
      console.error("Error loading integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedConnection(null);
    setSelectedMarketplace(null);
    setRemoveDataChoice("keep");
    setDeleteConfirmText("");
    setWizardStep(1);
    setWizardCreds({});
    setTestResult(null);
  };

  const handleDisconnect = async () => {
    if (!selectedConnection) return;

    try {
      const response = await fetch("/api/integrations/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          enabled: false,
        }),
      });

      if (response.ok) {
        showToast(INTEGRATIONS_COPY.disconnect.successToast, "success");
        await loadIntegrations();
        closeModal();
      }
    } catch (error) {
      console.error("Error disconnecting:", error);
      showToast(lang === "ru" ? "Ошибка отключения интеграции" : "Integratsiyani uzishda xato", "error");
    }
  };

  const handleRemoveStep1Continue = () => {
    if (removeDataChoice === "delete") {
      setModalType("remove-step2");
    } else {
      handleRemoveFinal(false);
    }
  };

  const handleRemoveFinal = async (deleteData: boolean) => {
    if (!selectedConnection) return;

    try {
      const response = await fetch("/api/integrations/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          deleteData,
        }),
      });

      if (response.ok) {
        const successMessage = deleteData
          ? INTEGRATIONS_COPY.removeConfirm.successToast
          : INTEGRATIONS_COPY.remove.successToastKeep;
        showToast(successMessage, "success");
        await loadIntegrations();
        closeModal();
      }
    } catch (error) {
      console.error("Error removing:", error);
      showToast(lang === "ru" ? "Ошибка удаления интеграции" : "Integratsiyani o'chirishda xato", "error");
    }
  };

  const handleReconnect = async () => {
    if (!selectedConnection) return;

    try {
      await fetch("/api/integrations/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          enabled: true,
        }),
      });

      showToast(lang === "ru" ? "Интеграция переподключена" : "Integratsiya qayta ulandi", "success");
      await loadIntegrations();
    } catch (error) {
      console.error("Error reconnecting:", error);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingConnectionId(connectionId);
    try {
      const response = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const result = await response.json().catch(() => null);

      const syncOk = Boolean(result?.ok);
      const syncWarnings = Array.isArray(result?.results)
        ? result.results.flatMap((r: any) => (Array.isArray(r?.warnings) ? r.warnings : []))
        : [];

      if (response.ok && syncOk) {
        showToast(lang === "ru" ? "Синхронизация выполнена" : "Sinxronizatsiya bajarildi", "success");
        await loadIntegrations();
      } else if (response.ok && !syncOk) {
        const warningText = syncWarnings.length > 0 ? syncWarnings[0] : null;
        showToast(
          warningText || (lang === "ru" ? "Синхронизация завершена с предупреждениями" : "Sinxronizatsiya ogohlantirishlar bilan tugadi"),
          "info"
        );
        await loadIntegrations();
      } else {
        showToast(
          result?.error || (lang === "ru" ? "Ошибка синхронизации" : "Sinxronizatsiya xatosi"),
          "error"
        );
      }
      setSyncingConnectionId(null);
    } catch (error) {
      console.error("Error syncing:", error);
      setSyncingConnectionId(null);
      showToast(lang === "ru" ? "Ошибка синхронизации" : "Sinxronizatsiya xatosi", "error");
    }
  };

  const handleTestConnection = async () => {
    if (!selectedMarketplace) return;

    setTesting(true);
    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceId: selectedMarketplace.id,
          creds: wizardCreds,
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ ok: false, error: lang === "ru" ? "Ошибка подключения" : "Ulanish xatosi" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!selectedMarketplace) return;

    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceId: selectedMarketplace.id,
          creds: wizardCreds,
          enabledData: wizardEnabledData,
        }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok) {
        showToast(lang === "ru" ? "Интеграция подключена" : "Integratsiya ulandi", "success");
        await loadIntegrations();
        closeModal();
      } else {
        const apiError =
          result?.error ||
          (lang === "ru" ? "Ошибка сохранения интеграции" : "Integratsiyani saqlashda xato");
        showToast(apiError, "error");
      }
    } catch (error) {
      console.error("Error saving:", error);
      showToast(lang === "ru" ? "Ошибка сохранения интеграции" : "Integratsiyani saqlashda xato", "error");
    }
  };

  const getConnectionStatus = (conn: Connection) => {
    if (conn.lastError) return "error";
    if (!conn.enabled) return "disconnected";
    return "connected";
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffMinutes < 1) return lang === "ru" ? "только что" : "hozirgina";
    if (diffMinutes < 60) return lang === "ru" ? `${diffMinutes} мин назад` : `${diffMinutes} daq oldin`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return lang === "ru" ? `${diffHours} ч назад` : `${diffHours} soat oldin`;
    const diffDays = Math.floor(diffHours / 24);
    return lang === "ru" ? `${diffDays} дн назад` : `${diffDays} kun oldin`;
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
      <div className="page-header">
        <div>
          <h1 className="page-title">{lang === "ru" ? "Интеграции" : "Integratsiyalar"}</h1>
          <p className="page-subtitle">{INTEGRATIONS_COPY.addButton.helper}</p>
        </div>
        <Button variant="primary" onClick={() => setModalType("catalog")}>
          {INTEGRATIONS_COPY.addButton.title}
        </Button>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 p-4 bg-warning/10 border border-warning rounded-lg">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-warning">⚠️ {w}</p>
          ))}
        </div>
      )}

      {connections.length === 0 ? (
        <div className="text-center py-12">
          <div className="mb-4">
            <p className="text-xl font-semibold text-text-main">{INTEGRATIONS_COPY.emptyState.title}</p>
            <p className="text-text-muted mt-2">{INTEGRATIONS_COPY.emptyState.body}</p>
          </div>
          <Button variant="primary" onClick={() => setModalType("catalog")}>
            {INTEGRATIONS_COPY.addButton.title}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {connections.map((conn) => {
            const marketplace = catalog.find((m) => m.id === conn.marketplaceId);
            const status = getConnectionStatus(conn);
            const statusInfo = INTEGRATIONS_COPY.status[status];

            return (
              <Card key={conn.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center font-bold text-primary text-sm">
                          {marketplace?.logoText || conn.marketplaceId.toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-base">{conn.name}</CardTitle>
                          <p className="text-xs text-text-muted">{marketplace?.title}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={status === "connected" ? "success" : status === "error" ? "danger" : "secondary"}
                        >
                          {statusInfo.label}
                        </Badge>
                        {conn.lastSyncAt && status === "connected" && (
                          <span className="text-xs text-text-muted">
                            {lang === "ru" ? "Синхр.:" : "Sinxr.:"} {formatTimestamp(conn.lastSyncAt)}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-text-muted mt-1">{statusInfo.description}</p>
                      
                      {conn.lastError && (
                        <p className="text-xs text-danger mt-2">{conn.lastError}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardBody>
                  <div className="flex gap-2 flex-wrap">
                    {conn.enabled ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => handleSync(conn.id)} disabled={syncingConnectionId === conn.id}>
                          {lang === "ru" ? "Синхронизировать" : "Sinxronlash"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedConnection(conn);
                            setModalType("disconnect");
                          }}
                        >
                          {lang === "ru" ? "Отключить" : "Uzish"}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => {
                        setSelectedConnection(conn);
                        handleReconnect();
                      }}>
                        {lang === "ru" ? "Переподключить" : "Qayta ulash"}
                      </Button>
                    )}
                    
                    {conn.lastError && (
                      <Button size="sm" variant="primary">
                        {INTEGRATIONS_COPY.reconnect.buttonLabel}
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setSelectedConnection(conn);
                        setModalType("remove-step1");
                      }}
                    >
                      {lang === "ru" ? "Удалить" : "O'chirish"}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Disconnect Modal */}
      {modalType === "disconnect" && selectedConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{INTEGRATIONS_COPY.disconnect.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2 mb-6">
                {INTEGRATIONS_COPY.disconnect.bullets.map((bullet, i) => (
                  <li key={i} className="text-sm text-text-muted flex gap-2">
                    <span>•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {INTEGRATIONS_COPY.disconnect.cancelButton}
                </Button>
                <Button variant="danger" onClick={handleDisconnect} className="flex-1">
                  {INTEGRATIONS_COPY.disconnect.confirmButton}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Remove Step 1 Modal */}
      {modalType === "remove-step1" && selectedConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{INTEGRATIONS_COPY.remove.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-muted mb-4">{INTEGRATIONS_COPY.remove.body}</p>
              
              <div className="space-y-3 mb-6">
                <label className="flex items-start gap-3 p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="removeChoice"
                    value="keep"
                    checked={removeDataChoice === "keep"}
                    onChange={() => setRemoveDataChoice("keep")}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-sm">{INTEGRATIONS_COPY.remove.options.keep.label}</p>
                    <p className="text-xs text-text-muted">{INTEGRATIONS_COPY.remove.options.keep.description}</p>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 p-3 border border-danger/50 rounded cursor-pointer hover:bg-danger/5">
                  <input
                    type="radio"
                    name="removeChoice"
                    value="delete"
                    checked={removeDataChoice === "delete"}
                    onChange={() => setRemoveDataChoice("delete")}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-sm text-danger">{INTEGRATIONS_COPY.remove.options.delete.label}</p>
                    <p className="text-xs text-text-muted">{INTEGRATIONS_COPY.remove.options.delete.description}</p>
                  </div>
                </label>
              </div>
              
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {INTEGRATIONS_COPY.remove.cancelButton}
                </Button>
                <Button variant="danger" onClick={handleRemoveStep1Continue} className="flex-1">
                  {INTEGRATIONS_COPY.remove.continueButton}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Remove Step 2 Modal (Delete Confirmation) */}
      {modalType === "remove-step2" && selectedConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-danger">{INTEGRATIONS_COPY.removeConfirm.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm font-semibold mb-2">{INTEGRATIONS_COPY.removeConfirm.body}</p>
              <ul className="space-y-1 mb-3">
                {INTEGRATIONS_COPY.removeConfirm.items.map((item, i) => (
                  <li key={i} className="text-sm text-text-muted flex gap-2">
                    <span>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-text-muted mb-4">{INTEGRATIONS_COPY.removeConfirm.note}</p>
              
              <p className="text-sm font-semibold mb-2">{INTEGRATIONS_COPY.removeConfirm.instruction}</p>
              <Input
                type="text"
                placeholder={INTEGRATIONS_COPY.removeConfirm.placeholder}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mb-4"
              />
              
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {INTEGRATIONS_COPY.removeConfirm.cancelButton}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleRemoveFinal(true)}
                  disabled={deleteConfirmText !== "DELETE"}
                  className="flex-1"
                >
                  {INTEGRATIONS_COPY.removeConfirm.confirmButton}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Catalog Modal */}
      {modalType === "catalog" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{lang === "ru" ? "Выберите маркетплейс" : "Marketpleysi tanlang"}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                {availableCatalog.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">
                    {lang === "ru" ? "Все доступные маркетплейсы уже подключены." : "Barcha mavjud marketpleyslar allaqachon ulangan."}
                  </p>
                ) : (
                  availableCatalog.map((mp) => (
                    <button
                      key={mp.id}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent bubbling to backdrop
                        console.log("Marketplace selected:", mp.id); // Debug log
                        setSelectedMarketplace(mp);
                        setWizardEnabledData(mp.capabilities);
                        setWizardStep(1); // Reset wizard to step 1
                        setWizardCreds({}); // Clear previous creds
                        setTestResult(null); // Clear test result
                        setModalType("wizard");
                        console.log("Modal type set to wizard"); // Debug log
                      }}
                      className="w-full text-left p-4 border rounded hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center font-bold text-primary">
                          {mp.logoText}
                        </div>
                        <div>
                          <p className="font-medium">{mp.title}</p>
                          <p className="text-sm text-text-muted">{mp.description}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-4">
                <Button variant="ghost" onClick={closeModal} className="w-full">
                  {lang === "ru" ? "Отмена" : "Bekor qilish"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Wizard Modal */}
      {modalType === "wizard" && selectedMarketplace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{lang === "ru" ? `Подключить ${selectedMarketplace.title}` : `${selectedMarketplace.title}ga ulash`}</CardTitle>
            </CardHeader>
            <CardBody>
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{lang === "ru" ? "Шаг 1: Введите ключи доступа" : "1-qadam: Kirish kalitlarini kiriting"}</p>
                  {selectedMarketplace.credentialSchema.map((field) => (
                    <div key={field.key}>
                      <Input
                        label={field.label}
                        type={field.type}
                        value={wizardCreds[field.key] || ""}
                        onChange={(e) => setWizardCreds({ ...wizardCreds, [field.key]: e.target.value })}
                      />
                      {field.helpText && <p className="text-xs text-text-muted mt-1">{field.helpText}</p>}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-4">
                    <Button variant="primary" onClick={() => setWizardStep(2)} className="flex-1">
                      {lang === "ru" ? "Далее" : "Keyingi"}
                    </Button>
                    <Button variant="ghost" onClick={closeModal}>{lang === "ru" ? "Отмена" : "Bekor"}</Button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{INTEGRATIONS_COPY.dataCoverage.title}</p>
                  <p className="text-xs text-text-muted">{INTEGRATIONS_COPY.dataCoverage.helper}</p>
                  
                  <div className="space-y-2">
                    {Object.entries(INTEGRATIONS_COPY.dataCoverage.checkboxes).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={wizardEnabledData[key as keyof typeof wizardEnabledData]}
                          onChange={(e) => setWizardEnabledData({
                            ...wizardEnabledData,
                            [key]: e.target.checked,
                          })}
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                  
                  <p className="text-xs text-text-muted">{INTEGRATIONS_COPY.dataCoverage.note}</p>
                  
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setWizardStep(3)} className="flex-1">
                      {lang === "ru" ? "Далее" : "Keyingi"}
                    </Button>
                    <Button variant="ghost" onClick={() => setWizardStep(1)}>{lang === "ru" ? "Назад" : "Orqaga"}</Button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{lang === "ru" ? "Шаг 3: Проверить подключение" : "3-qadam: Ulanishni tekshirish"}</p>
                  
                  {!testResult && (
                    <Button variant="primary" onClick={handleTestConnection} disabled={testing} className="w-full">
                      {testing ? (lang === "ru" ? "Проверка..." : "Tekshirilmoqda...") : (lang === "ru" ? "Проверить подключение" : "Ulanishni tekshirish")}
                    </Button>
                  )}
                  
                  {testResult && (
                    <div className={`p-4 rounded ${testResult.ok ? "bg-success/10 border border-success" : "bg-danger/10 border border-danger"}`}>
                      <p className={`font-semibold ${testResult.ok ? "text-success" : "text-danger"}`}>
                        {testResult.ok ? INTEGRATIONS_COPY.reconnect.testResults.ok : testResult.error}
                      </p>
                      {testResult.accountLabel && <p className="text-sm mt-1">{testResult.accountLabel}</p>}
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-4">
                    {testResult?.ok && (
                      <Button variant="primary" onClick={handleSaveConnection} className="flex-1">
                        {lang === "ru" ? "Сохранить и подключить" : "Saqlash va ulash"}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setWizardStep(2)}>{lang === "ru" ? "Назад" : "Orqaga"}</Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </Layout>
  );
}
