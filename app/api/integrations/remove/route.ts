import { NextResponse } from 'next/server';
import path from 'path';
import { z } from 'zod';
import { findConnectionById, removeConnection, readJsonFile, writeJsonFile } from '@/src/integrations/storage';
import { requireAuth } from '@/lib/auth-guard';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');
const ORDERS_FILE = path.join(process.cwd(), 'data', 'canonical', 'orders.json');
const STOCKS_FILE = path.join(process.cwd(), 'data', 'canonical', 'stocks.json');
const ADS_FILE = path.join(process.cwd(), 'data', 'canonical', 'ads.json');
const PRICES_FILE = path.join(process.cwd(), 'data', 'canonical', 'prices.json');

const Schema = z.object({ connectionId: z.string().uuid(), deleteData: z.boolean().optional().default(false) });

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const parsed = Schema.safeParse(await request.json());
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

		const { connectionId, deleteData } = parsed.data;
		const connection = await findConnectionById(CONNECTIONS_FILE, connectionId);
		if (!connection)
			return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

		await removeConnection(CONNECTIONS_FILE, connectionId);

		if (deleteData) {
			for (const file of [ORDERS_FILE, STOCKS_FILE, ADS_FILE, PRICES_FILE]) {
				const items = await readJsonFile<any[]>(file, []);
				await writeJsonFile(file, items.filter((i) => i.connectionId !== connectionId));
			}
		}

		return NextResponse.json({
			ok: true,
			message: deleteData ? 'Connection and data removed' : 'Connection removed (data preserved)',
			connectionId, dataDeleted: deleteData,
		});
	} catch (err) {
		console.error('Error removing connection:', err);
		return NextResponse.json({ error: 'Failed to remove connection' }, { status: 500 });
	}
}
