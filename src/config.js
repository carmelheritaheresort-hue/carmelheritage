require('dotenv').config();
const path = require('path');
const env = process.env;
const root = path.resolve(__dirname, '..');

function origin(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

const plausibleDomain = (env.PLAUSIBLE_DOMAIN || '').trim();
const plausibleSrc = (env.PLAUSIBLE_SRC || 'https://plausible.io/js/script.js').trim();

module.exports = {
  root,
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3000,
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === '1',
  isServerless: !!env.VERCEL,
  // Supabase Postgres. Use the "Transaction pooler" connection string (port 6543).
  databaseUrl: (env.DATABASE_URL || '').trim(),
  databaseCa: (env.DATABASE_CA_CERT || '').replace(/\\n/g, '\n').trim(),
  // Supabase Storage for uploaded images.
  supabase: {
    url: (env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    secretKey: (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    bucket: (env.SUPABASE_BUCKET || 'uploads').trim()
  },
  cronSecret: (env.CRON_SECRET || '').trim(),
  // Old local files, used only by scripts/import-from-sqlite.js.
  legacyDbPath: path.resolve(root, env.DATABASE_PATH || './data/carmel.db'),
  legacyUploadDir: path.resolve(root, env.UPLOAD_DIR || './data/uploads'),
  whatsappEnv: (env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === '1',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || ''
  },
  notifyEmail: (env.NOTIFY_EMAIL || '').trim(),
  razorpay: {
    keyId: (env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: (env.RAZORPAY_KEY_SECRET || '').trim(),
    webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || '').trim()
  },
  // Lets you click through the booking flow locally without a payment gateway. Never active in production.
  devPayments: env.NODE_ENV !== 'production' && env.DEV_PAYMENTS !== '0',
  analytics: plausibleDomain
    ? { domain: plausibleDomain, src: plausibleSrc, origin: origin(plausibleSrc) }
    : null,
  sessionHours: 8
};
