const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional: images are stored as uploaded */ }

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '.bin'))
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype])
});

function sniff(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(16);
  fs.readSync(fd, b, 0, 16, 0);
  fs.closeSync(fd);
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.slice(0, 4).toString('hex') === '89504e47';
  const webp = b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
  const avif = b.slice(4, 8).toString() === 'ftyp';
  return jpg || png || webp || avif;
}

// Validates the uploaded file, optionally resizes it, and returns its public URL path.
async function finalize(file) {
  if (!sniff(file.path)) { fs.unlink(file.path, () => {}); throw new Error('That file is not a valid image.'); }
  let name = path.basename(file.path);
  if (sharp) {
    try {
      const out = name.replace(/\.[^.]+$/, '') + '.webp';
      await sharp(file.path).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(config.uploadDir, out));
      if (out !== name) fs.unlink(file.path, () => {});
      name = out;
    } catch (e) { console.error('Image resize skipped:', e.message); }
  }
  return '/uploads/' + name;
}

function removeUpload(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return;
  const f = path.join(config.uploadDir, path.basename(urlPath));
  fs.unlink(f, () => {});
}

module.exports = { upload, finalize, removeUpload };
