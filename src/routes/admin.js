const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const resources = require('../resources');
const payments = require('../payments');
const { upload, finalize, removeUpload } = require('../uploads');
const { wrap, fmtDateTime, csvCell, isHttpUrl, todayIST } = require('../util');
const booking = require('../booking');
const guests = require('../guests');
const calc = require('../../public/js/booking-calc.js');

const router = express.Router();
const STATUSES = ['new', 'contacted', 'confirmed', 'declined', 'cancelled'];
const PREFS = ['cottage', 'standard', 'either'];
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Express 4 does not catch rejected promises, so every async handler is wrapped.
const r = {};
for (const m of ['get', 'post']) r[m] = (path, ...fns) => router[m](path, ...fns.map(f => (f.length >= 4 ? f : wrap(f))));

router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  res.locals.fmtDateTime = fmtDateTime;
  res.locals.adminNav = req.path;
  next();
});

// ---- Login / logout -------------------------------------------------------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('admin/login', { error: 'Too many attempts. Try again in 15 minutes.', email: '' }) });

router.get('/login', (req, res) => res.render('admin/login', { error: '', email: '' }));

r.post('/login', loginLimiter, express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
  const user = await auth.verifyLogin(req.body.email, req.body.password);
  if (!user) return res.status(401).render('admin/login', { error: 'Incorrect email or password.', email: String(req.body.email || '').slice(0, 254) });
  await auth.purgeSessions();
  await auth.createSession(res, user.id);
  await db.run('UPDATE users SET last_login_at=? WHERE id=?', new Date().toISOString(), user.id);
  res.redirect('/admin');
});

router.use(auth.requireAuth);

router.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (req.method === 'POST' && ct.startsWith('multipart/form-data')) return upload.any()(req, res, next);
  return express.urlencoded({ extended: false, limit: '200kb' })(req, res, next);
});
router.use(auth.checkCsrf);

r.post('/logout', async (req, res) => { await auth.destroySession(req, res); res.redirect('/admin/login'); });

const msg = (res, title, message, status = 200) => res.status(status).render('admin/message', { title, message });
const clean = (v, max) => String(v == null ? '' : v).replace(CTRL, '').trim().slice(0, max);
const fileMap = req => Object.fromEntries((req.files || []).map(f => [f.fieldname, f]));
// Route ids must be whole numbers before they reach PostgreSQL.
const idOf = v => (/^\d{1,9}$/.test(String(v)) ? Number(v) : 0);
const one = async (sql, ...p) => (await db.get(sql, ...p)).c;

// ---- Dashboard ------------------------------------------------------------
r.get('/', async (req, res) => {
  const unapproved = {};
  for (const [k, def] of Object.entries(resources)) unapproved[k] = await one(`SELECT COUNT(*) AS c FROM ${def.table} WHERE approved=0`);
  res.render('admin/dashboard', {
    newCount: await one("SELECT COUNT(*) AS c FROM enquiries WHERE status='new'"),
    total: await one('SELECT COUNT(*) AS c FROM enquiries'),
    recent: await db.all('SELECT * FROM enquiries ORDER BY id DESC LIMIT 8'),
    unapproved, resources, live: res.locals.s.site_live,
    paidCount: await one("SELECT COUNT(*) AS c FROM bookings WHERE status='paid'"),
    upcoming: await one("SELECT COUNT(*) AS c FROM bookings WHERE status IN ('paid','confirmed') AND check_in >= ? AND check_in <= ?", todayIST(), calc.addDays(todayIST(), 30))
  });
});

// ---- Settings -------------------------------------------------------------
router.get('/settings', auth.allow(), (req, res) => {
  res.render('admin/settings', { defs: settings.defs, groups: settings.groups, values: res.locals.s, errors: [], saved: req.query.saved === '1' });
});

r.post('/settings', auth.allow(), async (req, res) => {
  const files = fileMap(req);
  const out = {}, errors = [], values = { ...res.locals.s }, newUploads = [], oldUploads = [];
  for (const d of settings.defs) {
    const raw = req.body[d.key];
    let v;
    if (d.type === 'bool') v = raw === '1' ? '1' : '0';
    else if (d.type === 'image') {
      v = res.locals.s[d.key] || '';
      if (files['file__' + d.key]) {
        try { const p = await finalize(files['file__' + d.key]); newUploads.push(p); if (v) oldUploads.push(v); v = p; } catch (e) { errors.push(`${d.label}: ${e.message}`); }
      } else if (req.body['remove__' + d.key] === '1') { if (v) oldUploads.push(v); v = ''; }
    } else {
      v = clean(raw, d.type === 'textarea' ? 8000 : 500);
      if (d.type === 'digits') v = v.replace(/\D/g, '');
      if (d.type === 'url' && v && !isHttpUrl(v)) errors.push(`${d.label}: enter a full URL starting with https://`);
      if (d.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${d.label}: enter a valid email address`);
      if (d.type === 'tel' && v && !/^\+?[\d\s()-]{6,30}$/.test(v)) errors.push(`${d.label}: enter a valid phone number`);
      if (d.type === 'number') { const n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 3650) { errors.push(`${d.label}: enter a number from 0 to 3650`); v = d.def; } else v = String(n); }
      if (d.type === 'seconds') { const n = Number(v); if (v === '' || isNaN(n) || n < 0.3 || n > 30) { errors.push(`${d.label}: enter a number of seconds from 0.3 to 30`); v = d.def; } else v = String(Math.round(n * 10) / 10); }
      if (d.type === 'amount') { const n = parseInt(String(v).replace(/[,\s₹]/g, ''), 10); if (isNaN(n) || n < 0 || n > 10000000) { errors.push(`${d.label}: enter an amount in rupees, numbers only`); v = d.def; } else v = String(n); }
      if (d.type === 'percent') {
        const n = Number(v);
        const min = d.key === 'advance_percent' ? 1 : 0;
        if (v === '' || isNaN(n) || n < min || n > 100) { errors.push(`${d.label}: enter a number from ${min} to 100`); v = d.def; } else v = String(Math.round(n * 100) / 100);
      }
      if (d.type === 'select' && !d.options.some(o => o[0] === v)) { errors.push(`${d.label}: invalid choice`); v = d.def; }
      if (d.key === 'map_embed_url' && v && !/^https:\/\/(www\.google\.com\/maps\/embed|www\.openstreetmap\.org\/export\/embed)/.test(v)) errors.push('Map embed URL must be a Google Maps or OpenStreetMap embed URL.');
    }
    out[d.key] = v;
    values[d.key] = d.type === 'bool' ? v === '1' : v;
  }
  if (errors.length) {
    await Promise.all(newUploads.map(removeUpload));
    return res.status(400).render('admin/settings', { defs: settings.defs, groups: settings.groups, values, errors, saved: false });
  }
  await settings.saveSettings(out);
  await Promise.all(oldUploads.map(removeUpload));
  res.redirect('/admin/settings?saved=1');
});

// ---- Content resources ----------------------------------------------------
const editors = ['admin', 'editor'];
function resource(req, res, next) {
  const def = resources[req.params.res];
  if (!def) return msg(res, 'Not found', 'Unknown content type.', 404);
  req.def = def; req.resName = req.params.res;
  res.locals.def = def; res.locals.resName = req.resName;
  next();
}

r.get('/content/:res', auth.allow(...editors), resource, async (req, res) => {
  res.render('admin/resource-list', { items: await db.all(`SELECT * FROM ${req.def.table} ORDER BY sort_order, id`) });
});

router.get('/content/:res/new', auth.allow(...editors), resource, (req, res) => {
  if (req.def.noCreate) return msg(res, 'Not allowed', 'This content type cannot be added to.', 403);
  res.render('admin/resource-edit', { item: { approved: 0, sort_order: 0 }, errors: {}, isNew: true });
});

r.get('/content/:res/:id', auth.allow(...editors), resource, async (req, res) => {
  const item = await db.get(`SELECT * FROM ${req.def.table} WHERE id=?`, idOf(req.params.id));
  if (!item) return msg(res, 'Not found', 'That item does not exist.', 404);
  res.render('admin/resource-edit', { item, errors: {}, isNew: false, saved: req.query.saved === '1' });
});

async function saveResource(req, res, isNew) {
  const def = req.def, files = fileMap(req);
  const existing = isNew ? {} : await db.get(`SELECT * FROM ${def.table} WHERE id=?`, idOf(req.params.id));
  if (!isNew && !existing) return msg(res, 'Not found', 'That item does not exist.', 404);
  if (isNew && def.noCreate) return msg(res, 'Not allowed', 'This content type cannot be added to.', 403);
  const vals = {}, errors = {}, newUploads = [], oldUploads = [];
  for (const f of def.fields) {
    const raw = req.body[f.name];
    if (f.type === 'text' || f.type === 'textarea') {
      vals[f.name] = clean(raw, f.max || 2000);
      if (f.required && !vals[f.name]) errors[f.name] = 'This field is required.';
    } else if (f.type === 'number') {
      let n = parseInt(raw, 10); if (isNaN(n)) n = 0;
      vals[f.name] = Math.max(f.min ?? -100000, Math.min(f.max ?? 100000, n));
    } else if (f.type === 'bool') {
      vals[f.name] = raw === '1' ? 1 : 0;
    } else if (f.type === 'select') {
      vals[f.name] = f.options.some(o => o[0] === raw) ? raw : (existing[f.name] || f.options[0][0]);
    } else if (f.type === 'image') {
      let v = existing[f.name] || '';
      const file = files['file__' + f.name];
      if (file) {
        try { const p = await finalize(file); newUploads.push(p); if (v) oldUploads.push(v); v = p; } catch (e) { errors[f.name] = e.message; }
      } else if (req.body['remove__' + f.name] === '1') { if (v) oldUploads.push(v); v = ''; }
      vals[f.name] = v;
      if (f.required && !v && !errors[f.name]) errors[f.name] = 'An image is required.';
    }
  }
  if (Object.keys(errors).length) {
    await Promise.all(newUploads.map(removeUpload));
    return res.status(400).render('admin/resource-edit', { item: { ...existing, ...vals, id: existing.id }, errors, isNew });
  }
  const cols = def.fields.map(f => f.name);
  if (isNew) {
    const id = await db.insert(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(c => vals[c]));
    return res.redirect(`/admin/content/${req.resName}/${id}?saved=1`);
  }
  await db.run(`UPDATE ${def.table} SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`, ...cols.map(c => vals[c]), existing.id);
  await Promise.all(oldUploads.map(removeUpload));
  res.redirect(`/admin/content/${req.resName}/${existing.id}?saved=1`);
}

r.post('/content/:res', auth.allow(...editors), resource, (req, res) => saveResource(req, res, true));
r.post('/content/:res/:id', auth.allow(...editors), resource, (req, res) => saveResource(req, res, false));
r.post('/content/:res/:id/delete', auth.allow(...editors), resource, async (req, res) => {
  if (req.def.noDelete) return msg(res, 'Not allowed', 'This item cannot be deleted. Untick "Approved" to hide it instead.', 403);
  const item = await db.get(`SELECT * FROM ${req.def.table} WHERE id=?`, idOf(req.params.id));
  if (item) {
    await db.run(`DELETE FROM ${req.def.table} WHERE id=?`, item.id);
    for (const f of req.def.fields) if (f.type === 'image') await removeUpload(item[f.name]);
  }
  res.redirect(`/admin/content/${req.resName}`);
});

// ---- Enquiries ------------------------------------------------------------
const enq = ['staff'];

function enquiryFilter(q) {
  const w = [], p = [];
  if (STATUSES.includes(q.status)) { w.push('status=?'); p.push(q.status); }
  if (['stay', 'treatment', 'package'].includes(q.type)) { w.push('type=?'); p.push(q.type); }
  if (PREFS.includes(q.pref)) { w.push('accommodation_pref=?'); p.push(q.pref); }
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (d.test(q.from || '')) { w.push('substr(created_at,1,10) >= ?'); p.push(q.from); }
  if (d.test(q.to || '')) { w.push('substr(created_at,1,10) <= ?'); p.push(q.to); }
  if (d.test(q.ci_from || '')) { w.push('check_in >= ?'); p.push(q.ci_from); }
  if (d.test(q.ci_to || '')) { w.push('check_in <= ?'); p.push(q.ci_to); }
  const term = clean(q.q, 100);
  if (term) { w.push('(name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR message ILIKE ?)'); const l = `%${term}%`; p.push(l, l, l, l); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

r.get('/enquiries', auth.allow(...enq), async (req, res) => {
  const { where, params } = enquiryFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 50;
  const total = await one(`SELECT COUNT(*) AS c FROM enquiries ${where}`, ...params);
  const rows = await db.all(`SELECT * FROM enquiries ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => k !== 'page' && v && typeof v === 'string')).toString();
  res.render('admin/enquiries', { rows, total, page, pages: Math.max(1, Math.ceil(total / size)), q: req.query, qs, STATUSES, PREFS });
});

function sendCsv(res, name, cols, rows) {
  const csv = '\ufeff' + cols.join(',') + '\r\n' + rows.map(x => cols.map(c => csvCell(x[c])).join(',')).join('\r\n') + '\r\n';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}-${todayIST()}.csv"`);
  res.send(csv);
}

r.get('/enquiries/export.csv', auth.allow(...enq), async (req, res) => {
  const { where, params } = enquiryFilter(req.query);
  sendCsv(res, 'enquiries', ['id', 'type', 'status', 'created_at', 'updated_at', 'name', 'phone', 'email', 'check_in', 'check_out', 'adults', 'children', 'accommodation_pref', 'units', 'treatment', 'message', 'internal_notes'],
    await db.all(`SELECT * FROM enquiries ${where} ORDER BY id DESC`, ...params));
});

r.get('/enquiries/:id', auth.allow(...enq), async (req, res) => {
  const e = await db.get('SELECT * FROM enquiries WHERE id=?', idOf(req.params.id));
  if (!e) return msg(res, 'Not found', 'That enquiry does not exist.', 404);
  res.render('admin/enquiry', { e, guest: e.guest_id ? await guests.get(e.guest_id) : null, STATUSES, saved: req.query.saved === '1' });
});

r.post('/enquiries/:id', auth.allow(...enq), async (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) return msg(res, 'Invalid', 'Choose a valid status.', 400);
  const x = await db.run('UPDATE enquiries SET status=?, internal_notes=?, updated_at=? WHERE id=?',
    status, clean(req.body.internal_notes, 4000), new Date().toISOString(), idOf(req.params.id));
  if (!x.changes) return msg(res, 'Not found', 'That enquiry does not exist.', 404);
  res.redirect(`/admin/enquiries/${idOf(req.params.id)}?saved=1`);
});

r.post('/enquiries/:id/delete', auth.allow(), async (req, res) => {
  await db.run('DELETE FROM enquiries WHERE id=?', idOf(req.params.id));
  res.redirect('/admin/enquiries');
});

// ---- Bookings -------------------------------------------------------------
const BSTATUSES = Object.keys(booking.STATUS_LABEL);
// Statuses staff may set by hand. Payment states come only from the payment gateway.
const MANUAL = { paid: ['confirmed', 'cancelled', 'refunded'], confirmed: ['cancelled', 'refunded'], cancelled: ['refunded', 'confirmed'], pending_payment: ['cancelled'] };

function bookingFilter(q) {
  const w = [], p = [];
  if (BSTATUSES.includes(q.status)) { w.push('status=?'); p.push(q.status); }
  else if (q.status !== 'all') w.push("status NOT IN ('expired','failed')");
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (d.test(q.ci_from || '')) { w.push('check_in >= ?'); p.push(q.ci_from); }
  if (d.test(q.ci_to || '')) { w.push('check_in <= ?'); p.push(q.ci_to); }
  const term = clean(q.q, 100);
  if (term) { w.push('(ref ILIKE ? OR name ILIKE ? OR phone ILIKE ? OR email ILIKE ?)'); const l = `%${term}%`; p.push(l, l, l, l); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

r.get('/bookings', auth.allow(...enq), async (req, res) => {
  await booking.expireHolds();
  const { where, params } = bookingFilter(req.query);
  const rows = await db.all(`SELECT * FROM bookings ${where} ORDER BY id DESC LIMIT 200`, ...params);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([, v]) => v && typeof v === 'string')).toString();
  res.render('admin/bookings', { rows, q: req.query, qs, BSTATUSES, LABEL: booking.STATUS_LABEL, rupees: booking.rupees });
});

r.get('/bookings/export.csv', auth.allow(...enq), async (req, res) => {
  const { where, params } = bookingFilter(req.query);
  sendCsv(res, 'bookings', ['ref', 'status', 'created_at', 'paid_at', 'name', 'phone', 'email', 'check_in', 'check_out', 'nights', 'cottage_units', 'standard_units', 'adults', 'children',
    'cottage_rate', 'standard_rate', 'gst_percent', 'subtotal_paise', 'gst_paise', 'total_paise', 'pay_now_paise', 'provider', 'provider_order_id', 'provider_payment_id', 'message', 'internal_notes'],
  await db.all(`SELECT * FROM bookings ${where} ORDER BY id DESC`, ...params));
});

const futureBlocks = () => db.all('SELECT * FROM room_blocks WHERE end_date >= ? ORDER BY start_date', todayIST());

r.get('/bookings/blocks', auth.allow(...enq), async (req, res) => {
  res.render('admin/blocks', { blocks: await futureBlocks(), error: '', form: {}, ok: req.query.ok === '1' });
});

r.post('/bookings/blocks', auth.allow(...enq), async (req, res) => {
  const f = { kind: req.body.kind, start_date: clean(req.body.start_date, 10), last_night: clean(req.body.last_night, 10), units: parseInt(req.body.units, 10), note: clean(req.body.note, 300) };
  const types = Object.fromEntries((await db.all('SELECT kind,total_units FROM accommodation_types')).map(x => [x.kind, x.total_units]));
  let error = '';
  if (!(f.kind in types)) error = 'Choose a room type.';
  else if (!calc.isDate(f.start_date) || !calc.isDate(f.last_night)) error = 'Enter the first and last night.';
  else if (f.last_night < f.start_date) error = 'The last night must be on or after the first night.';
  else if (!(f.units >= 1 && f.units <= types[f.kind])) error = `Enter 1 to ${types[f.kind]} units.`;
  if (error) return res.status(400).render('admin/blocks', { blocks: await futureBlocks(), error, form: f, ok: false });
  await db.run('INSERT INTO room_blocks(kind,start_date,end_date,units,note,created_at) VALUES (?,?,?,?,?,?)',
    f.kind, f.start_date, calc.addDays(f.last_night, 1), f.units, f.note, new Date().toISOString());
  res.redirect('/admin/bookings/blocks?ok=1');
});

r.post('/bookings/blocks/:id/delete', auth.allow(...enq), async (req, res) => {
  await db.run('DELETE FROM room_blocks WHERE id=?', idOf(req.params.id));
  res.redirect('/admin/bookings/blocks');
});

r.get('/bookings/:id', auth.allow(...enq), async (req, res) => {
  const b = await db.get('SELECT * FROM bookings WHERE id=?', idOf(req.params.id));
  if (!b) return msg(res, 'Not found', 'That booking does not exist.', 404);
  res.render('admin/booking', {
    b: booking.publicView(b), guest: b.guest_id ? await guests.get(b.guest_id) : null, next: MANUAL[b.status] || [],
    LABEL: booking.STATUS_LABEL, rupees: booking.rupees, saved: req.query.saved === '1',
    gatewayUrl: b.provider === 'razorpay' && b.provider_payment_id ? `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(b.provider_payment_id)}` : ''
  });
});

r.post('/bookings/:id', auth.allow(...enq), async (req, res) => {
  const b = await db.get('SELECT * FROM bookings WHERE id=?', idOf(req.params.id));
  if (!b) return msg(res, 'Not found', 'That booking does not exist.', 404);
  let status = b.status;
  const want = String(req.body.status || '');
  if (want && want !== b.status) {
    if (!(MANUAL[b.status] || []).includes(want)) return msg(res, 'Not allowed', 'That status change is not allowed.', 400);
    status = want;
  }
  const now = new Date().toISOString();
  let notes = clean(req.body.internal_notes, 4000);
  if (status !== b.status) notes = (notes ? notes + '\n' : '') + `[${now}] ${req.user.name}: ${booking.STATUS_LABEL[b.status]} -> ${booking.STATUS_LABEL[status]}`;
  await db.run('UPDATE bookings SET status=?, internal_notes=?, updated_at=? WHERE id=?', status, notes, now, b.id);
  res.redirect(`/admin/bookings/${b.id}?saved=1`);
});

// ---- Guest profiles -------------------------------------------------------
function guestForm(body) {
  const f = {
    name: clean(body.name, 100), phone: clean(body.phone, 30), email: clean(body.email, 254).toLowerCase(),
    alt_phone: clean(body.alt_phone, 30), city: clean(body.city, 100), country: clean(body.country, 100), notes: clean(body.notes, 4000)
  };
  const errors = {};
  if (!f.name) errors.name = 'Enter a name.';
  if (f.phone && !/^\+?[\d\s()-]{8,30}$/.test(f.phone)) errors.phone = 'Enter a valid phone number with country code.';
  if (f.alt_phone && !/^\+?[\d\s()-]{8,30}$/.test(f.alt_phone)) errors.alt_phone = 'Enter a valid phone number.';
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errors.email = 'Enter a valid email address.';
  if (!f.phone && !f.email) errors.phone = 'Enter a phone number or an email address.';
  return { f, errors };
}

async function guestPage(res, g, extra = {}) {
  res.render('admin/guest', {
    g, h: await guests.history(g.id), dups: await guests.possibleDuplicates(g), LABEL: booking.STATUS_LABEL, rupees: booking.rupees,
    errors: {}, saved: false, ...extra
  });
}

r.get('/guests', auth.allow(...enq), async (req, res) => {
  const rows = await guests.list(req.query);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([, v]) => v && typeof v === 'string')).toString();
  res.render('admin/guests', { rows: rows.slice(0, 300), total: rows.length, q: req.query, qs, rupees: booking.rupees });
});

r.get('/guests/export.csv', auth.allow(...enq), async (req, res) => {
  sendCsv(res, 'guests', ['id', 'name', 'phone', 'alt_phone', 'email', 'city', 'country', 'bookings_count', 'stays_count', 'nights', 'max_party', 'paid_paise', 'value_paise', 'last_stay', 'next_stay', 'enquiries_count', 'first_seen_at', 'last_seen_at', 'source', 'notes'],
    await guests.list(req.query));
});

router.get('/guests/new', auth.allow(...enq), (req, res) => res.render('admin/guest-new', { f: {}, errors: {} }));

r.post('/guests/new', auth.allow(...enq), async (req, res) => {
  const { f, errors } = guestForm(req.body);
  if (Object.keys(errors).length) return res.status(400).render('admin/guest-new', { f, errors });
  res.redirect(`/admin/guests/${await guests.create(f)}?saved=1`);
});

r.get('/guests/:id', auth.allow(...enq), async (req, res) => {
  const g = await guests.get(idOf(req.params.id));
  if (!g) return msg(res, 'Not found', 'That guest does not exist.', 404);
  await guestPage(res, g, { saved: req.query.saved === '1', merged: req.query.merged === '1' });
});

r.post('/guests/:id', auth.allow(...enq), async (req, res) => {
  const g = await guests.get(idOf(req.params.id));
  if (!g) return msg(res, 'Not found', 'That guest does not exist.', 404);
  const { f, errors } = guestForm(req.body);
  if (Object.keys(errors).length) return guestPage(res.status(400), { ...g, ...f }, { errors });
  await guests.update(g.id, f);
  res.redirect(`/admin/guests/${g.id}?saved=1`);
});

r.post('/guests/:id/merge', auth.allow(...enq), async (req, res) => {
  const into = idOf(req.params.id), from = idOf(req.body.from);
  if (!(await guests.get(into)) || !(await guests.get(from))) return msg(res, 'Not found', 'That guest does not exist.', 404);
  await guests.merge(into, from);
  res.redirect(`/admin/guests/${into}?merged=1`);
});

r.post('/guests/:id/delete', auth.allow(), async (req, res) => {
  await guests.remove(idOf(req.params.id));
  res.redirect('/admin/guests');
});

// ---- Users and account ----------------------------------------------------
const userList = () => db.all('SELECT id,email,name,role,active,last_login_at FROM users ORDER BY id');

r.get('/users', auth.allow(), async (req, res) => {
  res.render('admin/users', { users: await userList(), error: '', ok: req.query.ok === '1' });
});

r.post('/users', auth.allow(), async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase(), name = clean(req.body.name, 100);
  const role = ['admin', 'editor', 'staff'].includes(req.body.role) ? req.body.role : '';
  const pw = String(req.body.password || '');
  let error = '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = 'Enter a valid email address.';
  else if (!name) error = 'Enter a name.';
  else if (!role) error = 'Choose a role.';
  else if (pw.length < 12) error = 'The password must be at least 12 characters.';
  else if (await db.get('SELECT 1 AS x FROM users WHERE email=?', email)) error = 'A user with that email already exists.';
  if (error) return res.status(400).render('admin/users', { users: await userList(), error, ok: false });
  await db.run('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)',
    email, name, await bcrypt.hash(pw, 12), role, new Date().toISOString());
  res.redirect('/admin/users?ok=1');
});

r.post('/users/:id/toggle', auth.allow(), async (req, res) => {
  const id = idOf(req.params.id);
  if (id === req.user.id) return msg(res, 'Not allowed', 'You cannot deactivate your own account.', 400);
  await db.run('UPDATE users SET active = 1 - active WHERE id=?', id);
  await auth.destroyUserSessions(id);
  res.redirect('/admin/users');
});

router.get('/account', (req, res) => res.render('admin/account', { error: '', ok: false }));
r.post('/account', async (req, res) => {
  const row = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
  const cur = String(req.body.current || ''), pw = String(req.body.password || '');
  let error = '';
  if (!(await bcrypt.compare(cur, row.password_hash))) error = 'Your current password is incorrect.';
  else if (pw.length < 12) error = 'The new password must be at least 12 characters.';
  else if (pw !== String(req.body.confirm || '')) error = 'The new passwords do not match.';
  if (error) return res.status(400).render('admin/account', { error, ok: false });
  await db.run('UPDATE users SET password_hash=? WHERE id=?', await bcrypt.hash(pw, 12), req.user.id);
  await auth.destroyUserSessions(req.user.id);
  await auth.destroySession(req, res);
  res.render('admin/login', { error: '', email: '', info: 'Password changed. Please sign in again.' });
});

// ---- Pre-launch checklist -------------------------------------------------
const CHECKLIST = [
  { id: 'whatsapp', label: 'Booking WhatsApp number is correct, on WhatsApp and monitored', link: '/admin/settings' },
  { id: 'contacts', label: 'Both phone numbers and the email address are correct', link: '/admin/settings' },
  { id: 'location', label: 'Address is correct and the map pin is confirmed', link: '/admin/settings' },
  { id: 'inventory', label: '8 cottages and 7 standard rooms are correctly shown', link: '/admin/content/accommodation' },
  { id: 'rooms', label: 'Room capacities, features, rates and availability wording are approved', link: '/admin/content/accommodation' },
  { id: 'treatments', label: 'Treatment list, descriptions and practitioner details are approved', link: '/admin/content/treatments' },
  { id: 'facilities', label: 'Facilities and experiences are owner-confirmed', link: '/admin/content/facilities' },
  { id: 'payments', label: 'Razorpay live keys and webhook are set; room prices, guest limits, GST and advance are approved; a test booking was paid and refunded', link: '/admin/settings' },
  { id: 'policies', label: 'Check-in/check-out times and booking policies are approved', link: '/admin/settings' },
  { id: 'testimonials', label: 'Testimonial permission and exact wording are confirmed', link: '/admin/content/testimonials' },
  { id: 'images', label: 'Image rights and alt text are confirmed', link: '/admin/content/gallery' },
  { id: 'privacy', label: 'Privacy policy and enquiry retention period are approved', link: '/admin/settings' },
  { id: 'seo', label: 'Page titles, descriptions and structured data have been checked', link: '/' }
];

r.get('/checklist', auth.allow(), async (req, res) => {
  const s = res.locals.s;
  const checked = new Set((await db.all("SELECT key FROM settings WHERE key LIKE 'chk_%' AND value='1'")).map(x => x.key.slice(4)));
  const count = t => one(`SELECT COUNT(*) AS c FROM ${t} WHERE approved=0`);
  const published = t => one(`SELECT COUNT(*) AS c FROM ${t} WHERE approved=1`);
  const hints = {
    whatsapp: `Currently sending to +${res.locals.waNumber || '(none)'}`,
    contacts: s.contact_email ? 'Public email is set.' : 'No public email set (it is hidden on the site).',
    location: s.map_confirmed ? 'Map pin marked as confirmed.' : 'Map and directions are hidden until confirmed.',
    rooms: !s.check_in_time || !s.check_out_time ? 'Check-in/out times are empty (hidden).' : '',
    treatments: `${await count('treatments')} unapproved, ${await published('treatments')} published.`,
    facilities: `${await count('facilities')} unapproved, ${await published('facilities')} published.`,
    testimonials: `${await count('testimonials')} unapproved.`,
    images: `${await count('gallery')} unapproved gallery images.`,
    payments: { razorpay: payments.isTestKey() ? 'Razorpay TEST keys in use.' : 'Razorpay live keys in use.', dev: 'No Razorpay keys: development simulation only.', '': 'No Razorpay keys: online booking is closed.' }[payments.provider()],
    privacy: `Retention: ${Number(s.retention_days) ? s.retention_days + ' days' : 'keep until deleted'}.`
  };
  res.render('admin/checklist', { items: CHECKLIST, checked, hints, review: settings.defs.filter(d => d.review), s, saved: req.query.saved === '1' });
});

r.post('/checklist', auth.allow(), async (req, res) => {
  const out = {};
  for (const i of CHECKLIST) out['chk_' + i.id] = req.body['chk_' + i.id] === '1' ? '1' : '0';
  await settings.saveSettings(out);
  res.redirect('/admin/checklist?saved=1');
});

module.exports = router;
