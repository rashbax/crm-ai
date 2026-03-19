/**
 * API Route: POST /api/integrations/connect
 * Create or update a connection — auth protected, credentials encrypted
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import path from 'path';
import { z } from 'zod';
import { getMarketplace } from '@/src/marketplaces/registry';
import { getConnector } from '@/src/connectors';
import { validateCredentials } from '@/src/integrations/validate';
import { getConnections, saveConnections } from '@/src/integrations/storage';
import { buildDefaultCapabilities, normalizeEnabledData, sanitizeCapabilities } from '@/src/integrations/capabilities';
import { encryptCredentials } from '@/lib/encryption';
import { requireAuth } from '@/lib/auth-guard';
import type { Connection, ConnectionCapabilityKey } from '@/src/integrations/types';
import { syncMarketplace } from '@/src/integrations/syncRunner';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');

const ConnectSchema = z.object({
	marketplaceId: z.string().min(1).max(50),
	name: z.string().max(255).optional(),
	creds: z.record(z.string(), z.string()),
	enabledData: z.object({
		orders: z.boolean().optional(),
		stocks: z.boolean().optional(),
		ads: z.boolean().optional(),
		prices: z.boolean().optional(),
	}).optional(),
	capabilities: z
		.record(
			z.enum(["core", "ads", "premium"]),
			z.object({
				enabled: z.boolean().default(true),
				creds: z.record(z.string(), z.string()).optional(),
				enabledData: z
					.object({
						orders: z.boolean().optional(),
						stocks: z.boolean().optional(),
						ads: z.boolean().optional(),
						prices: z.boolean().optional(),
					})
					.optional(),
			}),
		)
		.optional(),
});

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const raw = await request.json();
		const parsed = ConnectSchema.safeParse(raw);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const { marketplaceId, name, creds, enabledData, capabilities } = parsed.data;

		const marketplaceDef = getMarketplace(marketplaceId);
		if (!marketplaceDef)
			return NextResponse.json({ error: 'Invalid marketplace - not in catalog' }, { status: 400 });

		const validation = validateCredentials(marketplaceDef.credentialSchema, creds);
		if (!validation.valid)
			return NextResponse.json({ error: 'Invalid credentials', details: validation.errors }, { status: 400 });

		const connector = getConnector(marketplaceDef.connectorId);
		if (!connector)
			return NextResponse.json({ error: 'Connector not found' }, { status: 400 });

		const testResult = await connector.testConnection(creds);
		if (!testResult.ok) {
			return NextResponse.json(
				{ error: testResult.error || 'Connection test failed' },
				{ status: 400 },
			);
		}

		// Encrypt before saving
		const encryptedCreds = encryptCredentials(creds);
		const normalizedEnabledData = normalizeEnabledData(enabledData || marketplaceDef.capabilities);
		const normalizedCapabilities = capabilities
			? Object.fromEntries(
					Object.entries(capabilities).map(([key, capability]) => [
						key as ConnectionCapabilityKey,
						{
							enabled: capability.enabled,
							creds: capability.creds ? encryptCredentials(capability.creds) : undefined,
							enabledData: capability.enabledData,
						},
					]),
			  )
			: buildDefaultCapabilities(marketplaceId, encryptedCreds, normalizedEnabledData);

		const loadedConnections = await getConnections(CONNECTIONS_FILE);
		const connections = Array.isArray(loadedConnections) ? loadedConnections : [];
		const existingIndex = connections.findIndex((c) => c.marketplaceId === marketplaceId);
		const now = new Date().toISOString();
		const connectionName = name || marketplaceDef.title;

		if (existingIndex >= 0) {
			const existing = connections[existingIndex];
			connections[existingIndex] = {
				...existing,
				name: connectionName,
				enabled: true,
				enabledData: normalizedEnabledData,
				creds: encryptedCreds,
				capabilities: normalizedCapabilities,
				updatedAt: now,
				lastTestAt: now,
				lastError: testResult.error,
				accountLabel: testResult.accountLabel,
			};
			await saveConnections(CONNECTIONS_FILE, connections);
			await syncMarketplace(marketplaceId, normalizedEnabledData, existing.id);
			return NextResponse.json({
				id: existing.id, marketplaceId, name: connectionName, enabled: true,
				enabledData: normalizedEnabledData,
				lastTestAt: now, lastError: testResult.error, accountLabel: testResult.accountLabel,
				createdAt: existing.createdAt, updatedAt: now, capabilities: sanitizeCapabilities(normalizedCapabilities),
			});
		} else {
			const newConnection: Connection = {
				id: randomUUID(), marketplaceId, name: connectionName, enabled: true,
				enabledData: normalizedEnabledData,
				creds: encryptedCreds,
				capabilities: normalizedCapabilities,
				createdAt: now, updatedAt: now, lastTestAt: now,
				lastError: testResult.error, accountLabel: testResult.accountLabel,
			};
			connections.push(newConnection);
			await saveConnections(CONNECTIONS_FILE, connections);
			await syncMarketplace(marketplaceId, normalizedEnabledData, newConnection.id);
			return NextResponse.json({
				id: newConnection.id, marketplaceId, name: connectionName, enabled: true,
				enabledData: normalizedEnabledData,
				lastTestAt: now, lastError: testResult.error, accountLabel: testResult.accountLabel,
				createdAt: now, updatedAt: now, capabilities: sanitizeCapabilities(normalizedCapabilities),
			});
		}
	} catch (err) {
		console.error('Error connecting marketplace:', err);
		const message = err instanceof Error ? err.message : 'Failed to connect';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
