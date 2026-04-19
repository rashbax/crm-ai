import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'secure', 'users.json');

interface User {
	id: string;
	username: string;
	passwordHash: string;
	email: string;
	role: string;
}

// Admin fallback (used when users.json doesn't exist, e.g. on Vercel).
// Credentials MUST come from environment — never commit a password hash.
function getEnvAdmin(): User | null {
	const passwordHash = process.env.ADMIN_PASSWORD_HASH;
	if (!passwordHash) return null;
	return {
		id: process.env.ADMIN_ID || '0997eb8f-d5e1-4f00-b33d-15b0e0e7963b',
		username: process.env.ADMIN_USERNAME || 'admin',
		passwordHash,
		email: process.env.ADMIN_EMAIL || 'admin@example.com',
		role: 'admin',
	};
}

function loadUsers(): User[] {
	const envAdmin = getEnvAdmin();
	try {
		if (!fs.existsSync(USERS_FILE)) {
			if (!envAdmin) {
				console.error(
					'No users.json and ADMIN_PASSWORD_HASH not set — login disabled',
				);
				return [];
			}
			return [envAdmin];
		}
		const content = fs.readFileSync(USERS_FILE, 'utf-8');
		const data = JSON.parse(content);
		const fileUsers: User[] = data.users || [];
		if (fileUsers.length > 0) return fileUsers;
		return envAdmin ? [envAdmin] : [];
	} catch (error) {
		console.error('Error loading users:', error);
		return envAdmin ? [envAdmin] : [];
	}
}

export const authOptions: AuthOptions = {
	providers: [
		CredentialsProvider({
			name: 'Credentials',
			credentials: {
				username: { label: 'Username', type: 'text' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				if (!credentials?.username || !credentials?.password) {
					return null;
				}

				const users = loadUsers();
				const user = users.find(
					(u) => u.username === credentials.username,
				);

				if (!user) {
					return null;
				}

				const isValid = await bcrypt.compare(
					credentials.password,
					user.passwordHash,
				);

				if (!isValid) {
					return null;
				}

				return {
					id: user.id,
					name: user.username,
					email: user.email,
					role: user.role,
				};
			},
		}),
	],

	session: {
		strategy: 'jwt',
		maxAge: 24 * 60 * 60,
	},

	pages: {
		signIn: '/login',
		error: '/login',
	},

	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = user.role;
			}
			return token;
		},

		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.role = token.role as string;
			}
			return session;
		},
	},

	secret: process.env.NEXTAUTH_SECRET,
};
