import { NextResponse } from 'next/server';
import path from 'path';
import { z } from 'zod';
import { findConnectionById, updateConnection } from '@/src/integrations/storage';
import { requireAuth } from '@/lib/auth-guard';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');
const Schema = z.object({ connectionId: z.string().uuid(), enabled: z.boolean() });

export async function POST(request: Request) {
	const { error } = await requireAuth();
	if (error) return error;

	try {
		const parsed = Schema.safeParse(await request.json());
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

		const { connectionId, enabled } = parsed.data;
		const connection = await findConnectionById(CONNECTIONS_FILE, connectionId);
		if (!connection)
			return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

		await updateConnection(CONNECTIONS_FILE, connectionId, { enabled });
		return NextResponse.json({ id: connectionId, enabled, message: enabled ? 'Connection enabled' : 'Connection disabled' });
	} catch (err) {
		console.error('Error toggling connection:', err);
		return NextResponse.json({ error: 'Failed to toggle connection' }, { status: 500 });
	}
}
