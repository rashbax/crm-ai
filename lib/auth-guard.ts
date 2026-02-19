import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function requireAuth(): Promise<
	| { session: Awaited<ReturnType<typeof getServerSession>>; error: null }
	| { session: null; error: NextResponse }
> {
	const session = await getServerSession(authOptions);
	if (!session) {
		return {
			session: null,
			error: NextResponse.json(
				{ error: 'Unauthorized — please log in' },
				{ status: 401 },
			),
		};
	}
	return { session, error: null };
}
