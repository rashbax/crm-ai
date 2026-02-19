import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
	const secret = process.env.ENCRYPTION_KEY;
	if (!secret) throw new Error('ENCRYPTION_KEY not set');
	return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(creds: Record<string, string>): string {
	const key = getKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(
		ALGORITHM,
		key,
		iv,
	) as crypto.CipherGCM;
	const encrypted = Buffer.concat([
		cipher.update(JSON.stringify(creds), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function isAlreadyEncrypted(value: any): boolean {
	if (typeof value !== 'string') return false;
	try {
		return Buffer.from(value, 'base64').length > IV_LENGTH + TAG_LENGTH;
	} catch {
		return false;
	}
}

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
	fs.readFileSync(envPath, 'utf-8')
		.split('\n')
		.forEach((line) => {
			const [key, ...rest] = line.split('=');
			if (key?.trim()) process.env[key.trim()] = rest.join('=').trim();
		});
}

const CONNECTIONS_FILE = path.join(
	process.cwd(),
	'data',
	'secure',
	'connections.json',
);

async function migrate() {
	if (!process.env.ENCRYPTION_KEY) {
		console.error('❌ ENCRYPTION_KEY not found in .env.local');
		process.exit(1);
	}
	if (!fs.existsSync(CONNECTIONS_FILE)) {
		console.log('ℹ️  No connections.json — nothing to migrate.');
		return;
	}

	const data = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf-8'));
	const connections: any[] = data.connections || [];
	let migrated = 0,
		skipped = 0;

	for (const conn of connections) {
		if (!conn.creds || isAlreadyEncrypted(conn.creds)) {
			console.log(`⏭  ${conn.name} — skipped`);
			skipped++;
			continue;
		}
		if (typeof conn.creds === 'object') {
			conn.creds = encrypt(conn.creds);
			console.log(`✅ ${conn.name} — encrypted`);
			migrated++;
		}
	}

	const tmp = `${CONNECTIONS_FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify({ connections }, null, 2));
	fs.renameSync(tmp, CONNECTIONS_FILE);

	console.log(`\n✅ Done — encrypted: ${migrated}, skipped: ${skipped}`);
	console.log('⚠️  Keep your ENCRYPTION_KEY safe — you need it to decrypt!');
}

migrate();
