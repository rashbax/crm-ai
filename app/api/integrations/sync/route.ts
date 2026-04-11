import { NextResponse } from 'next/server';
import path from 'path';
import { z } from 'zod';
import { syncMarketplace, syncAll } from '@/src/integrations/syncRunner';
import { getEffectiveEnabledData } from '@/src/integrations/capabilities';
import { findConnectionById } from '@/src/integrations/storage';
import { requireAuth } from '@/lib/auth-guard';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');
const Schema = z.object({
	connectionId: z.string().uuid().optional(),
	marketplace: z.string().min(1).max(50).optional(),
	force: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const parsed = Schema.safeParse(await request.json());
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

		const { marketplace, connectionId } = parsed.data;
		const isDryRun = process.env.DRY_RUN === '1';
		const warnings: string[] = [];
		if (isDryRun) warnings.push('Running in DEMO mode');

		let results;
		if (connectionId) {
			const connection = await findConnectionById(
				CONNECTIONS_FILE,
				connectionId,
			);
			if (!connection)
				return NextResponse.json({ ok: false, error: 'Connection not found' }, { status: 404 });
			if (!connection.enabled)
				return NextResponse.json({ ok: false, error: 'Connection is disabled' }, { status: 400 });

			// Ozon Performance ads sync is handled by daily cron — exclude from manual sync
			let enabledData = getEffectiveEnabledData(connection);
			if (connection.marketplaceId === 'ozon') {
				enabledData = { ...enabledData, ads: false };
			}
			const result = await syncMarketplace(
				connection.marketplaceId,
				enabledData,
				connection.id,
			);
			results = [result];
		} else if (marketplace) {
			// Ozon Performance ads sync is handled by daily cron — exclude from manual sync
			const result = await syncMarketplace(marketplace, {
				orders: true,
				stocks: true,
				ads: marketplace !== 'ozon',
				prices: true,
			});
			results = [result];
		} else {
			results = await syncAll({ excludeOzonAds: true });
		}

		const hasFailed = results.some((r: any) => !r.ok);
		return NextResponse.json(
			{ ok: !hasFailed, mode: isDryRun ? 'demo' : 'live', warnings, results },
			{ status: hasFailed ? 207 : 200 },
		);
	} catch (err) {
		console.error('Error syncing:', err);
		return NextResponse.json({ ok: false, error: 'Sync failed' }, { status: 500 });
	}
}
