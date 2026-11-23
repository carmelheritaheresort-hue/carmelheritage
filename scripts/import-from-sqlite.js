// One-time move from the old local setup (data/carmel.db + data/uploads) to Supabase.
//
//   npm run import-sqlite            check what would be copied (changes nothing)
//   npm run import-sqlite -- --run   copy into an EMPTY Supabase database
//   npm run import-sqlite -- --run --replace   delete everything in Supabase first, then copy
//
// Images are uploaded to Supabase Storage and every /uploads/... path is rewritten to its new URL.
// The local files are only read, never changed.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // Node 22.13+, reads the old file only
const config = require('../src/config');
const { db, migrate } = require('../src/db');
const { putObject, ensureBucket, sniff } = require('../src/uploads');

const RUN = process.argv.includes('--run');
const REPLACE = process.argv.includes('--replace');

// Copy order respects foreign keys. Sessions are not copied: everyone signs in again.
const ORDER = ['settings', 'users', 'accommodation_types', 'treatments', 'facilities', 'gallery', 'faqs', 'testimonials', 'management', 'guests', 'enquiries', 'bookings', 'room_blocks'];

(async () => {
  if (!fs.existsSync(config.legacyDbPath)) throw new Error(`Old database not found at ${config.legacyDbPath}`);
  const old = new DatabaseSync(config.legacyDbPath, { readOnly: true });
  const has = t => !!old.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

  await migrate();
  const target = {};
  for (const t of ORDER) target[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;

  // Find every image path referenced anywhere.
  const refs = new Set();
  const data = {};
  for (const t of ORDER) {
    data[t] = has(t) ? old.prepare(`SELECT * FROM ${t}`).all() : [];
    for (const row of data[t]) for (const v of Object.values(row)) if (typeof v === 'string' && v.startsWith('/uploads/')) refs.add(v);
  }
  const missing = [...refs].filter(u => !fs.existsSync(path.join(config.legacyUploadDir, path.basename(u))));

  console.log('Rows to copy (old -> rows already in Supabase):');
  for (const t of ORDER) console.log(`  ${t.padEnd(20)} ${String(data[t].length).padStart(4)}  (Supabase now: ${target[t]})`);
  console.log(`Images referenced: ${refs.size}${missing.length ? `, MISSING locally: ${missing.join(', ')}` : ''}`);

  // Seeded rows (rooms, FAQs, testimonials) do not count as "not empty".
  const seeded = new Set(['accommodation_types', 'faqs', 'testimonials']);
  const busy = ORDER.filter(t => target[t] > 0 && !seeded.has(t));
  if (!RUN) { console.log('\nNothing was changed. Run again with --run to copy.'); return db.close(); }
  if (busy.length && !REPLACE) throw new Error(`Supabase already has data in: ${busy.join(', ')}. Use --replace to overwrite it.`);

  console.log(`\nStorage bucket "${config.supabase.bucket}": ${await ensureBucket()}`);
  const urlMap = {};
  for (const u of refs) {
    const file = path.join(config.legacyUploadDir, path.basename(u));
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const type = sniff(buf);
    if (!type) { console.warn(`  skipped (not an image): ${u}`); continue; }
    try { urlMap[u] = await putObject(path.basename(u), buf, type); }
    catch (e) {
      if (!/409|Duplicate|already exists/i.test(e.message)) throw e;
      urlMap[u] = `${config.supabase.url}/storage/v1/object/public/${config.supabase.bucket}/${path.basename(u)}`; // uploaded on an earlier run
    }
    process.stdout.write('.');
  }
  console.log(`\nUploaded ${Object.keys(urlMap).length} images.`);

  await db.tx(async () => {
    // Delete in reverse order so foreign keys are not violated.
    for (const t of [...ORDER].reverse()) await db.run(`DELETE FROM ${t}`);
    await db.run('DELETE FROM sessions');
    for (const t of ORDER) {
      const cols = (await db.all(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?`, t)).map(c => c.column_name);
      for (const row of data[t]) {
        const keys = Object.keys(row).filter(k => cols.includes(k));
        const vals = keys.map(k => (typeof row[k] === 'string' && urlMap[row[k]] ? urlMap[row[k]] : row[k]));
        await db.run(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...vals);
      }
      // Make new rows continue numbering after the copied ids.
      if (cols.includes('id') && t !== 'settings') {
        await db.exec(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
      }
      console.log(`  copied ${t}: ${data[t].length}`);
    }
  });
  console.log('\nDone. Sign in to the admin again (sessions were not copied).');
  await db.close();
})().catch(async e => { console.error('Import failed:', e.message); try { await db.close(); } catch { /* ignore */ } process.exit(1); });
