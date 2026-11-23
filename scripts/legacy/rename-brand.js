// One-off: switch the guest-facing brand name in existing database content.
// Usage: node scripts/rename-brand.js "Carmel Heritage"
// The full organisation name ("Carmel Ayurveda Village and Research Centre") is left unchanged.
const { db, migrate } = require('../src/db');
migrate();

const OLD = 'Carmel Ayurveda Village';
const NEW = process.argv[2];
if (!NEW) { console.error('Usage: node scripts/rename-brand.js "New brand name"'); process.exit(1); }

// Replace the brand name, but not when it is part of the organisation name.
const swap = s => String(s).replace(/Carmel Ayurveda Village(?! and Research Centre)/g, NEW);

const saved = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'chk_%'").all();
console.log('Saved settings:', saved.map(r => r.key).join(', ') || '(none)');

const upd = db.prepare('UPDATE settings SET value=?, updated_at=? WHERE key=?');
const now = new Date().toISOString();
let n = 0;
for (const r of saved) {
  if (r.key === 'org_name') continue;
  const v = r.key === 'site_name' && r.value === OLD ? NEW : swap(r.value);
  if (v !== r.value) { upd.run(v, now, r.key); n++; console.log('Updated setting', r.key); }
}

const tables = { faqs: ['question', 'answer'], treatments: ['name', 'summary', 'description'], facilities: ['name', 'description'],
  gallery: ['alt', 'caption'], testimonials: ['quote'], management: ['bio'], accommodation_types: ['summary', 'description', 'photo_alt'] };
for (const [t, cols] of Object.entries(tables)) {
  for (const row of db.prepare(`SELECT * FROM ${t}`).all()) {
    const changed = cols.filter(c => swap(row[c]) !== row[c]);
    if (!changed.length) continue;
    db.prepare(`UPDATE ${t} SET ${changed.map(c => c + '=?').join(',')} WHERE id=?`).run(...changed.map(c => swap(row[c])), row.id);
    n++; console.log(`Updated ${t} #${row.id}: ${changed.join(', ')}`);
  }
}
console.log(`Done. ${n} record(s) changed.`);
