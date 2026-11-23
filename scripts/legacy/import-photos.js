// Usage: node scripts/import-photos.js manifest.json
// manifest: {
//   "gallery":  [ { "image": "/uploads/x.jpg", "alt": "...", "caption": "..." }, ... ],  // display order
//   "settings": { "hero_image": "/uploads/y.jpg", "hero_image_alt": "...", ... },
//   "accommodation": { "cottage": { "photo": "/uploads/z.jpg", "photo_alt": "..." } }
// }
// Gallery items whose image already exists are updated and re-ordered; new ones are added as approved.
// Gallery images not listed keep their place after the listed ones.
const fs = require('fs');
const path = require('path');
const { db, migrate } = require('../src/db');
const config = require('../src/config');
const settings = require('../src/settings');

migrate();
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/import-photos.js manifest.json'); process.exit(1); }
const m = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const exists = p => typeof p === 'string' && p.startsWith('/uploads/') && fs.existsSync(path.join(config.uploadDir, path.basename(p)));

db.transaction(() => {
  const listed = new Set();
  (m.gallery || []).forEach((g, i) => {
    if (!exists(g.image)) throw new Error(`Missing upload: ${g.image}`);
    if (!g.alt) throw new Error(`Alt text required for ${g.image}`);
    listed.add(g.image);
    const row = db.prepare('SELECT id FROM gallery WHERE image=?').get(g.image);
    if (row) db.prepare('UPDATE gallery SET alt=?, caption=?, sort_order=?, approved=1 WHERE id=?').run(g.alt, g.caption || '', i + 1, row.id);
    else db.prepare('INSERT INTO gallery (image, alt, caption, is_illustration, sort_order, approved) VALUES (?,?,?,0,?,1)').run(g.image, g.alt, g.caption || '', i + 1);
  });
  let n = listed.size;
  for (const r of db.prepare('SELECT id, image FROM gallery ORDER BY sort_order, id').all()) {
    if (!listed.has(r.image)) db.prepare('UPDATE gallery SET sort_order=? WHERE id=?').run(++n, r.id);
  }

  // "accommodation": { "cottage": { "photo": "/uploads/..", "photo_alt": ".." }, "standard_room": { ... } }
  for (const [kind, a] of Object.entries(m.accommodation || {})) {
    if (!exists(a.photo)) throw new Error(`Missing upload for ${kind}: ${a.photo}`);
    if (!a.photo_alt) throw new Error(`Alt text required for ${kind}`);
    const r = db.prepare('UPDATE accommodation_types SET photo=?, photo_alt=? WHERE kind=?').run(a.photo, a.photo_alt, kind);
    if (!r.changes) throw new Error(`Unknown accommodation kind: ${kind}`);
    console.log(`Accommodation photo set: ${kind}`);
  }

  const out = {};
  for (const [k, v] of Object.entries(m.settings || {})) {
    const d = settings.byKey[k];
    if (!d) throw new Error(`Unknown setting: ${k}`);
    if (d.type === 'image' && v && !exists(v)) throw new Error(`Missing upload for ${k}: ${v}`);
    out[k] = String(v);
  }
  if (Object.keys(out).length) settings.saveSettings(out);
})();

console.log(`Gallery: ${db.prepare('SELECT COUNT(*) c FROM gallery WHERE approved=1').get().c} published images.`);
console.log(`Settings updated: ${Object.keys(m.settings || {}).join(', ') || '(none)'}`);
