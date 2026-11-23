const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const config = require('./config');

const COOKIE = 'cav_sid';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function setSessionCookie(res, token, maxAgeMs) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/admin', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (config.isProd) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const ttl = config.sessionHours * 3600 * 1000;
  const now = Date.now();
  db.prepare('INSERT INTO sessions(id_hash,user_id,csrf,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(sha(token), userId, csrf, new Date(now + ttl).toISOString(), new Date(now).toISOString());
  setSessionCookie(res, token, ttl);
}

function destroySession(req, res) {
  const t = getCookie(req, COOKIE);
  if (t) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(sha(t));
  setSessionCookie(res, '', 0);
}

function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

async function verifyLogin(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(email || '').trim().toLowerCase());
  const ok = await bcrypt.compare(String(password || ''), user ? user.password_hash : DUMMY_HASH);
  return user && ok ? user : null;
}

function loadSession(req) {
  const t = getCookie(req, COOKIE);
  if (!t) return null;
  const row = db.prepare(`SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=?`).get(sha(t));
  if (!row || !row.active || row.expires_at < new Date().toISOString()) return null;
  return { csrf: row.csrf, user: { id: row.id, email: row.email, name: row.name, role: row.role } };
}

function requireAuth(req, res, next) {
  const sess = loadSession(req);
  if (!sess) return res.redirect('/admin/login');
  req.user = sess.user;
  req.csrf = sess.csrf;
  res.locals.user = sess.user;
  res.locals.csrf = sess.csrf;
  next();
}

function allow(...roles) {
  return (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || roles.includes(req.user.role))) return next();
    res.status(403).render('admin/message', { title: 'Not allowed', message: 'Your role does not have access to this page.' });
  };
}

function checkCsrf(req, res, next) {
  if (req.method !== 'POST') return next();
  const sent = String((req.body && req.body._csrf) || '');
  const a = Buffer.from(sent), b = Buffer.from(req.csrf || '');
  if (a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)) return next();
  for (const f of req.files || []) require('fs').unlink(f.path, () => {});
  res.status(403).render('admin/message', { title: 'Session expired', message: 'The form expired or was invalid. Go back, refresh the page and try again.' });
}

function purgeSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

module.exports = { createSession, destroySession, destroyUserSessions, verifyLogin, requireAuth, allow, checkCsrf, purgeSessions };
