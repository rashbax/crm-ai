import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '@/lib/auth-guard';
import { readJsonFile } from '@/src/integrations/storage';
import type { Connection } from '@/src/integrations/types';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');
const CANONICAL_DIR = path.join(process.cwd(), 'data', 'canonical');

interface ConnectionsData {
	connections: Connection[];
}

type Freshness = 'fresh' | 'stale' | 'critical';
type FlowKey = 'orders' | 'stocks' | 'ads' | 'prices';

const FRESHNESS_THRESHOLDS = {
	fresh: 6 * 60 * 60 * 1000,    // 6 hours
	stale: 24 * 60 * 60 * 1000,   // 24 hours
};

// Which modules depend on each data flow
const FLOW_DEPENDENCIES: Record<FlowKey, string[]> = {
	orders: ['orders', 'finance'],
	stocks: ['products', 'prices'],
	ads: ['promo'],
	prices: ['prices'],
};

function calcFreshness(lastSyncAt: string | undefined | null, hasError?: boolean): Freshness {
	if (!lastSyncAt) return 'critical';
	if (hasError) return 'critical';
	const age = Date.now() - new Date(lastSyncAt).getTime();
	if (age <= FRESHNESS_THRESHOLDS.fresh) return 'fresh';
	if (age <= FRESHNESS_THRESHOLDS.stale) return 'stale';
	return 'critical';
}

function getCanonicalFileTime(flowKey: FlowKey): string | null {
	try {
		const filePath = path.join(CANONICAL_DIR, `${flowKey}.json`);
		const stat = fs.statSync(filePath);
		return stat.mtime.toISOString();
	} catch {
		return null;
	}
}

function getConnectionStatus(c: Connection): 'connected' | 'disconnected' | 'error' {
	if (!c.enabled) return 'disconnected';
	if (c.lastError) return 'error';
	return 'connected';
}

export async function GET() {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const data = await readJsonFile<ConnectionsData>(CONNECTIONS_FILE, { connections: [] });
		const allConnections = data.connections || [];
		// Only WB and Ozon for MVP
		const connections = allConnections.filter(
			(c) => c.marketplaceId === 'wb' || c.marketplaceId === 'ozon'
		);

		if (connections.length === 0) {
			return NextResponse.json({ lastSyncAt: null, connections: [] });
		}

		const syncTimes = connections
			.filter((c) => c.enabled)
			.map((c) => c.lastSyncAt)
			.filter(Boolean)
			.sort()
			.reverse();

		const lastSyncAt = syncTimes[0] || null;

		const result = connections.map((c) => {
			const flowKeys: FlowKey[] = ['orders', 'stocks', 'ads', 'prices'];
			const flows: Record<string, unknown> = {};

			for (const fk of flowKeys) {
				const enabled = c.enabledData?.[fk] ?? false;
				const canonicalTime = getCanonicalFileTime(fk);

				// For Ozon ads flow, check if Performance API capability is actually connected
				const needsSeparateCreds = c.marketplaceId === 'ozon' && fk === 'ads';
				const adsCap = c.capabilities?.ads;
				const adsCapConnected = adsCap?.enabled && adsCap?.creds;
				const flowActuallyEnabled = enabled && (!needsSeparateCreds || !!adsCapConnected);

				// Use capability-specific sync time for ads.
				// Ozon ads run on their own daily schedule — do NOT fall back to connection's
				// lastSyncAt or it will show "just now" after a manual sync that skipped ads.
				const capSyncAt = needsSeparateCreds && adsCap ? (adsCap.lastSyncAt || null) : null;
				const flowSyncAt = flowActuallyEnabled
					? (needsSeparateCreds ? capSyncAt : (capSyncAt || c.lastSyncAt || null))
					: null;
				const capError = needsSeparateCreds && adsCap ? (adsCap.lastError || null) : null;
				const flowError = flowActuallyEnabled ? (capError || c.lastError || null) : null;

				let freshness: Freshness;
				if (!flowActuallyEnabled) {
					freshness = 'critical';
				} else if (needsSeparateCreds && !adsCapConnected) {
					freshness = 'critical';
				} else {
					freshness = calcFreshness(flowSyncAt, !!flowError);
				}

				flows[fk] = {
					enabled: flowActuallyEnabled,
					lastSyncAt: flowSyncAt,
					lastError: needsSeparateCreds && !adsCapConnected
						? (c.marketplaceId === 'ozon' ? 'Performance API не подключён' : null)
						: flowError,
					freshness,
					canonicalUpdatedAt: canonicalTime,
					dependentModules: FLOW_DEPENDENCIES[fk],
				};
			}

			const overallFreshness = calcFreshness(c.lastSyncAt, !!c.lastError);

			return {
				id: c.id,
				marketplace: c.marketplaceId,
				name: c.name || c.accountLabel || c.marketplaceId,
				enabled: c.enabled,
				status: getConnectionStatus(c),
				lastSyncAt: c.lastSyncAt || null,
				lastError: c.lastError || null,
				accountLabel: c.accountLabel || null,
				freshness: overallFreshness,
				flows,
			};
		});

		return NextResponse.json({
			lastSyncAt,
			connections: result,
		});
	} catch {
		return NextResponse.json({ lastSyncAt: null, connections: [] });
	}
}
