// Writes .env.vercel: only the values the live site on Vercel needs, ready to paste into
// Vercel > Project > Settings > Environment Variables (paste the whole file into the first "Key" box).
// Development-only values (NODE_ENV=development, DEV_PAYMENTS, local paths) are left out on purpose.
//   npm run vercel-env -- https://your-site.vercel.app
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, '.env'), 'utf8');
const val = k => ((src.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim();
const out = path.join(root, '.env.vercel');
const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
const keep = k => ((prev.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim();

const siteUrl = (process.argv[2] || keep('SITE_URL') || 'https://carmelheritage.vercel.app').replace(/\/+$/, '');
const lines = {
  NODE_ENV: 'production',
  SITE_URL: siteUrl,
  DATABASE_URL: val('DATABASE_URL'),
  SUPABASE_URL: val('SUPABASE_URL'),
  SUPABASE_SECRET_KEY: val('SUPABASE_SECRET_KEY'),
  SUPABASE_BUCKET: val('SUPABASE_BUCKET') || 'uploads',
  CRON_SECRET: keep('CRON_SECRET') || crypto.randomBytes(32).toString('hex')
};
for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'NOTIFY_EMAIL', 'WHATSAPP_NUMBER', 'PLAUSIBLE_DOMAIN']) {
  if (val(k) && !(k === 'SMTP_PORT' && !val('SMTP_HOST')) && !(k === 'SMTP_SECURE' && !val('SMTP_HOST'))) lines[k] = val(k);
}
const missing = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter(k => !lines[k]);
if (missing.length) { console.error('Missing in .env: ' + missing.join(', ')); process.exit(1); }

fs.writeFileSync(out, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(`Wrote .env.vercel with ${Object.keys(lines).length} values (SITE_URL=${siteUrl}). Keep this file private.`);
