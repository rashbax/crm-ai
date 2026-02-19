// FIXED FILE: /components/Topbar.tsx
// ✅ All emoji icons replaced with minimal black SVG
// ✅ Flaticon style (stroke-based, 2px width)
// ✅ Black color with opacity effects
// ✅ Fully localized

'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { storage } from '@/lib/storage';
import { getTranslation } from '@/lib/translations';
import type { Language } from '@/types';

export default function Topbar() {
	const { data: session } = useSession();
	const [lang, setLang] = useState<Language>('ru');
	const [showProfileMenu, setShowProfileMenu] = useState(false);

	useEffect(() => {
		const currentLang = storage.getLang();
		setLang(currentLang);
	}, []);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.profile-dropdown')) {
				setShowProfileMenu(false);
			}
		};

		if (showProfileMenu) {
			document.addEventListener('click', handleClickOutside);
		}

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [showProfileMenu]);

	const handleLangChange = (newLang: Language) => {
		storage.setLang(newLang);
		setLang(newLang);
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

				<button className="btn-ghost">
					{getTranslation(lang, 'topbar_help')}
				</button>

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
										<path d="M12 1v6m0 6v6m5.196-13.196l-4.242 4.242m0 6.364l4.242 4.242M23 12h-6m-6 0H5m13.196 5.196l-4.242-4.242m-6.364 0l-4.242 4.242" />
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
