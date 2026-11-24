const { db } = require('./db');
const inventory = require('./inventory');
const { lines, todayIST } = require('./util');

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { console.error('Content read failed:', e.message); return fallback; }
}

const ALLOWED_TABLES = new Set(['treatments', 'facilities', 'gallery', 'faqs', 'testimonials', 'management', 'accommodation_types', 'packages']);
const { CATEGORY } = require('./data/brochure');

const inr = n => '\u20B9' + Number(n || 0).toLocaleString('en-IN');

// Treatment names in a schedule line: "Day 2: Elakizhi + Sirodhara – 3 days" -> ["Elakizhi", "Sirodhara"]
function treatmentsIn(line) {
  return line.replace(/^Day\s*\d+\s*:\s*/i, '').split(/\s[–-]\s/)[0].split('+').map(x => x.trim()).filter(Boolean);
}

// Adds the display fields every page and the enquiry check use, so labels and prices match everywhere.
function decoratePackage(p) {
  const lines = lines_(p.schedule);
  const names = [...new Set(lines.flatMap(treatmentsIn))];
  const cat = CATEGORY[p.category] || { label: p.category, short: p.category };
  const days = parseInt((String(p.duration).match(/(\d+)\s*day/i) || [])[1], 10) || 0;
  return {
    ...p, scheduleLines: lines, treatmentNames: names,
    categoryLabel: cat.label, categoryShort: cat.short,
    label: `${p.name} (${cat.short})`, priceText: inr(p.price), days,
    isDaySchedule: lines.some(l => /^Day\s*\d+/i.test(l) || /[–-]\s*\d+\s*days?$/i.test(l))
  };
}
const lines_ = t => String(t || '').split('\n').map(l => l.trim()).filter(Boolean);

async function packages() {
  return (await approved('packages')).filter(p => p.name && p.price > 0).map(decoratePackage);
}

// id -> { name, duration, priceText } for the package enquiry form and its server-side check.
function packageMap(list) {
  const out = {};
  for (const p of list) out[p.id] = { name: p.label, duration: p.duration, priceText: p.priceText };
  return out;
}

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

module.exports = { safe, approved, accommodation, faqs, testimonials, formContext, packages, packageMap, decoratePackage, inr, CATEGORY };
