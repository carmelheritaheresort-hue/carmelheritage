// Prepares the Digital Brochure images in public/img/brochures/ from the supplied files in brochures/.
// The original file is copied unchanged (used for the full-screen view and the download). Smaller
// WebP copies are made for the page previews. Nothing is cropped or resized out of proportion.
// Run again after replacing a brochure: node scripts/brochure-images.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'brochures');
const OUT = path.join(__dirname, '..', 'public', 'img', 'brochures');
// Supplied WhatsApp file names -> page names.
const MAP = {
  'WhatsApp Image 2026-11-27 at 8.51.06 AM (3).jpeg': 'standard-day-out-package',
  'WhatsApp Image 2026-11-27 at 8.51.07 AM.jpeg': 'premium-day-out-package',
  'WhatsApp Image 2026-11-27 at 8.51.06 AM.jpeg': 'family-wellness-membership-1-year',
  'WhatsApp Image 2026-11-27 at 8.51.06 AM (2).jpeg': 'family-wellness-membership-2-years',
  'WhatsApp Image 2026-11-27 at 8.51.06 AM (1).jpeg': 'group-stay-package',
  'WhatsApp Image 2026-11-27 at 9.48.27 AM.jpeg': 'school-day-out-programme'
};
const WIDTHS = [480, 800];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sizes = {};
  for (const [file, slug] of Object.entries(MAP)) {
    const src = path.join(SRC, file);
    if (!fs.existsSync(src)) throw new Error('Missing ' + file);
    fs.copyFileSync(src, path.join(OUT, slug + '.jpg'));
    const meta = await sharp(src).metadata();
    for (const w of WIDTHS) {
      await sharp(src).rotate().resize({ width: Math.min(w, meta.width), withoutEnlargement: true })
        .webp({ quality: 80 }).toFile(path.join(OUT, `${slug}-${w}.webp`));
    }
    sizes[slug] = { width: meta.width, height: meta.height, bytes: fs.statSync(src).size };
    console.log(slug, meta.width + 'x' + meta.height);
  }
  fs.writeFileSync(path.join(OUT, 'sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
})().catch(e => { console.error(e.message); process.exit(1); });
