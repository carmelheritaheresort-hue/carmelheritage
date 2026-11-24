// Saves every table in the Supabase database to data/backups/backup-<time>.json (data/ is not in git).
//   npm run backup
const fs = require('fs');
const path = require('path');
const { db, TABLES } = require('../src/db');

(async () => {
  const out = {};
  for (const t of TABLES) {
    try { out[t] = await db.all(`SELECT * FROM ${t} ORDER BY 1`); } catch (e) { out[t] = { error: e.message }; }
  }
  const dir = path.join(__dirname, '..', 'data', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('Backup saved:', path.relative(process.cwd(), file));
  console.log(Object.entries(out).map(([t, r]) => `${t}=${Array.isArray(r) ? r.length : 'n/a'}`).join(' '));
  await db.close();
})().catch(e => { console.error('Backup failed:', e.message); process.exit(1); });
