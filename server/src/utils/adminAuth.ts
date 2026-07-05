import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '../../data');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'downloads.db');
const db = new Database(dbPath);

// Create admin_users table
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// Pre-create default admin user (rakpa / Anubundu@23730) if not exists
const defaultUsername = 'rakpa';
const defaultPassword = 'Anubundu@23730';

const existingUser = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(defaultUsername);

if (!existingUser) {
  const saltRounds = 10;
  const passwordHash = bcrypt.hashSync(defaultPassword, saltRounds);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(defaultUsername, passwordHash);
  console.log('Default admin user created: rakpa');
}

/** Verify admin credentials */
export function verifyAdmin(username: string, password: string): boolean {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

export { db as adminDb };
