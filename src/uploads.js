// Image uploads, stored in Supabase Storage (a public bucket). Files are kept in memory while
// they are checked, so nothing is written to the server's disk (Vercel has no persistent disk).
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional: images are stored as uploaded */ }

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' };
const sb = config.supabase;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 4 }, // Vercel limits request bodies to 4.5 MB
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype])
});

function sniff(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(4, 8).toString() === 'ftyp') return 'image/avif';
  return '';
}

function headers(extra = {}) {
  // New-style keys (sb_secret_...) go only in the apikey header; legacy JWT keys also need Authorization.
  const h = { apikey: sb.secretKey, ...extra };
  if (!sb.secretKey.startsWith('sb_')) h.Authorization = `Bearer ${sb.secretKey}`;
  return h;
}

function requireStorage() {
  if (!sb.url || !sb.secretKey) throw new Error('Image storage is not configured (SUPABASE_URL and SUPABASE_SECRET_KEY).');
}

const publicPrefix = () => `${sb.url}/storage/v1/object/public/${sb.bucket}/`;

async function putObject(name, buffer, contentType) {
  requireStorage();
  const r = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }),
    body: buffer
  });
  if (!r.ok) throw new Error(`Image upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return publicPrefix() + name;
}

// Validates the uploaded file, optionally resizes it, stores it and returns its public URL.
async function finalize(file) {
  let type = sniff(file.buffer);
  if (!type) throw new Error('That file is not a valid image.');
  let buf = file.buffer;
  if (sharp) {
    try { buf = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); type = 'image/webp'; }
    catch (e) { console.error('Image resize skipped:', e.message); }
  }
  const name = crypto.randomBytes(16).toString('hex') + ALLOWED[type];
  return putObject(name, buf, type);
}

// Deletes a stored image. Never throws: a leftover file is harmless.
async function removeUpload(url) {
  try {
    if (!url || !sb.url || !url.startsWith(publicPrefix())) return;
    const name = url.slice(publicPrefix().length);
    await fetch(`${sb.url}/storage/v1/object/${sb.bucket}`, {
      method: 'DELETE', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [name] })
    });
  } catch (e) { console.error('Image delete failed:', e.message); }
}

// Creates the public bucket if it does not exist yet (used by the setup scripts).
async function ensureBucket() {
  requireStorage();
  const r = await fetch(`${sb.url}/storage/v1/bucket/${sb.bucket}`, { headers: headers() });
  if (r.ok) return 'exists';
  const c = await fetch(`${sb.url}/storage/v1/bucket`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: sb.bucket, name: sb.bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: Object.keys(ALLOWED) })
  });
  if (!c.ok) throw new Error(`Could not create storage bucket (${c.status}): ${(await c.text()).slice(0, 200)}`);
  return 'created';
}

const storageOrigin = () => (sb.url ? new URL(sb.url).origin : '');

module.exports = { upload, finalize, removeUpload, putObject, ensureBucket, sniff, storageOrigin, ALLOWED };
