// Usage: node scripts/add-gallery.js "/uploads/file.jpg" "Alt text" "Caption"
// Adds an approved gallery item for an image already in the uploads folder.
const { db, migrate } = require('../src/db');
migrate();
const [, , image, alt, caption = ''] = process.argv;
if (!image || !image.startsWith('/uploads/') || !alt) {
  console.error('Usage: node scripts/add-gallery.js "/uploads/file.jpg" "Alt text" "Caption"');
  process.exit(1);
}
const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 n FROM gallery').get().n;
const r = db.prepare('INSERT INTO gallery (image, alt, caption, is_illustration, sort_order, approved) VALUES (?,?,?,0,?,1)')
  .run(image, alt, caption, next);
console.log(`Added gallery item #${r.lastInsertRowid}: ${image}`);
