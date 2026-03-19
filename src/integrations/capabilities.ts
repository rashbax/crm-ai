import type {
  Connection,
  ConnectionCapability,
  ConnectionCapabilityKey,
  ConnectionSummary,
} from "./types";
import type { EnabledData } from "@/src/connectors/types";

export const DEFAULT_ENABLED_DATA: EnabledData = {
  orders: true,
  stocks: true,
  ads: true,
  prices: true,
};

function hasCredentialPayload(capability?: ConnectionCapability): boolean {
  if (!capability?.creds) return false;
  if (typeof capability.creds === "string") return capability.creds.trim().length > 0;
  return Object.values(capability.creds).some((value) => String(value || "").trim().length > 0);
}

export function normalizeEnabledData(value?: Partial<EnabledData> | null): EnabledData {
  return {
    orders: value?.orders ?? DEFAULT_ENABLED_DATA.orders,
    stocks: value?.stocks ?? DEFAULT_ENABLED_DATA.stocks,
    ads: value?.ads ?? DEFAULT_ENABLED_DATA.ads,
    prices: value?.prices ?? DEFAULT_ENABLED_DATA.prices,
  };
}

export function getCapabilityForDataType(
  marketplaceId: string,
  dataType: keyof EnabledData
): ConnectionCapabilityKey {
  if (marketplaceId === "ozon" && dataType === "ads") return "ads";
  return "core";
}

export function buildDefaultCapabilities(
  marketplaceId: string,
  creds: Record<string, string> | string,
  enabledData?: Partial<EnabledData>
): Partial<Record<ConnectionCapabilityKey, ConnectionCapability>> | undefined {
  if (marketplaceId !== "ozon") return undefined;

  return {
    core: {
      enabled: true,
      creds,
      enabledData: {
        orders: enabledData?.orders ?? true,
        stocks: enabledData?.stocks ?? true,
        prices: enabledData?.prices ?? true,
      },
    },
    ads: {
      enabled: false,
      enabledData: { ads: enabledData?.ads ?? false },
    },
    premium: {
      enabled: false,
    },
  };
}

export function getEffectiveEnabledData(connection: Connection): EnabledData {
  const base = normalizeEnabledData(connection.enabledData);
  if (!connection.capabilities) return base;

  const resolved: EnabledData = { ...base };
  (Object.keys(base) as Array<keyof EnabledData>).forEach((key) => {
    const capabilityKey = getCapabilityForDataType(connection.marketplaceId, key);
    const capability = connection.capabilities?.[capabilityKey];
    if (!capability) return;

    const capabilityAllows = capability.enabledData?.[key] ?? true;
    const hasCreds = capabilityKey === "premium" ? capability.enabled : hasCredentialPayload(capability);
    resolved[key] = resolved[key] && capability.enabled && capabilityAllows && hasCreds;
  });

  return resolved;
}

export function getCredentialsForDataType(
  connection: Connection,
  dataType: keyof EnabledData
): Record<string, string> | string | undefined {
  const capabilityKey = getCapabilityForDataType(connection.marketplaceId, dataType);
  const capability = connection.capabilities?.[capabilityKey];

  if (capability) {
    if (!capability.enabled) return undefined;
    return capability.creds;
  }

  return connection.creds;
}

export function sanitizeCapabilities(
  capabilities?: Partial<Record<ConnectionCapabilityKey, ConnectionCapability>>
): ConnectionSummary["capabilities"] | undefined {
  if (!capabilities) return undefined;

  const entries = Object.entries(capabilities).map(([key, capability]) => [
    key,
    {
      enabled: capability?.enabled ?? false,
      enabledData: capability?.enabledData,
      lastTestAt: capability?.lastTestAt,
      lastSyncAt: capability?.lastSyncAt,
      lastError: capability?.lastError,
      accountLabel: capability?.accountLabel,
    },
  ]);

  return Object.fromEntries(entries);
}
