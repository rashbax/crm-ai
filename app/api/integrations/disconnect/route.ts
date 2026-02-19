import { NextResponse } from 'next/server';
import path from 'path';
import { z } from 'zod';
import { getMarketplace } from '@/src/marketplaces/registry';
import { getConnection, saveConnection, getStatus, saveStatus } from '@/src/integrations/storage';
import { requireAuth } from '@/lib/auth-guard';

const CREDS_FILE = path.join(process.cwd(), 'data', 'secure', 'integrations.json');
const STATUS_FILE = path.join(process.cwd(), 'data', 'secure', 'integrationStatus.json');

const Schema = z.object({ marketplace: z.string().min(1).max(50) });

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const parsed = Schema.safeParse(await request.json());
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

		const { marketplace } = parsed.data;
		if (!getMarketplace(marketplace))
			return NextResponse.json({ error: 'Invalid marketplace' }, { status: 400 });

		const connection = await getConnection(CREDS_FILE, marketplace);
		if (connection) await saveConnection(CREDS_FILE, marketplace, { ...connection, enabled: false });

		const status = await getStatus(STATUS_FILE, marketplace);
		if (status) await saveStatus(STATUS_FILE, marketplace, { ...status, connected: false });

		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error('Error disconnecting marketplace:', err);
		return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
	}
}
