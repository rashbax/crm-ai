import { NextResponse } from "next/server";
import path from "path";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { encryptCredentials } from "@/lib/encryption";
import { getConnector } from "@/src/connectors";
import { getMarketplace } from "@/src/marketplaces/registry";
import { getConnections, saveConnections } from "@/src/integrations/storage";
import { sanitizeCapabilities } from "@/src/integrations/capabilities";
import { validateCredentials } from "@/src/integrations/validate";
import type {
  Connection,
  ConnectionCapability,
  ConnectionCapabilityKey,
} from "@/src/integrations/types";

const CONNECTIONS_FILE = path.join(process.cwd(), "data", "secure", "connections.json");

const CapabilitySchema = z.object({
  connectionId: z.string().uuid(),
  capability: z.enum(["core", "ads", "premium"]),
  enabled: z.boolean().optional(),
  creds: z.record(z.string(), z.string()).optional(),
  enabledData: z
    .object({
      orders: z.boolean().optional(),
      stocks: z.boolean().optional(),
      ads: z.boolean().optional(),
      prices: z.boolean().optional(),
    })
    .optional(),
});

function hasCredentialPayload(capability?: ConnectionCapability): boolean {
  if (!capability?.creds) return false;
  if (typeof capability.creds === "string") return capability.creds.trim().length > 0;
  return Object.values(capability.creds).some((value) => String(value || "").trim().length > 0);
}

function normalizeIncomingCreds(
  creds?: Record<string, string>
): Record<string, string> | undefined {
  if (!creds) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(creds).map(([key, value]) => [key, String(value || "").trim()])
  );
  const hasAnyValue = Object.values(normalized).some((value) => value.length > 0);
  return hasAnyValue ? normalized : undefined;
}

function defaultEnabledDataForCapability(
  capability: ConnectionCapabilityKey
): ConnectionCapability["enabledData"] | undefined {
  if (capability === "core") {
    return { orders: true, stocks: true, prices: true };
  }
  if (capability === "ads") {
    return { ads: true };
  }
  return undefined;
}

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = CapabilitySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { connectionId, capability, enabled, enabledData } = parsed.data;
    const creds = normalizeIncomingCreds(parsed.data.creds);
    const connections = await getConnections(CONNECTIONS_FILE);
    const index = connections.findIndex((entry: Connection) => entry.id === connectionId);

    if (index < 0) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const connection = connections[index] as Connection;
    const marketplaceDef = getMarketplace(connection.marketplaceId);
    if (!marketplaceDef) {
      return NextResponse.json({ error: "Marketplace not found" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextCapabilities = { ...(connection.capabilities || {}) };
    const previousCapability = nextCapabilities[capability];
    const nextCapability: ConnectionCapability = {
      enabled: enabled ?? previousCapability?.enabled ?? true,
      creds: previousCapability?.creds,
      enabledData:
        enabledData ??
        previousCapability?.enabledData ??
        defaultEnabledDataForCapability(capability),
      lastTestAt: previousCapability?.lastTestAt,
      lastSyncAt: previousCapability?.lastSyncAt,
      lastError: previousCapability?.lastError,
      accountLabel: previousCapability?.accountLabel,
    };

    if (creds) {
      const connector = getConnector(marketplaceDef.connectorId);
      if (!connector) {
        return NextResponse.json({ error: "Connector not found" }, { status: 400 });
      }

      if (capability === "core") {
        const validation = validateCredentials(marketplaceDef.credentialSchema, creds);
        if (!validation.valid) {
          return NextResponse.json(
            { error: "Invalid credentials", details: validation.errors },
            { status: 400 }
          );
        }
      }

      const testResult =
        capability !== "core" && connector.testCapability
          ? await connector.testCapability(capability, creds)
          : await connector.testConnection(creds);
      if (!testResult.ok) {
        return NextResponse.json(
          { error: testResult.error || "Connection test failed" },
          { status: 400 }
        );
      }

      nextCapability.creds = encryptCredentials(creds);
      nextCapability.lastTestAt = now;
      nextCapability.lastError = undefined;
      nextCapability.accountLabel =
        testResult.accountLabel || `${marketplaceDef.title} ${capability}`;

      if (capability === "core") {
        connection.creds = nextCapability.creds;
        connection.lastTestAt = now;
        connection.lastError = undefined;
        connection.accountLabel = testResult.accountLabel;
      }
    } else if ((enabled ?? previousCapability?.enabled) && !hasCredentialPayload(nextCapability)) {
      return NextResponse.json(
        { error: `Credentials are required to enable ${capability}` },
        { status: 400 }
      );
    }

    if (enabled === false) {
      nextCapability.lastError = undefined;
    }

    nextCapabilities[capability] = nextCapability;
    connections[index] = {
      ...connection,
      capabilities: nextCapabilities,
      updatedAt: now,
    };

    await saveConnections(CONNECTIONS_FILE, connections);

    return NextResponse.json({
      ok: true,
      connection: {
        id: connections[index].id,
        marketplaceId: connections[index].marketplaceId,
        name: connections[index].name,
        enabled: connections[index].enabled,
        enabledData: connections[index].enabledData,
        lastTestAt: connections[index].lastTestAt,
        lastSyncAt: connections[index].lastSyncAt,
        lastError: connections[index].lastError,
        accountLabel: connections[index].accountLabel,
        createdAt: connections[index].createdAt,
        updatedAt: connections[index].updatedAt,
        capabilities: sanitizeCapabilities(nextCapabilities),
      },
    });
  } catch (err) {
    console.error("Error updating integration capability:", err);
    return NextResponse.json({ error: "Failed to update capability" }, { status: 500 });
  }
}
