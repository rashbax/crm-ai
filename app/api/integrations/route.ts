/**
 * API Route: GET /api/integrations
 * Returns catalog + connections — auth protected
 */

import { NextResponse } from 'next/server';
import { listMarketplaces } from '@/src/marketplaces/registry';
import { getAllConnections } from '@/src/integrations/enabled';
import { getEffectiveEnabledData, sanitizeCapabilities } from '@/src/integrations/capabilities';
import { requireAuth } from '@/lib/auth-guard';
import type { ConnectionSummary } from '@/src/integrations/types';

export async function GET() {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const isDryRun = process.env.DRY_RUN === '1';
		const mode = isDryRun ? 'demo' : 'live';
		const warnings: string[] = [];

		if (isDryRun) warnings.push('Running in DEMO mode - no real API connections');

		const catalog = listMarketplaces();
		const allConnections = await getAllConnections();

		// Never expose creds to the client
		const connections: ConnectionSummary[] = allConnections.map((conn) => ({
			id: conn.id,
			marketplaceId: conn.marketplaceId,
			name: conn.name,
			enabled: conn.enabled,
			enabledData: getEffectiveEnabledData(conn),
			lastTestAt: conn.lastTestAt,
			lastSyncAt: conn.lastSyncAt,
			lastError: conn.lastError,
			accountLabel: conn.accountLabel,
			createdAt: conn.createdAt,
			updatedAt: conn.updatedAt,
			capabilities: sanitizeCapabilities(conn.capabilities),
		}));

		if (connections.length === 0 && !isDryRun)
			warnings.push('No connections configured yet');

		return NextResponse.json({ mode, warnings, catalog, connections });
	} catch (error) {
		console.error('Error in integrations API:', error);
		return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 });
	}
}
