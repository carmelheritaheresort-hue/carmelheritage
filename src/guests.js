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

async function find({ phone, email }) {
  const pk = phoneKey(phone), ek = emailKey(email);
  if (pk) { const g = await db.get('SELECT * FROM guests WHERE phone_key=? ORDER BY id LIMIT 1', pk); if (g) return g; }
  if (ek) { const g = await db.get('SELECT * FROM guests WHERE email=? ORDER BY id LIMIT 1', ek); if (g) return g; }
  return null;
}

// Finds or creates the profile and returns its id. Never overwrites details staff have edited,
// only fills gaps and moves "last seen" forward.
async function upsert({ name, phone, email, source, at }) {
  const when = at || new Date().toISOString();
  const pk = phoneKey(phone), ek = emailKey(email);
  if (!pk && !ek) return null;
  const g = await find({ phone, email });
  const now = new Date().toISOString();
  if (g) {
    await db.run(`UPDATE guests SET
        name = CASE WHEN name = '' THEN @name ELSE name END,
        phone = CASE WHEN phone = '' THEN @phone ELSE phone END,
        phone_key = CASE WHEN phone_key = '' THEN @pk ELSE phone_key END,
        email = CASE WHEN email = '' THEN @ek ELSE email END,
        first_seen_at = LEAST(first_seen_at, @when),
        last_seen_at = GREATEST(last_seen_at, @when),
        updated_at = @now
      WHERE id = @id`, { name: name || '', phone: phone || '', pk, ek, when, now, id: g.id });
    return g.id;
  }
  return db.insert(`INSERT INTO guests (name,phone,phone_key,email,source,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, name || '', phone || '', pk, ek, source || '', when, when, now, now);
}

async function link(table, id, guestId) {
  if (!guestId || !['bookings', 'enquiries'].includes(table)) return;
  await db.run(`UPDATE ${table} SET guest_id=? WHERE id=?`, guestId, id);
}

// Safe wrapper used by the public routes: a profile problem must never block a booking or enquiry.
async function attach(table, row, source) {
  try {
    const gid = await upsert({ name: row.name, phone: row.phone, email: row.email, source, at: row.created_at });
    await link(table, row.id, gid);
    return gid;
  } catch (e) {
    console.error('Guest profile link failed:', e.message);
    return null;
  }
}

async function backfill() {
  let n = 0;
  await db.tx(async () => {
    for (const t of ['bookings', 'enquiries']) {
      const rows = await db.all(`SELECT id, name, phone, email, created_at FROM ${t} WHERE guest_id IS NULL ORDER BY created_at`);
      for (const r of rows) {
        const gid = await upsert({ ...r, source: t === 'bookings' ? 'online booking' : 'enquiry', at: r.created_at });
        if (gid) { await link(t, r.id, gid); n++; }
      }
    }
  });
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

async function list(q = {}) {
  const w = [], p = { today: todayIST() };
  const term = String(q.q || '').trim().slice(0, 100);
  if (term) {
    p.like = `%${term}%`;
    p.digits = term.replace(/\D/g, '');
    const parts = ['g.name ILIKE @like', 'g.phone ILIKE @like', 'g.alt_phone ILIKE @like', 'g.email ILIKE @like', 'g.city ILIKE @like'];
    if (p.digits.length >= 3) { p.dlike = `%${p.digits}%`; parts.push('g.phone_key LIKE @dlike'); }
    delete p.digits;
    w.push('(' + parts.join(' OR ') + ')');
  }
  let having = '';
  if (q.type === 'returning') having = 'WHERE bookings_count >= 2';
  else if (q.type === 'booked') having = 'WHERE bookings_count >= 1';
  else if (q.type === 'enquiry_only') having = 'WHERE bookings_count = 0';
  else if (q.type === 'upcoming') having = 'WHERE next_stay IS NOT NULL';
  const order = { name: 'lower(name)', value: 'value_paise DESC', stays: 'bookings_count DESC' }[q.sort] || 'last_seen_at DESC';
  const sql = `SELECT * FROM (SELECT g.*, ${STATS_SQL} FROM guests g ${w.length ? 'WHERE ' + w.join(' AND ') : ''}) AS x ${having} ORDER BY ${order}, id DESC`;
  return db.all(sql, p);
}

async function get(id) {
  const n = parseInt(id, 10);
  if (!(n > 0)) return null;
  return db.get(`SELECT g.*, ${STATS_SQL} FROM guests g WHERE g.id = @id`, { id: n, today: todayIST() });
}

async function history(id) {
  const bookings = await db.all('SELECT * FROM bookings WHERE guest_id=? ORDER BY check_in DESC, id DESC', id);
  const enquiries = await db.all('SELECT * FROM enquiries WHERE guest_id=? ORDER BY id DESC', id);
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
async function possibleDuplicates(g) {
  const rows = await db.all(`SELECT id, name, phone, alt_phone, phone_key, email FROM guests WHERE id != @id AND (
      (phone_key != '' AND phone_key = @pk) OR (email != '' AND email = @email)
      OR (alt_phone != '' AND regexp_replace(alt_phone, '\\D', '', 'g') = @pk))`,
    { id: g.id, pk: g.phone_key || '-', email: g.email || '-' });
  return rows;
}

async function update(id, f) {
  await db.run(`UPDATE guests SET name=?, phone=?, phone_key=?, email=?, alt_phone=?, city=?, country=?, notes=?, updated_at=? WHERE id=?`,
    f.name, f.phone, phoneKey(f.phone), emailKey(f.email), f.alt_phone, f.city, f.country, f.notes, new Date().toISOString(), id);
}

async function create(f) {
  const now = new Date().toISOString();
  return db.insert(`INSERT INTO guests (name,phone,phone_key,email,alt_phone,city,country,notes,source,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, f.name, f.phone, phoneKey(f.phone), emailKey(f.email), f.alt_phone, f.city, f.country, f.notes, 'added by staff', now, now, now, now);
}

// Moves all history from `fromId` into `intoId`, keeps any details the target is missing, then deletes `fromId`.
async function merge(intoId, fromId) {
  if (Number(intoId) === Number(fromId)) return;
  await db.tx(async () => {
    const a = await db.get('SELECT * FROM guests WHERE id=?', intoId), b = await db.get('SELECT * FROM guests WHERE id=?', fromId);
    if (!a || !b) throw new Error('Guest not found');
    for (const t of ['bookings', 'enquiries']) await db.run(`UPDATE ${t} SET guest_id=? WHERE guest_id=?`, a.id, b.id);
    const pick = k => a[k] || b[k];
    const notes = [a.notes, b.notes].filter(Boolean).join('\n');
    await db.run(`UPDATE guests SET phone=?, phone_key=?, email=?, alt_phone=?, city=?, country=?, notes=?,
      first_seen_at=?, last_seen_at=?, updated_at=? WHERE id=?`,
      pick('phone'), pick('phone_key'), pick('email'), a.alt_phone || (b.phone && b.phone_key !== a.phone_key ? b.phone : b.alt_phone),
      pick('city'), pick('country'), notes,
      a.first_seen_at < b.first_seen_at ? a.first_seen_at : b.first_seen_at,
      a.last_seen_at > b.last_seen_at ? a.last_seen_at : b.last_seen_at, new Date().toISOString(), a.id);
    await db.run('DELETE FROM guests WHERE id=?', b.id);
  });
}

async function remove(id) { await db.run('DELETE FROM guests WHERE id=?', id); }

module.exports = { phoneKey, upsert, attach, backfill, list, get, history, possibleDuplicates, update, create, merge, remove };
