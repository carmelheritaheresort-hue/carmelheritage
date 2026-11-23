// Online booking: room data, availability, price quotes and booking records.
const crypto = require('crypto');
const { db } = require('./db');
const calc = require('../public/js/booking-calc.js');
const { todayIST } = require('./util');

const HOLD_MINUTES = 20;
const KINDS = ['cottage', 'standard_room'];
const BOOKING_LOCK = 727002; // serialises "check rooms then reserve" across all server instances
// Bookings in these states take a room. Pending ones only while their hold is valid.
const ACTIVE_SQL = `(status IN ('paid','confirmed') OR (status = 'pending_payment' AND hold_expires_at > ?))`;

const STATUS_LABEL = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid, awaiting confirmation',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Payment failed',
  expired: 'Expired (not paid)'
};

async function roomTypes() {
  const rows = await db.all('SELECT * FROM accommodation_types WHERE approved=1 ORDER BY sort_order, id');
  const rooms = {};
  for (const r of rows) {
    // A type with no price cannot be booked online.
    if (!(r.price_per_night > 0)) continue;
    rooms[r.kind] = {
      kind: r.kind, slug: r.slug, name: r.name, total: r.total_units, rate: r.price_per_night,
      maxAdults: r.max_adults, maxChildren: r.max_children, photo: r.photo, photo_alt: r.photo_alt, summary: r.summary
    };
  }
  return rooms;
}

function pricing(s) {
  return {
    gstPercent: Number(s.gst_percent) || 0,
    payMode: s.payment_mode === 'full' ? 'full' : 'advance',
    advancePercent: Math.min(100, Math.max(1, Number(s.advance_percent) || 100))
  };
}

function nightsList(ci, co) {
  const out = [];
  for (let d = ci; d < co; d = calc.addDays(d, 1)) out.push(d);
  return out;
}

// Rooms free on every night of the stay, per type. excludeId lets an existing booking be re-checked.
async function availability(ci, co, excludeId = 0, rooms = null) {
  rooms = rooms || await roomTypes();
  const now = new Date().toISOString();
  const bookings = await db.all(`SELECT id, check_in, check_out, cottage_units, standard_units FROM bookings
    WHERE check_in < ? AND check_out > ? AND id != ? AND ${ACTIVE_SQL}`, co, ci, excludeId, now);
  const blocks = await db.all('SELECT kind, start_date, end_date, units FROM room_blocks WHERE start_date < ? AND end_date > ?', co, ci);
  const out = {};
  for (const kind of KINDS) {
    if (!rooms[kind]) { out[kind] = 0; continue; }
    let worst = 0;
    for (const night of nightsList(ci, co)) {
      let used = 0;
      for (const b of bookings) if (b.check_in <= night && night < b.check_out) used += kind === 'cottage' ? b.cottage_units : b.standard_units;
      for (const k of blocks) if (k.kind === kind && k.start_date <= night && night < k.end_date) used += k.units;
      if (used > worst) worst = used;
    }
    out[kind] = Math.max(0, rooms[kind].total - worst);
  }
  return out;
}

async function newRef() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 10; i++) {
    const ref = 'CH-' + Array.from(crypto.randomBytes(6), b => abc[b % abc.length]).join('');
    if (!(await db.get('SELECT 1 AS x FROM bookings WHERE ref=?', ref))) return ref;
  }
  throw new Error('Could not create a booking reference');
}

// Validates, re-checks availability and stores a booking that is waiting for payment.
// Returns { ok, errors } or { ok, booking }.
async function createPending(raw, s, providerName) {
  const rooms = await roomTypes();
  const today = todayIST();
  const pre = calc.validate(raw, { today, rooms });
  if (!pre.ok) return { ok: false, errors: pre.errors };
  const d = pre.clean;

  return db.tx(async () => {
    await db.exec(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const avail = await availability(d.check_in, d.check_out, 0, rooms);
    const v = calc.validate(raw, { today, rooms, availability: avail });
    if (!v.ok) return { ok: false, errors: v.errors, availability: avail };
    const q = calc.quote(d, rooms, pricing(s));
    const now = new Date();
    const row = {
      ref: await newRef(),
      token: crypto.randomBytes(24).toString('hex'),
      check_in: d.check_in, check_out: d.check_out, nights: q.nights,
      cottage_units: d.cottage_units, standard_units: d.standard_units,
      adults: d.adults, children: d.children,
      name: d.name, phone: d.phone, email: d.email, message: d.message,
      cottage_rate: rooms.cottage ? rooms.cottage.rate : 0,
      standard_rate: rooms.standard_room ? rooms.standard_room.rate : 0,
      gst_percent: q.gstPercent,
      subtotal_paise: q.subtotal, gst_paise: q.gst, total_paise: q.total, pay_now_paise: q.payNow,
      provider: providerName,
      hold_expires_at: new Date(now.getTime() + HOLD_MINUTES * 60000).toISOString(),
      created_at: now.toISOString(), updated_at: now.toISOString()
    };
    const cols = Object.keys(row);
    const id = await db.insert(`INSERT INTO bookings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(c => row[c]));
    return { ok: true, booking: { ...row, id, status: 'pending_payment' } };
  });
}

async function setOrder(id, orderId) {
  await db.run('UPDATE bookings SET provider_order_id=?, updated_at=? WHERE id=?', orderId, new Date().toISOString(), id);
}

const byRef = ref => db.get('SELECT * FROM bookings WHERE ref=?', String(ref || '').slice(0, 20));
const byOrder = orderId => db.get('SELECT * FROM bookings WHERE provider_order_id=?', String(orderId || ''));

function tokenOk(b, token) {
  if (!b || typeof token !== 'string') return false;
  const x = Buffer.from(b.token), y = Buffer.from(token);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Records a successful payment. Safe to call more than once (checkout callback and webhook).
// Returns { booking, changed }.
async function markPaid(b, paymentId) {
  return db.tx(async () => {
    const cur = await db.get('SELECT * FROM bookings WHERE id=? FOR UPDATE', b.id);
    if (['paid', 'confirmed', 'refunded'].includes(cur.status)) return { booking: cur, changed: false };
    const now = new Date().toISOString();
    let note = cur.internal_notes;
    if (cur.status !== 'pending_payment' || cur.hold_expires_at <= now) {
      // Payment arrived after the hold ran out or after a failure. Keep the money record and flag it.
      const avail = await availability(cur.check_in, cur.check_out, cur.id);
      const fits = cur.cottage_units <= avail.cottage && cur.standard_units <= avail.standard_room;
      note = (note ? note + '\n' : '') + `[${now}] Payment received after the hold expired. ` +
        (fits ? 'Rooms were still free.' : 'CHECK AVAILABILITY: the rooms may already be taken. Refund if you cannot accommodate.');
    }
    await db.run(`UPDATE bookings SET status='paid', provider_payment_id=?, paid_at=?, internal_notes=?, updated_at=? WHERE id=?`,
      String(paymentId || '').slice(0, 100), now, note, now, cur.id);
    return { booking: await db.get('SELECT * FROM bookings WHERE id=?', cur.id), changed: true };
  });
}

async function addNote(id, text) {
  const now = new Date().toISOString();
  await db.run(`UPDATE bookings SET internal_notes = trim(internal_notes || ?), updated_at=? WHERE id=?`, `\n[${now}] ${String(text).slice(0, 500)}`, now, id);
}

// Guest closed the payment window without paying: release the rooms now instead of waiting for the hold.
async function markFailed(b, reason) {
  const r = await db.run(`UPDATE bookings SET status='failed', updated_at=? WHERE id=? AND status='pending_payment'`, new Date().toISOString(), b.id);
  if (r.changes && reason) await addNote(b.id, reason);
}

// Releases rooms held by unpaid bookings once the hold has run out.
async function expireHolds() {
  const now = new Date().toISOString();
  return (await db.run(`UPDATE bookings SET status='expired', updated_at=? WHERE status='pending_payment' AND hold_expires_at <= ?`, now, now)).changes;
}

function publicView(b) {
  const rooms = [];
  if (b.cottage_units) rooms.push({ label: b.cottage_units === 1 ? 'Cottage' : 'Cottages', units: b.cottage_units, rate: b.cottage_rate, amount: b.cottage_units * b.cottage_rate * b.nights * 100 });
  if (b.standard_units) rooms.push({ label: b.standard_units === 1 ? 'Standard room' : 'Standard rooms', units: b.standard_units, rate: b.standard_rate, amount: b.standard_units * b.standard_rate * b.nights * 100 });
  return { ...b, rooms, balance_paise: b.total_paise - b.pay_now_paise, statusLabel: STATUS_LABEL[b.status] || b.status };
}

module.exports = {
  HOLD_MINUTES, STATUS_LABEL, roomTypes, pricing, availability, createPending, setOrder,
  byRef, byOrder, tokenOk, markPaid, markFailed, addNote, expireHolds, publicView, rupees: calc.rupees
};
