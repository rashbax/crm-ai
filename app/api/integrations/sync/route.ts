import { NextResponse } from 'next/server';
import path from 'path';
import { z } from 'zod';
import { syncMarketplace, syncAll } from '@/src/integrations/syncRunner';
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

			const result = await syncMarketplace(
				connection.marketplaceId,
				connection.enabledData || {
					orders: true,
					stocks: true,
					ads: true,
					prices: true,
				},
				connection.id,
			);
			results = [result];
		} else if (marketplace) {
			const result = await syncMarketplace(marketplace, {
				orders: true,
				stocks: true,
				ads: true,
				prices: true,
			});
			results = [result];
		} else {
			results = await syncAll();
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
