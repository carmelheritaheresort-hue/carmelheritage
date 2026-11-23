// Usage:  npm run create-admin -- you@example.com "Your Name" admin
// The password is read from the ADMIN_PASSWORD env var, or prompted for (visible while typing; use the env var on shared machines).
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db, migrate } = require('../src/db');

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

(async () => {
  await migrate();
  const [, , emailArg, nameArg, roleArg] = process.argv;
  const email = (emailArg || await ask('Email: ')).toLowerCase();
  const name = nameArg || await ask('Name: ');
  const role = roleArg || 'admin';
  if (!['admin', 'editor', 'staff'].includes(role)) throw new Error('Role must be admin, editor or staff');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  const password = process.env.ADMIN_PASSWORD || await ask('Password (min 12 characters): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  const hash = bcrypt.hashSync(password, 12);
  const existing = await db.get('SELECT id FROM users WHERE email=?', email);
  if (existing) {
    await db.run('UPDATE users SET password_hash=?, name=?, role=?, active=1 WHERE id=?', hash, name, role, existing.id);
    await db.run('DELETE FROM sessions WHERE user_id=?', existing.id);
    console.log(`Updated user ${email} (${role}).`);
  } else {
    await db.run('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)', email, name, hash, role, new Date().toISOString());
    console.log(`Created ${role} ${email}.`);
  }
  await db.close();
})().catch(e => { console.error(e.message); process.exit(1); });
