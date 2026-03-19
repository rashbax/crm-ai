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
  capabilities?: Partial<Record<CapabilityKey, CapabilityStatus>>;
}

type CapabilityKey = "core" | "ads" | "premium";

interface CapabilityStatus {
  enabled: boolean;
  enabledData?: Partial<Connection["enabledData"]>;
  lastTestAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  accountLabel?: string;
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

type ModalType =
  | "disconnect"
  | "remove-step1"
  | "remove-step2"
  | "catalog"
  | "wizard"
  | "capability"
  | null;

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  core: "Core API",
  ads: "Ads API",
  premium: "Premium API",
};

const CAPABILITY_HELP: Record<CapabilityKey, string> = {
  core: "Orders, stocks, and prices use the main seller API credentials.",
  ads: "Ads spend and campaign analytics use separate Ozon Ads credentials.",
  premium: "Competitor and premium intelligence can be connected separately when available.",
};

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
  const [selectedCapability, setSelectedCapability] = useState<CapabilityKey | null>(null);
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
  const [savingCapability, setSavingCapability] = useState(false);
  
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    setLang(storage.getLang());
    loadIntegrations(true);
  }, []);

  const connectedMarketplaceIds = useMemo(
    () => new Set(connections.map((c) => c.marketplaceId)),
    [connections]
  );

  const availableCatalog = useMemo(
    () => catalog.filter((mp) => !connectedMarketplaceIds.has(mp.id)),
    [catalog, connectedMarketplaceIds]
  );
  const copy = useMemo(() => INTEGRATIONS_COPY[lang] ?? INTEGRATIONS_COPY.ru, [lang]);

  const loadIntegrations = async (showPageLoader = false) => {
    try {
      if (showPageLoader) {
        setLoading(true);
      }
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
      if (showPageLoader) {
        setLoading(false);
      }
    }
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedConnection(null);
    setSelectedMarketplace(null);
    setSelectedCapability(null);
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
        showToast(copy.disconnect.successToast, "success");
        await loadIntegrations();
        closeModal();
      }
    } catch (error) {
      console.error("Error disconnecting:", error);
      showToast(copy.toasts.disconnectError, "error");
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
          ? copy.removeConfirm.successToast
          : copy.remove.successToastKeep;
        showToast(successMessage, "success");
        await loadIntegrations();
        closeModal();
      }
    } catch (error) {
      console.error("Error removing:", error);
      showToast(copy.toasts.removeError, "error");
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

      showToast(copy.toasts.reconnectSuccess, "success");
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
        showToast(copy.toasts.syncSuccess, "success");
        await loadIntegrations();
      } else if (response.ok && !syncOk) {
        const warningText = syncWarnings.length > 0 ? syncWarnings[0] : null;
        showToast(
          warningText || copy.toasts.syncWarning,
          "info"
        );
        await loadIntegrations();
      } else {
        showToast(
          result?.error || copy.toasts.syncError,
          "error"
        );
      }
      setSyncingConnectionId(null);
    } catch (error) {
      console.error("Error syncing:", error);
      setSyncingConnectionId(null);
      showToast(copy.toasts.syncError, "error");
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
      setTestResult({ ok: false, error: copy.toasts.testError });
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
        showToast(copy.toasts.connectSuccess, "success");
        await loadIntegrations();
        closeModal();
      } else {
        const apiError =
          result?.error ||
          copy.toasts.saveError;
        showToast(apiError, "error");
      }
    } catch (error) {
      console.error("Error saving:", error);
      showToast(copy.toasts.saveError, "error");
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
    
    if (diffMinutes < 1) return copy.time.justNow;
    if (diffMinutes < 60) return copy.time.minutesAgo(diffMinutes);
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return copy.time.hoursAgo(diffHours);
    const diffDays = Math.floor(diffHours / 24);
    return copy.time.daysAgo(diffDays);
  };

  const getCapabilityFields = (
    marketplace: MarketplaceDef,
    capability: CapabilityKey
  ) => {
    if (marketplace.id !== "ozon") {
      return marketplace.credentialSchema;
    }

    return marketplace.credentialSchema.map((field) => {
      if (capability === "ads") {
        return {
          ...field,
          helpText:
            field.key === "apiKey"
              ? "Use the separate Ozon Ads API key for campaign statistics."
              : field.helpText,
        };
      }

      if (capability === "premium") {
        return {
          ...field,
          helpText:
            field.key === "apiKey"
              ? "Use the credential or key that Ozon issued for premium or competitor data access."
              : field.helpText,
        };
      }

      return field;
    });
  };

  const openCapabilityModal = (
    connection: Connection,
    marketplace: MarketplaceDef,
    capability: CapabilityKey
  ) => {
    setSelectedConnection(connection);
    setSelectedMarketplace(marketplace);
    setSelectedCapability(capability);
    setWizardCreds({});
    setTestResult(null);
    setModalType("capability");
  };

  const handleSaveCapability = async (enabled: boolean) => {
    if (!selectedConnection || !selectedCapability) return;
    if (enabled && !testResult?.ok) {
      showToast("Test the capability before saving", "info");
      return;
    }

    setSavingCapability(true);
    try {
      const response = await fetch("/api/integrations/capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          capability: selectedCapability,
          enabled,
          creds: enabled ? wizardCreds : undefined,
        }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok) {
        showToast(
          enabled
            ? `${CAPABILITY_LABELS[selectedCapability]} saved`
            : `${CAPABILITY_LABELS[selectedCapability]} disabled`,
          "success"
        );
        await loadIntegrations();
        closeModal();
      } else {
        showToast(result?.error || "Failed to update capability", "error");
      }
    } catch (error) {
      console.error("Error saving capability:", error);
      showToast("Failed to update capability", "error");
    } finally {
      setSavingCapability(false);
    }
  };

  const handleTestCapability = async () => {
    if (!selectedMarketplace || !selectedCapability) return;

    setTesting(true);
    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceId: selectedMarketplace.id,
          capability: selectedCapability,
          creds: wizardCreds,
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ ok: false, error: "Capability test failed" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-text-muted">{copy.page.loading}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{copy.page.title}</h1>
          <p className="page-subtitle">{copy.addButton.helper}</p>
        </div>
        <Button variant="primary" onClick={() => setModalType("catalog")}>
          {copy.addButton.title}
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
            <p className="text-xl font-semibold text-text-main">{copy.emptyState.title}</p>
            <p className="text-text-muted mt-2">{copy.emptyState.body}</p>
          </div>
          <Button variant="primary" onClick={() => setModalType("catalog")}>
            {copy.addButton.title}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {connections.map((conn) => {
            const marketplace = catalog.find((m) => m.id === conn.marketplaceId);
            const status = getConnectionStatus(conn);
            const statusInfo = copy.status[status];
            const isSyncing = syncingConnectionId === conn.id;

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
                          variant={status === "connected" ? "success" : status === "error" ? "danger" : "warning"}
                        >
                          {statusInfo.label}
                        </Badge>
                        {conn.lastSyncAt && status === "connected" && (
                          <span className="text-xs text-text-muted">
                            {copy.labels.lastSyncShort} {formatTimestamp(conn.lastSyncAt)}
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
                  {conn.capabilities && (
                    <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
                      {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((capabilityKey) => {
                        const capability = conn.capabilities?.[capabilityKey];
                        if (!capability) return null;

                        const capabilityStatus = capability.enabled ? "Connected" : "Not connected";
                        const canConfigure = Boolean(marketplace) && conn.marketplaceId === "ozon";

                        return (
                          <div key={capabilityKey} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text-main">
                                {CAPABILITY_LABELS[capabilityKey]}
                              </p>
                              <p className="text-xs text-text-muted">
                                {capability.accountLabel || CAPABILITY_HELP[capabilityKey]}
                              </p>
                              {capability.lastError && (
                                <p className="mt-1 text-xs text-danger">{capability.lastError}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge variant={capability.enabled ? "success" : "warning"}>
                                {capabilityStatus}
                              </Badge>
                              {canConfigure && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (!marketplace) return;
                                    openCapabilityModal(conn, marketplace, capabilityKey);
                                  }}
                                >
                                  {capability.enabled ? "Edit" : "Connect"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {conn.enabled ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => handleSync(conn.id)} disabled={isSyncing} className="gap-2">
                          {isSyncing && (
                            <span
                              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                              aria-hidden="true"
                            />
                          )}
                          {isSyncing
                            ? copy.labels.syncing
                            : copy.labels.sync}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedConnection(conn);
                            setModalType("disconnect");
                          }}
                        >
                          {copy.labels.disconnect}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => {
                        setSelectedConnection(conn);
                        handleReconnect();
                      }}>
                        {copy.labels.reconnect}
                      </Button>
                    )}
                    
                    {conn.lastError && (
                      <Button size="sm" variant="primary">
                        {copy.reconnect.buttonLabel}
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
                      {copy.labels.remove}
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
              <CardTitle>{copy.disconnect.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2 mb-6">
                {copy.disconnect.bullets.map((bullet, i) => (
                  <li key={i} className="text-sm text-text-muted flex gap-2">
                    <span>•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {copy.disconnect.cancelButton}
                </Button>
                <Button variant="danger" onClick={handleDisconnect} className="flex-1">
                  {copy.disconnect.confirmButton}
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
              <CardTitle>{copy.remove.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-muted mb-4">{copy.remove.body}</p>
              
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
                    <p className="font-medium text-sm">{copy.remove.options.keep.label}</p>
                    <p className="text-xs text-text-muted">{copy.remove.options.keep.description}</p>
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
                    <p className="font-medium text-sm text-danger">{copy.remove.options.delete.label}</p>
                    <p className="text-xs text-text-muted">{copy.remove.options.delete.description}</p>
                  </div>
                </label>
              </div>
              
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {copy.remove.cancelButton}
                </Button>
                <Button variant="danger" onClick={handleRemoveStep1Continue} className="flex-1">
                  {copy.remove.continueButton}
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
              <CardTitle className="text-danger">{copy.removeConfirm.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm font-semibold mb-2">{copy.removeConfirm.body}</p>
              <ul className="space-y-1 mb-3">
                {copy.removeConfirm.items.map((item, i) => (
                  <li key={i} className="text-sm text-text-muted flex gap-2">
                    <span>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-text-muted mb-4">{copy.removeConfirm.note}</p>
              
              <p className="text-sm font-semibold mb-2">{copy.removeConfirm.instruction}</p>
              <Input
                type="text"
                placeholder={copy.removeConfirm.placeholder}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mb-4"
              />
              
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} className="flex-1">
                  {copy.removeConfirm.cancelButton}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleRemoveFinal(true)}
                  disabled={deleteConfirmText !== "DELETE"}
                  className="flex-1"
                >
                  {copy.removeConfirm.confirmButton}
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
              <CardTitle>{copy.catalog.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                {availableCatalog.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">
                    {copy.catalog.allConnected}
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
                  {copy.labels.cancel}
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
              <CardTitle>{copy.wizard.connectTitle(selectedMarketplace.title)}</CardTitle>
            </CardHeader>
            <CardBody>
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{copy.wizard.step1}</p>
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
                      {copy.labels.next}
                    </Button>
                    <Button variant="ghost" onClick={closeModal}>{copy.labels.cancel}</Button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{copy.dataCoverage.title}</p>
                  <p className="text-xs text-text-muted">{copy.dataCoverage.helper}</p>
                  
                  <div className="space-y-2">
                    {Object.entries(copy.dataCoverage.checkboxes).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={wizardEnabledData[key as keyof typeof wizardEnabledData]}
                          onChange={(e) => setWizardEnabledData({
                            ...wizardEnabledData,
                            [key]: e.target.checked,
                          })}
                        />
                        <span className="text-sm">{String(label)}</span>
                      </label>
                    ))}
                  </div>
                  
                  <p className="text-xs text-text-muted">{copy.dataCoverage.note}</p>
                  
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setWizardStep(3)} className="flex-1">
                      {copy.labels.next}
                    </Button>
                    <Button variant="ghost" onClick={() => setWizardStep(1)}>{copy.labels.back}</Button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">{copy.wizard.step3}</p>
                  
                  {!testResult && (
                    <Button variant="primary" onClick={handleTestConnection} disabled={testing} className="w-full">
                      {testing ? copy.wizard.testing : copy.wizard.testConnection}
                    </Button>
                  )}
                  
                  {testResult && (
                    <div className={`p-4 rounded ${testResult.ok ? "bg-success/10 border border-success" : "bg-danger/10 border border-danger"}`}>
                      <p className={`font-semibold ${testResult.ok ? "text-success" : "text-danger"}`}>
                        {testResult.ok ? copy.reconnect.testResults.ok : testResult.error}
                      </p>
                      {testResult.accountLabel && <p className="text-sm mt-1">{testResult.accountLabel}</p>}
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-4">
                    {testResult?.ok && (
                      <Button variant="primary" onClick={handleSaveConnection} className="flex-1">
                        {copy.labels.saveAndConnect}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setWizardStep(2)}>{copy.labels.back}</Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {modalType === "capability" && selectedMarketplace && selectedConnection && selectedCapability && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>
                {selectedMarketplace.title}: {CAPABILITY_LABELS[selectedCapability]}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-2 text-sm text-text-muted">
                {CAPABILITY_HELP[selectedCapability]}
              </p>
              <p className="mb-4 text-xs text-text-muted">
                Separate capability credentials are saved independently. Sync will use them only for the matching data domain.
              </p>

              <div className="space-y-4">
                {getCapabilityFields(selectedMarketplace, selectedCapability).map((field) => (
                  <div key={`${selectedCapability}-${field.key}`}>
                    <Input
                      label={field.label}
                      type={field.type}
                      value={wizardCreds[field.key] || ""}
                      onChange={(e) => {
                        setWizardCreds({ ...wizardCreds, [field.key]: e.target.value });
                        setTestResult(null);
                      }}
                    />
                    {field.helpText && (
                      <p className="mt-1 text-xs text-text-muted">{field.helpText}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleTestCapability}
                  disabled={testing || savingCapability}
                >
                  {testing ? "Testing..." : "Test"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleSaveCapability(true)}
                  disabled={savingCapability || !testResult?.ok}
                  className="flex-1"
                >
                  {savingCapability ? "Saving..." : "Save capability"}
                </Button>
                {selectedConnection.capabilities?.[selectedCapability]?.enabled && (
                  <Button
                    variant="danger"
                    onClick={() => handleSaveCapability(false)}
                    disabled={savingCapability}
                  >
                    Disable
                  </Button>
                )}
                <Button variant="ghost" onClick={closeModal}>
                  {copy.labels.cancel}
                </Button>
              </div>
              {testResult && (
                <div
                  className={`mt-4 rounded border p-4 ${
                    testResult.ok
                      ? "border-success bg-success/10"
                      : "border-danger bg-danger/10"
                  }`}
                >
                  <p className={testResult.ok ? "text-success" : "text-danger"}>
                    {testResult.ok ? "Capability test passed" : testResult.error}
                  </p>
                  {testResult.accountLabel && (
                    <p className="mt-1 text-sm text-text-main">{testResult.accountLabel}</p>
                  )}
                  {testResult.warning && (
                    <p className="mt-1 text-xs text-text-muted">{testResult.warning}</p>
                  )}
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
