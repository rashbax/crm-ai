import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

async function createUser(username: string, password: string, email: string) {
	console.log('Creating user...');

	const salt = await bcrypt.genSalt(10);
	const passwordHash = await bcrypt.hash(password, salt);

	const user = {
		id: randomUUID(),
		username,
		passwordHash,
		email,
		createdAt: new Date().toISOString(),
		role: 'admin',
	};

	const usersFile = path.join(process.cwd(), 'data', 'secure', 'users.json');
	const dir = path.dirname(usersFile);

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	let usersData = { users: [] };

	if (fs.existsSync(usersFile)) {
		const content = fs.readFileSync(usersFile, 'utf-8');
		usersData = JSON.parse(content);
	}

	const existingUser = usersData.users.find(
		(u: any) => u.username === username,
	);
	if (existingUser) {
		console.log(`❌ User "${username}" already exists!`);
		process.exit(1);
	}

	usersData.users.push(user);
	fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));

	console.log('✅ User created successfully!');
	console.log('─────────────────────────────');
	console.log(`Username: ${username}`);
	console.log(`Email: ${email}`);
	console.log(`Password: ${password}`);
	console.log('─────────────────────────────');
}

const args = process.argv.slice(2);
if (args.length < 2) {
	console.log(
		'Usage: npx tsx scripts/create-user.ts <username> <password> [email]',
	);
	process.exit(1);
}

const username = args[0];
const password = args[1];
const email = args[2] || `${username}@crm-auto.local`;

createUser(username, password, email);
