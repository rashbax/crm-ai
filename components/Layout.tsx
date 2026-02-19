'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Topbar from './Topbar';
import Navigation from './Navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const { data: session, status } = useSession();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);

		// Redirect to login if not authenticated
		if (status === 'unauthenticated') {
			router.replace('/login');
		}
	}, [status, router]);

	// Show loading while checking auth
	if (!ready || status === 'loading') {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-text-muted">Loading...</p>
			</div>
		);
	}

	// Don't render if not authenticated
	if (!session) {
		return null;
	}

	return (
		<div className="app-shell">
			<Topbar />
			<Navigation />
			<main className="main">{children}</main>
		</div>
	);
}
