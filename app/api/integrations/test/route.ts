import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: POST /api/integrations/test
 * Test marketplace connection
 */

import { NextResponse } from "next/server";
import { getMarketplace } from "@/src/marketplaces/registry";
import { getConnector } from "@/src/connectors";
import type { ConnectionCapabilityTestKey } from "@/src/connectors/types";

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    const body = await request.json();
    const { marketplace, marketplaceId, creds, capability } = body as {
      marketplace?: string;
      marketplaceId?: string;
      creds?: Record<string, string>;
      capability?: ConnectionCapabilityTestKey;
    };
    const selectedMarketplace = marketplaceId ?? marketplace;

    if (!selectedMarketplace || !creds) {
      return NextResponse.json(
        { ok: false, error: "Marketplace and credentials are required" },
        { status: 400 }
      );
    }

    // Validate marketplace exists
    const marketplaceDef = getMarketplace(selectedMarketplace);
    if (!marketplaceDef) {
      return NextResponse.json(
        { ok: false, error: "Invalid marketplace" },
        { status: 400 }
      );
    }

    // Get connector
    const connector = getConnector(marketplaceDef.connectorId);
    if (!connector) {
      return NextResponse.json(
        { ok: false, error: "Connector not found" },
        { status: 400 }
      );
    }

    // Test connection
    const result =
      capability && connector.testCapability
        ? await connector.testCapability(capability, creds)
        : await connector.testConnection(creds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}
