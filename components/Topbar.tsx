// FIXED FILE: /components/Topbar.tsx
// ✅ All emoji icons replaced with minimal black SVG
// ✅ Flaticon style (stroke-based, 2px width)
// ✅ Black color with opacity effects
// ✅ Fully localized

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { storage } from '@/lib/storage';
import { getTranslation } from '@/lib/translations';
import type { Language } from '@/types';

interface MarketplaceOption {
	id: string;
	name: string;
}

const MARKETPLACE_LABELS: Record<string, string> = {
	ozon: 'Ozon',
	wb: 'Wildberries',
	uzum: 'Uzum',
	ym: 'Yandex Market',
};

export default function Topbar() {
	const router = useRouter();
	const { data: session } = useSession();
	const [lang, setLang] = useState<Language>('ru');
	const [showProfileMenu, setShowProfileMenu] = useState(false);
	const [showMarketplaceMenu, setShowMarketplaceMenu] = useState(false);
	const [selectedMarketplace, setSelectedMarketplace] = useState('all');
	const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>([]);

	useEffect(() => {
		const currentLang = storage.getLang();
		setLang(currentLang);
		setSelectedMarketplace(storage.getMarketplace());

		fetch('/api/integrations/enabled', { credentials: 'include' })
			.then((r) => r.json())
			.then((data) => {
				const conns = data.enabledConnections || data.connections || [];
				const uniqueIds = Array.from(new Set(conns.map((c: { marketplaceId: string }) => c.marketplaceId))) as string[];
				const mps = uniqueIds.map((id) => ({
					id,
					name: MARKETPLACE_LABELS[id] || id,
				}));
				setMarketplaces(mps);

				// Auto-select: if only 1 marketplace, set it; if multiple and none selected, set first
				const saved = storage.getMarketplace();
				if (mps.length === 1) {
					if (saved !== mps[0].id) {
						storage.setMarketplace(mps[0].id);
						setSelectedMarketplace(mps[0].id);
					}
				} else if (mps.length > 1 && (saved === 'all' || !mps.find((m) => m.id === saved))) {
					storage.setMarketplace(mps[0].id);
					setSelectedMarketplace(mps[0].id);
				}
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.profile-dropdown')) {
				setShowProfileMenu(false);
			}
			if (!target.closest('.marketplace-dropdown')) {
				setShowMarketplaceMenu(false);
			}
		};

		if (showProfileMenu || showMarketplaceMenu) {
			document.addEventListener('click', handleClickOutside);
		}

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [showProfileMenu, showMarketplaceMenu]);

	const handleLangChange = (newLang: Language) => {
		storage.setLang(newLang);
		setLang(newLang);
		window.location.reload();
	};

	const handleMarketplaceChange = (id: string) => {
		storage.setMarketplace(id);
		setSelectedMarketplace(id);
		setShowMarketplaceMenu(false);
		window.location.reload();
	};

	const handleLogout = async () => {
		await signOut({ callbackUrl: '/login' });
	};

	const username = session?.user?.name || 'User';
	const email = session?.user?.email || '';
	const userInitial = username.charAt(0).toUpperCase();

	return (
		<header className="topbar">
			<div className="brand-left">
				<div className="brand-logo">R&J</div>
				<div>
					<div className="brand-text-main">Rubi&Jons</div>
					<div className="brand-text-sub">
						{getTranslation(lang, 'topbar_subtitle')}
					</div>
				</div>
			</div>

			<div className="topbar-right">
				<div className="lang-switch">
					<button
						className={`lang-btn ${lang === 'ru' ? 'active' : ''}`}
						onClick={() => handleLangChange('ru')}
					>
						RU
					</button>
					<button
						className={`lang-btn ${lang === 'uz' ? 'active' : ''}`}
						onClick={() => handleLangChange('uz')}
					>
						UZ
					</button>
				</div>

				{/* Marketplace Selector */}
				<div className="marketplace-dropdown" style={{ position: 'relative' }}>
					{marketplaces.length === 0 ? (
						/* No integrations — show link to settings */
						<button
							className="btn-ghost"
							onClick={() => router.push('/settings')}
							style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="16" />
								<line x1="8" y1="12" x2="16" y2="12" />
							</svg>
							{getTranslation(lang, 'marketplace_add')}
						</button>
					) : marketplaces.length === 1 ? (
						/* Single marketplace — just show name, no dropdown */
						<span
							className="btn-ghost"
							style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'default' }}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
								<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
								<polyline points="9 22 9 12 15 12 15 22" />
							</svg>
							{marketplaces[0].name}
						</span>
					) : (
						/* Multiple marketplaces — dropdown selector */
						<>
							<button
								className="btn-ghost"
								onClick={() => setShowMarketplaceMenu(!showMarketplaceMenu)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '8px',
									padding: '6px 12px',
									borderRadius: '8px',
									fontSize: '14px',
									fontWeight: 500,
									color: '#374151',
								}}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
									<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
									<polyline points="9 22 9 12 15 12 15 22" />
								</svg>
								{MARKETPLACE_LABELS[selectedMarketplace] || selectedMarketplace}
								<svg
									width="10" height="10" viewBox="0 0 10 10" fill="none"
									style={{
										opacity: 0.4,
										transition: 'transform 0.2s',
										transform: showMarketplaceMenu ? 'rotate(180deg)' : 'rotate(0deg)',
										marginLeft: '2px',
									}}
								>
									<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</button>

							{showMarketplaceMenu && (
								<div
									style={{
										position: 'absolute',
										top: '100%',
										right: 0,
										marginTop: '4px',
										minWidth: '200px',
										backgroundColor: 'white',
										border: '1px solid #e5e7eb',
										borderRadius: '8px',
										boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
										zIndex: 1000,
										padding: '4px 0',
									}}
								>
									{marketplaces.map((mp) => (
										<button
											key={mp.id}
											onClick={() => handleMarketplaceChange(mp.id)}
											style={{
												width: '100%',
												padding: '10px 16px',
												textAlign: 'left',
												fontSize: '14px',
												fontWeight: selectedMarketplace === mp.id ? 600 : 400,
												color: selectedMarketplace === mp.id ? '#005BFF' : '#374151',
												backgroundColor: selectedMarketplace === mp.id ? '#F0F6FF' : 'transparent',
												border: 'none',
												cursor: 'pointer',
											}}
											onMouseEnter={(e) => { if (selectedMarketplace !== mp.id) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
											onMouseLeave={(e) => { if (selectedMarketplace !== mp.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
										>
											{mp.name}
										</button>
									))}
								</div>
							)}
						</>
					)}
				</div>

				{/* Profile Dropdown */}
				<div
					className="profile-dropdown"
					style={{ position: 'relative' }}
				>
					<div
						className="avatar"
						onClick={() => setShowProfileMenu(!showProfileMenu)}
						style={{ cursor: 'pointer' }}
					>
						{userInitial}
					</div>

					{/* Dropdown Menu */}
					{showProfileMenu && (
						<div
							style={{
								position: 'absolute',
								top: '100%',
								right: 0,
								marginTop: '8px',
								width: '280px',
								backgroundColor: 'white',
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								boxShadow:
									'0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
								zIndex: 1000,
							}}
						>
							{/* Profile Info */}
							<div
								style={{
									padding: '16px',
									borderBottom: '1px solid #e5e7eb',
								}}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '12px',
									}}
								>
									<div
										className="avatar"
										style={{
											width: '48px',
											height: '48px',
											fontSize: '20px',
										}}
									>
										{userInitial}
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<p
											style={{
												fontWeight: 600,
												fontSize: '14px',
												marginBottom: '2px',
												color: '#111827',
											}}
										>
											{username}
										</p>
										{email && (
											<p
												style={{
													fontSize: '12px',
													color: '#6b7280',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{email}
											</p>
										)}
									</div>
								</div>
							</div>

							{/* Menu Items */}
							<div style={{ padding: '8px 0' }}>
								<button
									onClick={() => setShowProfileMenu(false)}
									style={{
										width: '100%',
										padding: '12px 16px',
										textAlign: 'left',
										fontSize: '14px',
										color: '#374151',
										backgroundColor: 'transparent',
										border: 'none',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: '12px',
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor =
											'#f3f4f6')
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor =
											'transparent')
									}
								>
									{/* Minimal User Icon (black SVG) */}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										style={{ opacity: 0.7 }}
									>
										<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
										<circle cx="12" cy="7" r="4" />
									</svg>
									{getTranslation(lang, 'profile_settings')}
								</button>

								<button
									onClick={() => { setShowProfileMenu(false); router.push('/settings'); }}
									style={{
										width: '100%',
										padding: '12px 16px',
										textAlign: 'left',
										fontSize: '14px',
										color: '#374151',
										backgroundColor: 'transparent',
										border: 'none',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: '12px',
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor =
											'#f3f4f6')
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor =
											'transparent')
									}
								>
									{/* Minimal Settings Icon (black SVG) */}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										style={{ opacity: 0.7 }}
									>
										<circle cx="12" cy="12" r="3" />
										<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V22a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .99 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H22a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.99z" />
									</svg>
									{getTranslation(lang, 'settings')}
								</button>
							</div>

							{/* Logout Button */}
							<div
								style={{
									padding: '8px',
									borderTop: '1px solid #e5e7eb',
								}}
							>
								<button
									onClick={handleLogout}
									style={{
										width: '100%',
										padding: '12px 16px',
										textAlign: 'left',
										fontSize: '14px',
										color: '#dc2626',
										backgroundColor: 'transparent',
										border: 'none',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: '12px',
										fontWeight: 500,
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor =
											'#fef2f2')
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor =
											'transparent')
									}
								>
									{/* Minimal Logout Icon (black SVG) */}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										style={{ opacity: 0.9 }}
									>
										<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
										<polyline points="16 17 21 12 16 7" />
										<line x1="21" y1="12" x2="9" y2="12" />
									</svg>
									{getTranslation(lang, 'logout')}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
