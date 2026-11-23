const { db } = require('./db');
const inventory = require('./inventory');
const { lines, todayIST } = require('./util');

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { console.error('Content read failed:', e.message); return fallback; }
}

const ALLOWED_TABLES = new Set(['treatments', 'facilities', 'gallery', 'faqs', 'testimonials', 'management', 'accommodation_types']);

async function approved(table) {
  if (!ALLOWED_TABLES.has(table)) throw new Error('bad table');
  return safe(() => db.all(`SELECT * FROM ${table} WHERE approved=1 ORDER BY sort_order, id`), []);
}

async function accommodation() {
  const rows = await approved('accommodation_types');
  if (rows.length) return rows.map(r => ({ ...r, amenityList: lines(r.amenities) }));
  return [
    { slug: 'cottages', kind: 'cottage', name: 'Cottages', total_units: inventory.cottage, amenityList: [] },
    { slug: 'standard-rooms', kind: 'standard_room', name: 'Standard Rooms', total_units: inventory.standard_room, amenityList: [] }
  ];
}

async function faqs() { return (await approved('faqs')).filter(f => f.answer && f.answer.trim()); }
async function testimonials() { return (await approved('testimonials')).filter(t => t.permission_confirmed && t.quote && t.quote.trim()); }

// Pure: takes the accommodation list already loaded by the caller.
function formContext(types) {
  const inv = { cottage: 0, standard_room: 0 };
  for (const t of types) inv[t.kind] = t.total_units;
  return {
    inv,
    maxUnits: { cottage: inv.cottage, standard: inv.standard_room, either: inv.cottage + inv.standard_room },
    today: todayIST()
  };
}

module.exports = { safe, approved, accommodation, faqs, testimonials, formContext };
