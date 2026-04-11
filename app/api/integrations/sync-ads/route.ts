import { NextResponse } from 'next/server';
import path from 'path';
import { syncMarketplace } from '@/src/integrations/syncRunner';
import { getConnections, updateConnection } from '@/src/integrations/storage';
import { requireAuth } from '@/lib/auth-guard';
import type { Connection } from '@/src/integrations/types';

const CONNECTIONS_FILE = path.join(process.cwd(), 'data', 'secure', 'connections.json');

export async function POST(request: Request) {
  // Accept either Vercel cron Bearer token OR a valid user session
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const isCron = secret && auth === `Bearer ${secret}`;

  if (!isCron) {
    const { error } = await requireAuth();
    if (error) return error;
  }

  try {
    const connections = await getConnections(CONNECTIONS_FILE);
    const ozonConnections = (connections as Connection[]).filter(
      (c) => c.enabled && c.marketplaceId === 'ozon'
    );

    if (ozonConnections.length === 0) {
      return NextResponse.json({ ok: true, message: 'No enabled Ozon connections', results: [] });
    }

    const results = await Promise.all(
      ozonConnections.map(async (connection) => {
        const result = await syncMarketplace(
          'ozon',
          { orders: false, stocks: false, ads: true, prices: false },
          connection.id
        );
        // Write adsCap.lastSyncAt so the integrations page shows the correct ads sync time
        if (result.ok && connection.capabilities?.ads) {
          const fresh = await getConnections(CONNECTIONS_FILE);
          const conn = (fresh as Connection[]).find((c) => c.id === connection.id);
          if (conn?.capabilities?.ads) {
            await updateConnection(CONNECTIONS_FILE, connection.id, {
              capabilities: {
                ...conn.capabilities,
                ads: { ...conn.capabilities.ads, lastSyncAt: new Date().toISOString() },
              },
            });
          }
        }
        return result;
      })
    );

    const hasFailed = results.some((r) => !r.ok);
    return NextResponse.json(
      { ok: !hasFailed, results },
      { status: hasFailed ? 207 : 200 }
    );
  } catch (err) {
    console.error('Ozon ads sync failed:', err);
    return NextResponse.json({ ok: false, error: 'Ads sync failed' }, { status: 500 });
  }
}
