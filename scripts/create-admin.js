// Usage:  npm run create-admin -- you@example.com "Your Name" admin
// The password is read from the ADMIN_PASSWORD env var, or prompted for (hidden input not supported; use the env var on shared machines).
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db, migrate } = require('../src/db');

migrate();

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

(async () => {
  const [, , emailArg, nameArg, roleArg] = process.argv;
  const email = (emailArg || await ask('Email: ')).toLowerCase();
  const name = nameArg || await ask('Name: ');
  const role = roleArg || 'admin';
  if (!['admin', 'editor', 'staff'].includes(role)) throw new Error('Role must be admin, editor or staff');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  const password = process.env.ADMIN_PASSWORD || await ask('Password (min 12 characters): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  const hash = bcrypt.hashSync(password, 12);
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET password_hash=?, name=?, role=?, active=1 WHERE id=?').run(hash, name, role, existing.id);
    console.log(`Updated user ${email} (${role}).`);
  } else {
    db.prepare('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)').run(email, name, hash, role, now);
    console.log(`Created ${role} ${email}.`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
