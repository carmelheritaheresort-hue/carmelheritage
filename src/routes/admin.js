const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const auth = require('../auth');
const settings = require('../settings');
const resources = require('../resources');
const { upload, finalize, removeUpload } = require('../uploads');
const { wrap, fmtDateTime, csvCell, isHttpUrl, todayIST } = require('../util');
const booking = require('../booking');
const guests = require('../guests');
const calc = require('../../public/js/booking-calc.js');

const router = express.Router();
const STATUSES = ['new', 'contacted', 'confirmed', 'declined', 'cancelled'];
const PREFS = ['cottage', 'standard', 'either'];
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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

router.post('/login', loginLimiter, express.urlencoded({ extended: false, limit: '10kb' }), wrap(async (req, res) => {
  const user = await auth.verifyLogin(req.body.email, req.body.password);
  if (!user) return res.status(401).render('admin/login', { error: 'Incorrect email or password.', email: String(req.body.email || '').slice(0, 254) });
  auth.purgeSessions();
  auth.createSession(res, user.id);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(new Date().toISOString(), user.id);
  res.redirect('/admin');
}));

router.use(auth.requireAuth);

router.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (req.method === 'POST' && ct.startsWith('multipart/form-data')) return upload.any()(req, res, next);
  return express.urlencoded({ extended: false, limit: '200kb' })(req, res, next);
});
router.use(auth.checkCsrf);

router.post('/logout', (req, res) => { auth.destroySession(req, res); res.redirect('/admin/login'); });

const msg = (res, title, message, status = 200) => res.status(status).render('admin/message', { title, message });
const clean = (v, max) => String(v == null ? '' : v).replace(CTRL, '').trim().slice(0, max);
const fileMap = req => Object.fromEntries((req.files || []).map(f => [f.fieldname, f]));
const discard = req => { for (const f of req.files || []) require('fs').unlink(f.path, () => {}); };

// ---- Dashboard ------------------------------------------------------------
router.get('/', wrap(async (req, res) => {
  const one = sql => db.prepare(sql).get().c;
  const unapproved = {};
  for (const [k, r] of Object.entries(resources)) unapproved[k] = one(`SELECT COUNT(*) c FROM ${r.table} WHERE approved=0`);
  res.render('admin/dashboard', {
    newCount: one("SELECT COUNT(*) c FROM enquiries WHERE status='new'"),
    total: one('SELECT COUNT(*) c FROM enquiries'),
    recent: db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 8').all(),
    unapproved, resources, live: res.locals.s.site_live,
    paidCount: one("SELECT COUNT(*) c FROM bookings WHERE status='paid'"),
    upcoming: db.prepare("SELECT COUNT(*) c FROM bookings WHERE status IN ('paid','confirmed') AND check_in >= ? AND check_in <= ?").get(todayIST(), calc.addDays(todayIST(), 30)).c
  });
}));

// ---- Settings -------------------------------------------------------------
router.get('/settings', auth.allow(), (req, res) => {
  res.render('admin/settings', { defs: settings.defs, groups: settings.groups, values: res.locals.s, errors: [], saved: req.query.saved === '1' });
});

router.post('/settings', auth.allow(), wrap(async (req, res) => {
  const files = fileMap(req);
  const out = {}, errors = [], values = { ...res.locals.s };
  for (const d of settings.defs) {
    const raw = req.body[d.key];
    let v;
    if (d.type === 'bool') v = raw === '1' ? '1' : '0';
    else if (d.type === 'image') {
      v = res.locals.s[d.key] || '';
      if (files['file__' + d.key]) {
        try { const p = await finalize(files['file__' + d.key]); removeUpload(v); v = p; } catch (e) { errors.push(`${d.label}: ${e.message}`); }
      } else if (req.body['remove__' + d.key] === '1') { removeUpload(v); v = ''; }
    } else {
      v = clean(raw, d.type === 'textarea' ? 8000 : 500);
      if (d.type === 'digits') v = v.replace(/\D/g, '');
      if (d.type === 'url' && v && !isHttpUrl(v)) errors.push(`${d.label}: enter a full URL starting with https://`);
      if (d.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${d.label}: enter a valid email address`);
      if (d.type === 'tel' && v && !/^\+?[\d\s()-]{6,30}$/.test(v)) errors.push(`${d.label}: enter a valid phone number`);
      if (d.type === 'number') { const n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 3650) { errors.push(`${d.label}: enter a number from 0 to 3650`); v = d.def; } else v = String(n); }
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
  if (errors.length) { discard(req); return res.status(400).render('admin/settings', { defs: settings.defs, groups: settings.groups, values, errors, saved: false }); }
  settings.saveSettings(out);
  res.redirect('/admin/settings?saved=1');
}));

// ---- Content resources ----------------------------------------------------
const content = ['admin', 'editor'];
function resource(req, res, next) {
  const def = resources[req.params.res];
  if (!def) return msg(res, 'Not found', 'Unknown content type.', 404);
  req.def = def; req.resName = req.params.res;
  res.locals.def = def; res.locals.resName = req.resName;
  next();
}

router.get('/content/:res', auth.allow(...content), resource, (req, res) => {
  const items = db.prepare(`SELECT * FROM ${req.def.table} ORDER BY sort_order, id`).all();
  res.render('admin/resource-list', { items });
});

router.get('/content/:res/new', auth.allow(...content), resource, (req, res) => {
  if (req.def.noCreate) return msg(res, 'Not allowed', 'This content type cannot be added to.', 403);
  res.render('admin/resource-edit', { item: { approved: 0, sort_order: 0 }, errors: {}, isNew: true });
});

router.get('/content/:res/:id', auth.allow(...content), resource, (req, res) => {
  const item = db.prepare(`SELECT * FROM ${req.def.table} WHERE id=?`).get(req.params.id);
  if (!item) return msg(res, 'Not found', 'That item does not exist.', 404);
  res.render('admin/resource-edit', { item, errors: {}, isNew: false, saved: req.query.saved === '1' });
});

async function saveResource(req, res, isNew) {
  const def = req.def, files = fileMap(req);
  const existing = isNew ? {} : db.prepare(`SELECT * FROM ${def.table} WHERE id=?`).get(req.params.id);
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
    discard(req); newUploads.forEach(removeUpload);
    return res.status(400).render('admin/resource-edit', { item: { ...existing, ...vals, id: existing.id }, errors, isNew });
  }
  const cols = def.fields.map(f => f.name);
  if (isNew) {
    const info = db.prepare(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => vals[c]));
    return res.redirect(`/admin/content/${req.resName}/${info.lastInsertRowid}?saved=1`);
  }
  db.prepare(`UPDATE ${def.table} SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => vals[c]), existing.id);
  oldUploads.forEach(removeUpload);
  res.redirect(`/admin/content/${req.resName}/${existing.id}?saved=1`);
}

router.post('/content/:res', auth.allow(...content), resource, wrap((req, res) => saveResource(req, res, true)));
router.post('/content/:res/:id', auth.allow(...content), resource, wrap((req, res) => saveResource(req, res, false)));
router.post('/content/:res/:id/delete', auth.allow(...content), resource, (req, res) => {
  if (req.def.noDelete) return msg(res, 'Not allowed', 'This item cannot be deleted. Untick "Approved" to hide it instead.', 403);
  const item = db.prepare(`SELECT * FROM ${req.def.table} WHERE id=?`).get(req.params.id);
  if (item) {
    db.prepare(`DELETE FROM ${req.def.table} WHERE id=?`).run(item.id);
    for (const f of req.def.fields) if (f.type === 'image') removeUpload(item[f.name]);
  }
  res.redirect(`/admin/content/${req.resName}`);
});

// ---- Enquiries ------------------------------------------------------------
const enq = ['staff'];

function enquiryFilter(q) {
  const w = [], p = [];
  if (STATUSES.includes(q.status)) { w.push('status=?'); p.push(q.status); }
  if (['stay', 'treatment'].includes(q.type)) { w.push('type=?'); p.push(q.type); }
  if (PREFS.includes(q.pref)) { w.push('accommodation_pref=?'); p.push(q.pref); }
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (d.test(q.from || '')) { w.push('substr(created_at,1,10) >= ?'); p.push(q.from); }
  if (d.test(q.to || '')) { w.push('substr(created_at,1,10) <= ?'); p.push(q.to); }
  if (d.test(q.ci_from || '')) { w.push('check_in >= ?'); p.push(q.ci_from); }
  if (d.test(q.ci_to || '')) { w.push('check_in <= ?'); p.push(q.ci_to); }
  const term = clean(q.q, 100);
  if (term) { w.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ?)'); const l = `%${term}%`; p.push(l, l, l, l); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

router.get('/enquiries', auth.allow(...enq), (req, res) => {
  const { where, params } = enquiryFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 50;
  const total = db.prepare(`SELECT COUNT(*) c FROM enquiries ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM enquiries ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, size, (page - 1) * size);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => k !== 'page' && v && typeof v === 'string')).toString();
  res.render('admin/enquiries', { rows, total, page, pages: Math.max(1, Math.ceil(total / size)), q: req.query, qs, STATUSES, PREFS });
});

router.get('/enquiries/export.csv', auth.allow(...enq), (req, res) => {
  const { where, params } = enquiryFilter(req.query);
  const rows = db.prepare(`SELECT * FROM enquiries ${where} ORDER BY id DESC`).all(...params);
  const cols = ['id', 'type', 'status', 'created_at', 'updated_at', 'name', 'phone', 'email', 'check_in', 'check_out', 'adults', 'children', 'accommodation_pref', 'units', 'treatment', 'message', 'internal_notes'];
  const csv = '\ufeff' + cols.join(',') + '\r\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\r\n') + '\r\n';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="enquiries-${todayIST()}.csv"`);
  res.send(csv);
});

router.get('/enquiries/:id', auth.allow(...enq), (req, res) => {
  const e = db.prepare('SELECT * FROM enquiries WHERE id=?').get(req.params.id);
  if (!e) return msg(res, 'Not found', 'That enquiry does not exist.', 404);
  res.render('admin/enquiry', { e, guest: e.guest_id ? guests.get(e.guest_id) : null, STATUSES, saved: req.query.saved === '1' });
});

router.post('/enquiries/:id', auth.allow(...enq), (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) return msg(res, 'Invalid', 'Choose a valid status.', 400);
  const r = db.prepare('UPDATE enquiries SET status=?, internal_notes=?, updated_at=? WHERE id=?')
    .run(status, clean(req.body.internal_notes, 4000), new Date().toISOString(), req.params.id);
  if (!r.changes) return msg(res, 'Not found', 'That enquiry does not exist.', 404);
  res.redirect(`/admin/enquiries/${req.params.id}?saved=1`);
});

router.post('/enquiries/:id/delete', auth.allow(), (req, res) => {
  db.prepare('DELETE FROM enquiries WHERE id=?').run(req.params.id);
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
  if (term) { w.push('(ref LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ?)'); const l = `%${term}%`; p.push(l, l, l, l); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

router.get('/bookings', auth.allow(...enq), (req, res) => {
  booking.expireHolds();
  const { where, params } = bookingFilter(req.query);
  const rows = db.prepare(`SELECT * FROM bookings ${where} ORDER BY id DESC LIMIT 200`).all(...params);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([, v]) => v && typeof v === 'string')).toString();
  res.render('admin/bookings', { rows, q: req.query, qs, BSTATUSES, LABEL: booking.STATUS_LABEL, rupees: booking.rupees });
});

router.get('/bookings/export.csv', auth.allow(...enq), (req, res) => {
  const { where, params } = bookingFilter(req.query);
  const rows = db.prepare(`SELECT * FROM bookings ${where} ORDER BY id DESC`).all(...params);
  const cols = ['ref', 'status', 'created_at', 'paid_at', 'name', 'phone', 'email', 'check_in', 'check_out', 'nights', 'cottage_units', 'standard_units', 'adults', 'children',
    'cottage_rate', 'standard_rate', 'gst_percent', 'subtotal_paise', 'gst_paise', 'total_paise', 'pay_now_paise', 'provider', 'provider_order_id', 'provider_payment_id', 'message', 'internal_notes'];
  const csv = '\ufeff' + cols.join(',') + '\r\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\r\n') + '\r\n';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="bookings-${todayIST()}.csv"`);
  res.send(csv);
});

router.get('/bookings/blocks', auth.allow(...enq), (req, res) => {
  res.render('admin/blocks', { blocks: db.prepare('SELECT * FROM room_blocks WHERE end_date >= ? ORDER BY start_date').all(todayIST()), error: '', form: {}, ok: req.query.ok === '1' });
});

router.post('/bookings/blocks', auth.allow(...enq), (req, res) => {
  const f = { kind: req.body.kind, start_date: clean(req.body.start_date, 10), last_night: clean(req.body.last_night, 10), units: parseInt(req.body.units, 10), note: clean(req.body.note, 300) };
  const types = Object.fromEntries(db.prepare('SELECT kind,total_units FROM accommodation_types').all().map(r => [r.kind, r.total_units]));
  let error = '';
  if (!(f.kind in types)) error = 'Choose a room type.';
  else if (!calc.isDate(f.start_date) || !calc.isDate(f.last_night)) error = 'Enter the first and last night.';
  else if (f.last_night < f.start_date) error = 'The last night must be on or after the first night.';
  else if (!(f.units >= 1 && f.units <= types[f.kind])) error = `Enter 1 to ${types[f.kind]} units.`;
  f.end_date = calc.isDate(f.last_night) ? calc.addDays(f.last_night, 1) : '';
  if (error) return res.status(400).render('admin/blocks', { blocks: db.prepare('SELECT * FROM room_blocks WHERE end_date >= ? ORDER BY start_date').all(todayIST()), error, form: f, ok: false });
  db.prepare('INSERT INTO room_blocks(kind,start_date,end_date,units,note,created_at) VALUES (?,?,?,?,?,?)')
    .run(f.kind, f.start_date, f.end_date, f.units, f.note, new Date().toISOString());
  res.redirect('/admin/bookings/blocks?ok=1');
});

router.post('/bookings/blocks/:id/delete', auth.allow(...enq), (req, res) => {
  db.prepare('DELETE FROM room_blocks WHERE id=?').run(req.params.id);
  res.redirect('/admin/bookings/blocks');
});

router.get('/bookings/:id', auth.allow(...enq), (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!b) return msg(res, 'Not found', 'That booking does not exist.', 404);
  res.render('admin/booking', { b: booking.publicView(b), guest: b.guest_id ? guests.get(b.guest_id) : null, next: MANUAL[b.status] || [], LABEL: booking.STATUS_LABEL, rupees: booking.rupees, saved: req.query.saved === '1',
    gatewayUrl: b.provider === 'razorpay' && b.provider_payment_id ? `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(b.provider_payment_id)}` : '' });
});

router.post('/bookings/:id', auth.allow(...enq), (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
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
  db.prepare('UPDATE bookings SET status=?, internal_notes=?, updated_at=? WHERE id=?').run(status, notes, now, b.id);
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

function guestPage(res, g, extra = {}) {
  res.render('admin/guest', { g, h: guests.history(g.id), dups: guests.possibleDuplicates(g), LABEL: booking.STATUS_LABEL, rupees: booking.rupees,
    errors: {}, saved: false, ...extra });
}

router.get('/guests', auth.allow(...enq), (req, res) => {
  const rows = guests.list(req.query);
  const qs = new URLSearchParams(Object.entries(req.query).filter(([, v]) => v && typeof v === 'string')).toString();
  res.render('admin/guests', { rows: rows.slice(0, 300), total: rows.length, q: req.query, qs, rupees: booking.rupees });
});

router.get('/guests/export.csv', auth.allow(...enq), (req, res) => {
  const rows = guests.list(req.query);
  const cols = ['id', 'name', 'phone', 'alt_phone', 'email', 'city', 'country', 'bookings_count', 'stays_count', 'nights', 'max_party', 'paid_paise', 'value_paise', 'last_stay', 'next_stay', 'enquiries_count', 'first_seen_at', 'last_seen_at', 'source', 'notes'];
  const csv = '\ufeff' + cols.join(',') + '\r\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\r\n') + '\r\n';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="guests-${todayIST()}.csv"`);
  res.send(csv);
});

router.get('/guests/new', auth.allow(...enq), (req, res) => res.render('admin/guest-new', { f: {}, errors: {} }));

router.post('/guests/new', auth.allow(...enq), (req, res) => {
  const { f, errors } = guestForm(req.body);
  if (Object.keys(errors).length) return res.status(400).render('admin/guest-new', { f, errors });
  res.redirect(`/admin/guests/${guests.create(f)}?saved=1`);
});

router.get('/guests/:id', auth.allow(...enq), (req, res) => {
  const g = guests.get(req.params.id);
  if (!g) return msg(res, 'Not found', 'That guest does not exist.', 404);
  guestPage(res, g, { saved: req.query.saved === '1', merged: req.query.merged === '1' });
});

router.post('/guests/:id', auth.allow(...enq), (req, res) => {
  const g = guests.get(req.params.id);
  if (!g) return msg(res, 'Not found', 'That guest does not exist.', 404);
  const { f, errors } = guestForm(req.body);
  if (Object.keys(errors).length) return guestPage(res.status(400), { ...g, ...f }, { errors });
  guests.update(g.id, f);
  res.redirect(`/admin/guests/${g.id}?saved=1`);
});

router.post('/guests/:id/merge', auth.allow(...enq), (req, res) => {
  const from = Number(req.body.from);
  if (!guests.get(req.params.id) || !guests.get(from)) return msg(res, 'Not found', 'That guest does not exist.', 404);
  guests.merge(req.params.id, from);
  res.redirect(`/admin/guests/${req.params.id}?merged=1`);
});

router.post('/guests/:id/delete', auth.allow(), (req, res) => {
  guests.remove(req.params.id);
  res.redirect('/admin/guests');
});

// ---- Users and account ----------------------------------------------------
router.get('/users', auth.allow(), (req, res) => {
  res.render('admin/users', { users: db.prepare('SELECT id,email,name,role,active,last_login_at FROM users ORDER BY id').all(), error: '', ok: req.query.ok === '1' });
});

router.post('/users', auth.allow(), wrap(async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase(), name = clean(req.body.name, 100);
  const role = ['admin', 'editor', 'staff'].includes(req.body.role) ? req.body.role : '';
  const pw = String(req.body.password || '');
  let error = '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = 'Enter a valid email address.';
  else if (!name) error = 'Enter a name.';
  else if (!role) error = 'Choose a role.';
  else if (pw.length < 12) error = 'The password must be at least 12 characters.';
  else if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) error = 'A user with that email already exists.';
  if (error) return res.status(400).render('admin/users', { users: db.prepare('SELECT id,email,name,role,active,last_login_at FROM users ORDER BY id').all(), error, ok: false });
  db.prepare('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)')
    .run(email, name, await bcrypt.hash(pw, 12), role, new Date().toISOString());
  res.redirect('/admin/users?ok=1');
}));

router.post('/users/:id/toggle', auth.allow(), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return msg(res, 'Not allowed', 'You cannot deactivate your own account.', 400);
  db.prepare('UPDATE users SET active = 1 - active WHERE id=?').run(id);
  auth.destroyUserSessions(id);
  res.redirect('/admin/users');
});

router.get('/account', (req, res) => res.render('admin/account', { error: '', ok: false }));
router.post('/account', wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const cur = String(req.body.current || ''), pw = String(req.body.password || '');
  let error = '';
  if (!(await bcrypt.compare(cur, row.password_hash))) error = 'Your current password is incorrect.';
  else if (pw.length < 12) error = 'The new password must be at least 12 characters.';
  else if (pw !== String(req.body.confirm || '')) error = 'The new passwords do not match.';
  if (error) return res.status(400).render('admin/account', { error, ok: false });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(pw, 12), req.user.id);
  auth.destroyUserSessions(req.user.id);
  auth.destroySession(req, res);
  res.render('admin/login', { error: '', email: '', info: 'Password changed. Please sign in again.' });
}));

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

router.get('/checklist', auth.allow(), (req, res) => {
  const s = res.locals.s;
  const checked = new Set(db.prepare("SELECT key FROM settings WHERE key LIKE 'chk_%' AND value='1'").all().map(r => r.key.slice(4)));
  const count = (t, extra = '') => db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE approved=0 ${extra}`).get().c;
  const hints = {
    whatsapp: `Currently sending to +${res.locals.waNumber || '(none)'}`,
    contacts: s.contact_email ? 'Public email is set.' : 'No public email set (it is hidden on the site).',
    location: s.map_confirmed ? 'Map pin marked as confirmed.' : 'Map and directions are hidden until confirmed.',
    rooms: !s.check_in_time || !s.check_out_time ? 'Check-in/out times are empty (hidden).' : '',
    treatments: `${count('treatments')} unapproved, ${db.prepare('SELECT COUNT(*) c FROM treatments WHERE approved=1').get().c} published.`,
    facilities: `${count('facilities')} unapproved, ${db.prepare('SELECT COUNT(*) c FROM facilities WHERE approved=1').get().c} published.`,
    testimonials: `${count('testimonials')} unapproved.`,
    images: `${count('gallery')} unapproved gallery images.`,
    payments: { razorpay: require('../payments').isTestKey() ? 'Razorpay TEST keys in use.' : 'Razorpay live keys in use.', dev: 'No Razorpay keys: development simulation only.', '': 'No Razorpay keys: online booking is closed.' }[require('../payments').provider()],
    privacy: `Retention: ${Number(s.retention_days) ? s.retention_days + ' days' : 'keep until deleted'}.`
  };
  res.render('admin/checklist', { items: CHECKLIST, checked, hints, review: settings.defs.filter(d => d.review), s, saved: req.query.saved === '1' });
});

router.post('/checklist', auth.allow(), (req, res) => {
  const out = {};
  for (const i of CHECKLIST) out['chk_' + i.id] = req.body['chk_' + i.id] === '1' ? '1' : '0';
  const stmt = db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`);
  const now = new Date().toISOString();
  db.transaction(() => { for (const [k, v] of Object.entries(out)) stmt.run(k, v, now); })();
  res.redirect('/admin/checklist?saved=1');
});

module.exports = router;
