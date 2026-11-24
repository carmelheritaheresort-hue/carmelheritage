// Admin inventory calendar: rooms free, booked, waiting and blocked per night, and date-specific prices.
const { db } = require('./db');
const booking = require('./booking');
const calc = require('../public/js/booking-calc.js');

const KINDS = ['cottage', 'standard_room'];
const MAX_RANGE = 366;       // nights one change may cover

function monthStart(m) { return /^\d{4}-\d{2}$/.test(m || '') && calc.isDate(m + '-01') ? m + '-01' : null; }
function nextMonth(first) { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); }
function prevMonth(first) { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); }
const weekday = iso => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 Sunday ... 6 Saturday

// One row per night of the month, with per-type counts and the price charged that night.
async function month(first) {
  const end = nextMonth(first);
  const rooms = await booking.roomTypes();
  const now = new Date().toISOString();
  const bookings = await db.all(`SELECT id, ref, name, status, check_in, check_out, cottage_units, standard_units FROM bookings
    WHERE check_in < ? AND check_out > ? AND ${booking.ACTIVE_SQL}`, end, first, now);
  const blocks = await db.all('SELECT * FROM room_blocks WHERE start_date < ? AND end_date > ?', end, first);
  const rates = await booking.nightRates(first, end);
  const notes = {};
  for (const r of await db.all('SELECT kind, night, note FROM room_rates WHERE night >= ? AND night < ?', first, end)) notes[r.kind + r.night] = r.note;

  const days = [];
  for (let d = first; d < end; d = calc.addDays(d, 1)) {
    const row = { date: d, weekday: weekday(d), kinds: {} };
    for (const kind of KINDS) {
      const room = rooms[kind];
      if (!room) continue;
      const units = b => (kind === 'cottage' ? b.cottage_units : b.standard_units);
      let booked = 0, waiting = 0, blocked = 0;
      for (const b of bookings) {
        if (!(b.check_in <= d && d < b.check_out) || !units(b)) continue;
        if (b.status === 'paid' || b.status === 'confirmed') booked += units(b); else waiting += units(b);
      }
      const blockNotes = [];
      for (const k of blocks) if (k.kind === kind && k.start_date <= d && d < k.end_date) { blocked += k.units; if (k.note) blockNotes.push(k.note); }
      const used = booked + waiting + blocked;
      const special = rates[kind][d];
      row.kinds[kind] = {
        total: room.total, booked, waiting, blocked, free: Math.max(0, room.total - used), over: used > room.total,
        rate: special || room.rate, special: !!special, rateNote: notes[kind + d] || '', blockNotes
      };
    }
    days.push(row);
  }
  return { first, end, prev: prevMonth(first), next: end, days, rooms };
}

// Bookings and blocks that take a room on one night.
async function night(d) {
  const now = new Date().toISOString();
  const bookings = await db.all(`SELECT * FROM bookings WHERE check_in <= ? AND check_out > ? AND ${booking.ACTIVE_SQL} ORDER BY check_in, id`, d, d, now);
  const blocks = await db.all('SELECT * FROM room_blocks WHERE start_date <= ? AND end_date > ? ORDER BY kind, id', d, d);
  return { bookings, blocks };
}

// Nights from `from` to `to` (both included), optionally only on chosen weekdays.
function nightsIn(from, to, weekdays) {
  const out = [];
  for (let d = from; d <= to; d = calc.addDays(d, 1)) if (!weekdays.length || weekdays.includes(weekday(d))) out.push(d);
  return out;
}

// Groups sorted nights into [start, endExclusive) ranges of consecutive nights.
function ranges(nights) {
  const out = [];
  for (const d of nights) {
    const last = out[out.length - 1];
    if (last && last[1] === d) last[1] = calc.addDays(d, 1); else out.push([d, calc.addDays(d, 1)]);
  }
  return out;
}

function parse(body, rooms, today) {
  const f = {
    action: String(body.action || ''),
    kinds: body.kind === 'both' ? KINDS.filter(k => rooms[k]) : (rooms[body.kind] ? [body.kind] : []),
    from: String(body.from || '').slice(0, 10), to: String(body.to || '').slice(0, 10),
    weekdays: [].concat(body.weekdays || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6),
    units: parseInt(body.units, 10), rate: parseInt(String(body.rate || '').replace(/[,\s₹]/g, ''), 10),
    note: String(body.note || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300)
  };
  let error = '';
  if (!['block', 'open', 'rate', 'reset'].includes(f.action)) error = 'Choose what to do.';
  else if (!f.kinds.length) error = 'Choose a room type.';
  else if (!calc.isDate(f.from) || !calc.isDate(f.to)) error = 'Enter the first and last night.';
  else if (f.to < f.from) error = 'The last night must be on or after the first night.';
  else if (calc.days(f.from, f.to) + 1 > MAX_RANGE) error = `Choose ${MAX_RANGE} nights or fewer at a time.`;
  else if (f.to < today) error = 'These nights are in the past.';
  else if (f.action === 'block' && f.kinds.some(k => !(f.units >= 1 && f.units <= rooms[k].total))) {
    error = f.kinds.length > 1 ? 'Enter how many rooms of each type to block (no more than the smaller type has).' : `Enter 1 to ${rooms[f.kinds[0]].total} rooms to block.`;
  } else if (f.action === 'rate' && !(f.rate >= 1 && f.rate <= 1000000)) error = 'Enter the price per night in rupees, numbers only.';
  if (!error) {
    if (f.from < today) f.from = today; // never change the past
    f.nights = nightsIn(f.from, f.to, f.weekdays);
    if (!f.nights.length) error = 'No nights match the days of the week you ticked.';
  }
  return { f, error };
}

// Applies one change from the calendar form. Returns a short summary for the admin.
async function apply(f, userName) {
  const now = new Date().toISOString();
  const set = new Set(f.nights);
  return db.tx(async () => {
    let n = 0;
    for (const kind of f.kinds) {
      if (f.action === 'block') {
        for (const [a, b] of ranges(f.nights)) {
          await db.run('INSERT INTO room_blocks(kind,start_date,end_date,units,note,created_at) VALUES (?,?,?,?,?,?)', kind, a, b, f.units, f.note || `Blocked by ${userName}`, now);
        }
        n += f.nights.length;
      } else if (f.action === 'open') {
        // Remove blocked rooms on the chosen nights; parts of a block outside them stay.
        const hit = await db.all('SELECT * FROM room_blocks WHERE kind=? AND start_date <= ? AND end_date > ?', kind, f.nights[f.nights.length - 1], f.nights[0]);
        for (const k of hit) {
          const keep = [];
          let touched = false;
          for (let d = k.start_date; d < k.end_date; d = calc.addDays(d, 1)) { if (set.has(d)) { touched = true; n++; } else keep.push(d); }
          if (!touched) continue;
          await db.run('DELETE FROM room_blocks WHERE id=?', k.id);
          for (const [a, b] of ranges(keep)) {
            await db.run('INSERT INTO room_blocks(kind,start_date,end_date,units,note,created_at) VALUES (?,?,?,?,?,?)', kind, a, b, k.units, k.note, k.created_at);
          }
        }
      } else if (f.action === 'rate') {
        for (const d of f.nights) {
          await db.run(`INSERT INTO room_rates(kind,night,rate,note,updated_at) VALUES (?,?,?,?,?)
            ON CONFLICT(kind,night) DO UPDATE SET rate=excluded.rate, note=excluded.note, updated_at=excluded.updated_at`, kind, d, f.rate, f.note, now);
        }
        n += f.nights.length;
      } else if (f.action === 'reset') {
        for (const d of f.nights) n += (await db.run('DELETE FROM room_rates WHERE kind=? AND night=?', kind, d)).changes;
      }
    }
    return n;
  });
}

// True when any future night has its own price (the Book page then tells guests prices can vary).
async function hasSpecialRates(today) {
  return !!(await db.get('SELECT 1 AS x FROM room_rates WHERE night >= ? LIMIT 1', today));
}

module.exports = { monthStart, month, night, parse, apply, hasSpecialRates, KINDS };
