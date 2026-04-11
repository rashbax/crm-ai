'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { getTranslation } from '@/lib/translations';
import type { Language } from '@/types';
import { Card, CardHeader, CardBody, CardTitle, Button, Input } from '@/components/ui';

export default function LoginPage() {
	const router = useRouter();
	const [lang, setLang] = useState<Language>('ru');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		// Auto-detect: use saved preference, otherwise fall back to browser language
		const saved = storage.getLang();
		if (saved) {
			setLang(saved);
		} else {
			const browser = navigator.language.toLowerCase();
			setLang(browser.startsWith('uz') ? 'uz' : 'ru');
		}
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setLoading(true);
		try {
			const result = await signIn('credentials', { username, password, redirect: false });
			if (result?.error) {
				setError(getTranslation(lang, 'login_error'));
			} else if (result?.ok) {
				router.push('/founder-panel');
				router.refresh();
			}
		} catch {
			setError(getTranslation(lang, 'login_error'));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="flex justify-center mb-3">
						<div className="brand-logo" style={{ fontSize: '28px', width: '56px', height: '56px' }}>
							R&J
						</div>
					</div>
					<CardTitle className="text-2xl text-center">
						{getTranslation(lang, 'login_title')}
					</CardTitle>
					<p className="text-sm text-center text-text-muted mt-1">
						{getTranslation(lang, 'login_subtitle')}
					</p>
				</CardHeader>

				<CardBody>
					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="bg-danger/10 border border-danger text-danger px-4 py-3 rounded text-sm">
								{error}
							</div>
						)}

						<Input
							label={getTranslation(lang, 'login_user')}
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="admin"
							required
							autoFocus
						/>

						<div style={{ position: 'relative' }}>
							<Input
								label={getTranslation(lang, 'login_pass')}
								type={showPassword ? 'text' : 'password'}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								required
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								style={{
									position: 'absolute', right: '12px', top: '50%',
									transform: 'translateY(-50%)', background: 'none', border: 'none',
									cursor: 'pointer', padding: '4px', display: 'flex',
									alignItems: 'center', justifyContent: 'center',
									marginTop: '12px', color: '#000', opacity: 0.4,
									transition: 'opacity 0.2s',
								}}
								onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
								onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
								tabIndex={-1}
								aria-label={getTranslation(lang, showPassword ? 'hide_password' : 'show_password')}
							>
								{showPassword ? (
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								) : (
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								)}
							</button>
						</div>

						<Button type="submit" variant="primary" className="w-full" disabled={loading}>
							{loading ? getTranslation(lang, 'login_loading') : getTranslation(lang, 'login_btn')}
						</Button>
					</form>

					<p className="mt-5 text-xs text-center text-text-muted">
						{getTranslation(lang, 'login_hint')}
					</p>
				</CardBody>
			</Card>
		</div>
	);
}
