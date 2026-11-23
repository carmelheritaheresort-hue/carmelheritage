// Guest profiles: one record per guest, matched by mobile number, then by email.
// Every booking and enquiry is linked to a profile so staff can see a guest's full history.
const { db } = require('./db');
const { todayIST } = require('./util');

const KEPT = "('paid','confirmed')";

function phoneKey(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d; // Indian mobile typed without country code
  return d.length >= 8 ? d : '';
}
const emailKey = e => String(e || '').trim().toLowerCase();

function find({ phone, email }) {
  const pk = phoneKey(phone), ek = emailKey(email);
  if (pk) { const g = db.prepare('SELECT * FROM guests WHERE phone_key=? ORDER BY id LIMIT 1').get(pk); if (g) return g; }
  if (ek) { const g = db.prepare('SELECT * FROM guests WHERE email=? ORDER BY id LIMIT 1').get(ek); if (g) return g; }
  return null;
}

// Finds or creates the profile and returns its id. Never overwrites details staff have edited,
// only fills gaps and moves "last seen" forward.
function upsert({ name, phone, email, source, at }) {
  const when = at || new Date().toISOString();
  const pk = phoneKey(phone), ek = emailKey(email);
  if (!pk && !ek) return null;
  const g = find({ phone, email });
  if (g) {
    db.prepare(`UPDATE guests SET
        name = CASE WHEN name = '' THEN ? ELSE name END,
        phone = CASE WHEN phone = '' THEN ? ELSE phone END,
        phone_key = CASE WHEN phone_key = '' THEN ? ELSE phone_key END,
        email = CASE WHEN email = '' THEN ? ELSE email END,
        first_seen_at = CASE WHEN ? < first_seen_at THEN ? ELSE first_seen_at END,
        last_seen_at = CASE WHEN ? > last_seen_at THEN ? ELSE last_seen_at END,
        updated_at = ?
      WHERE id = ?`).run(name || '', phone || '', pk, ek, when, when, when, when, new Date().toISOString(), g.id);
    return g.id;
  }
  const now = new Date().toISOString();
  const info = db.prepare(`INSERT INTO guests (name,phone,phone_key,email,source,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(name || '', phone || '', pk, ek, source || '', when, when, now, now);
  return Number(info.lastInsertRowid);
}

function link(table, id, guestId) {
  if (!guestId || !['bookings', 'enquiries'].includes(table)) return;
  db.prepare(`UPDATE ${table} SET guest_id=? WHERE id=?`).run(guestId, id);
}

// Safe wrapper used by the public routes: a profile problem must never block a booking or enquiry.
function attach(table, row, source) {
  try {
    const gid = upsert({ name: row.name, phone: row.phone, email: row.email, source, at: row.created_at });
    link(table, row.id, gid);
    return gid;
  } catch (e) {
    console.error('Guest profile link failed:', e.message);
    return null;
  }
}

function backfill() {
  let n = 0;
  db.transaction(() => {
    for (const t of ['bookings', 'enquiries']) {
      const rows = db.prepare(`SELECT id, name, phone, email, created_at FROM ${t} WHERE guest_id IS NULL ORDER BY created_at`).all();
      for (const r of rows) {
        const gid = upsert({ ...r, source: t === 'bookings' ? 'online booking' : 'enquiry', at: r.created_at });
        if (gid) { link(t, r.id, gid); n++; }
      }
    }
  })();
  return n;
}

// Columns computed for the list and the profile page.
const STATS_SQL = `
  (SELECT COUNT(*) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT}) AS bookings_count,
  (SELECT COUNT(*) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT} AND b.check_out <= @today) AS stays_count,
  (SELECT COALESCE(SUM(b.nights),0) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT}) AS nights,
  (SELECT COALESCE(SUM(b.pay_now_paise),0) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT}) AS paid_paise,
  (SELECT COALESCE(SUM(b.total_paise),0) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT}) AS value_paise,
  (SELECT MAX(b.adults + b.children) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT}) AS max_party,
  (SELECT MAX(b.check_in) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT} AND b.check_in < @today) AS last_stay,
  (SELECT MIN(b.check_in) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ${KEPT} AND b.check_in >= @today) AS next_stay,
  (SELECT COUNT(*) FROM enquiries e WHERE e.guest_id = g.id) AS enquiries_count`;

function list(q = {}) {
  const w = [], p = { today: todayIST() };
  const term = String(q.q || '').trim().slice(0, 100);
  if (term) {
    w.push('(g.name LIKE @like OR g.phone LIKE @like OR g.alt_phone LIKE @like OR g.email LIKE @like OR g.city LIKE @like OR (@digits != \'\' AND g.phone_key LIKE @dlike))');
    p.like = `%${term}%`;
    p.digits = term.replace(/\D/g, '');
    p.dlike = `%${p.digits}%`;
  }
  let having = '';
  if (q.type === 'returning') having = 'WHERE bookings_count >= 2';
  else if (q.type === 'booked') having = 'WHERE bookings_count >= 1';
  else if (q.type === 'enquiry_only') having = 'WHERE bookings_count = 0';
  else if (q.type === 'upcoming') having = 'WHERE next_stay IS NOT NULL';
  const order = { name: 'name COLLATE NOCASE', value: 'value_paise DESC', stays: 'bookings_count DESC' }[q.sort] || 'last_seen_at DESC';
  const sql = `SELECT * FROM (SELECT g.*, ${STATS_SQL} FROM guests g ${w.length ? 'WHERE ' + w.join(' AND ') : ''}) ${having} ORDER BY ${order}, id DESC`;
  return db.prepare(sql).all(p);
}

function get(id) {
  return db.prepare(`SELECT g.*, ${STATS_SQL} FROM guests g WHERE g.id = @id`).get({ id: Number(id), today: todayIST() });
}

function history(id) {
  const bookings = db.prepare('SELECT * FROM bookings WHERE guest_id=? ORDER BY check_in DESC, id DESC').all(id);
  const enquiries = db.prepare('SELECT * FROM enquiries WHERE guest_id=? ORDER BY id DESC').all(id);
  const kept = bookings.filter(b => b.status === 'paid' || b.status === 'confirmed');
  const prefer = kept.reduce((a, b) => ({ c: a.c + b.cottage_units, s: a.s + b.standard_units }), { c: 0, s: 0 });
  return {
    bookings, enquiries,
    preference: !kept.length ? '' : prefer.c > prefer.s ? 'Cottage' : prefer.s > prefer.c ? 'Standard room' : 'Cottage and standard room',
    avgParty: kept.length ? Math.round(kept.reduce((t, b) => t + b.adults + b.children, 0) / kept.length * 10) / 10 : 0,
    totalAdults: kept.reduce((t, b) => t + b.adults, 0),
    totalChildren: kept.reduce((t, b) => t + b.children, 0)
  };
}

// Other profiles that share this guest's phone or email: likely duplicates.
function possibleDuplicates(g) {
  return db.prepare(`SELECT id, name, phone, email FROM guests WHERE id != ? AND ((phone_key != '' AND phone_key = ?) OR (email != '' AND email = ?)
    OR (alt_phone != '' AND ? != '' AND replace(replace(replace(alt_phone,' ',''),'+',''),'-','') = ?))`)
    .all(g.id, g.phone_key, g.email, g.phone_key, g.phone_key);
}

function update(id, f) {
  db.prepare(`UPDATE guests SET name=?, phone=?, phone_key=?, email=?, alt_phone=?, city=?, country=?, notes=?, updated_at=? WHERE id=?`)
    .run(f.name, f.phone, phoneKey(f.phone), emailKey(f.email), f.alt_phone, f.city, f.country, f.notes, new Date().toISOString(), id);
}

function create(f) {
  const now = new Date().toISOString();
  const info = db.prepare(`INSERT INTO guests (name,phone,phone_key,email,alt_phone,city,country,notes,source,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(f.name, f.phone, phoneKey(f.phone), emailKey(f.email), f.alt_phone, f.city, f.country, f.notes, 'added by staff', now, now, now, now);
  return Number(info.lastInsertRowid);
}

// Moves all history from `fromId` into `intoId`, keeps any details the target is missing, then deletes `fromId`.
function merge(intoId, fromId) {
  if (Number(intoId) === Number(fromId)) return;
  db.transaction(() => {
    const a = db.prepare('SELECT * FROM guests WHERE id=?').get(intoId), b = db.prepare('SELECT * FROM guests WHERE id=?').get(fromId);
    if (!a || !b) throw new Error('Guest not found');
    for (const t of ['bookings', 'enquiries']) db.prepare(`UPDATE ${t} SET guest_id=? WHERE guest_id=?`).run(a.id, b.id);
    const pick = k => a[k] || b[k];
    const notes = [a.notes, b.notes].filter(Boolean).join('\n');
    db.prepare(`UPDATE guests SET phone=?, phone_key=?, email=?, alt_phone=?, city=?, country=?, notes=?,
      first_seen_at=?, last_seen_at=?, updated_at=? WHERE id=?`).run(
      pick('phone'), pick('phone_key'), pick('email'), a.alt_phone || (b.phone && b.phone_key !== a.phone_key ? b.phone : b.alt_phone),
      pick('city'), pick('country'), notes,
      a.first_seen_at < b.first_seen_at ? a.first_seen_at : b.first_seen_at,
      a.last_seen_at > b.last_seen_at ? a.last_seen_at : b.last_seen_at, new Date().toISOString(), a.id);
    db.prepare('DELETE FROM guests WHERE id=?').run(b.id);
  })();
}

function remove(id) { db.prepare('DELETE FROM guests WHERE id=?').run(id); }

module.exports = { phoneKey, upsert, attach, backfill, list, get, history, possibleDuplicates, update, create, merge, remove };
