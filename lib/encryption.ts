import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
	const secret = process.env.ENCRYPTION_KEY;
	if (!secret)
		throw new Error('ENCRYPTION_KEY is not set in environment variables');
	return crypto.createHash('sha256').update(secret).digest();
}

export function encryptCredentials(creds: Record<string, string>): string {
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

export function decryptCredentials(encrypted: string): Record<string, string> {
	const key = getKey();
	const combined = Buffer.from(encrypted, 'base64');
	const iv = combined.subarray(0, IV_LENGTH);
	const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
	const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
	const decipher = crypto.createDecipheriv(
		ALGORITHM,
		key,
		iv,
	) as crypto.DecipherGCM;
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]);
	return JSON.parse(decrypted.toString('utf8'));
}

export function isEncrypted(value: string): boolean {
	try {
		const buf = Buffer.from(value, 'base64');
		return buf.length > IV_LENGTH + TAG_LENGTH;
	} catch {
		return false;
	}
}
