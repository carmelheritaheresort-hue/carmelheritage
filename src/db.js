const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // built into Node.js 22.13+; no native build needed
const config = require('./config');
const inventory = require('./inventory');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Small helper matching the transaction style used across the app.
// Nested calls use savepoints, so a transaction can safely call code that opens its own.
let txDepth = 0;
db.transaction = fn => (...args) => {
  const sp = `sp${txDepth}`;
  db.exec(txDepth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
  txDepth++;
  try {
    const r = fn(...args);
    txDepth--;
    db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    txDepth--;
    db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
};

// Add new migrations to the END of this list. Never edit a migration that has shipped.
const migrations = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE accommodation_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL UNIQUE CHECK (kind IN ('cottage','standard_room')),
  name TEXT NOT NULL,
  total_units INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  bed_info TEXT NOT NULL DEFAULT '',
  amenities TEXT NOT NULL DEFAULT '',
  rate_info TEXT NOT NULL DEFAULT '',
  seasonal_notes TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  photo_alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  practitioner TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  is_illustration INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  permission_confirmed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE management (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  photo_alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('stay','treatment')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','confirmed','declined','cancelled')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  check_in TEXT NOT NULL DEFAULT '',
  check_out TEXT NOT NULL DEFAULT '',
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  accommodation_pref TEXT NOT NULL DEFAULT '',
  units INTEGER NOT NULL DEFAULT 0,
  treatment TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_enquiries_created ON enquiries(created_at);
CREATE INDEX idx_enquiries_status ON enquiries(status);
`
  },
  {
    id: 2,
    name: 'online booking and payments',
    sql: `
ALTER TABLE accommodation_types ADD COLUMN price_per_night INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accommodation_types ADD COLUMN max_adults INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accommodation_types ADD COLUMN max_children INTEGER NOT NULL DEFAULT 0;
UPDATE accommodation_types SET price_per_night = 4500, max_adults = 3, max_children = 2 WHERE kind = 'cottage';
UPDATE accommodation_types SET price_per_night = 1500, max_adults = 3, max_children = 2 WHERE kind = 'standard_room';

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','confirmed','cancelled','refunded','failed','expired')),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  nights INTEGER NOT NULL,
  cottage_units INTEGER NOT NULL DEFAULT 0,
  standard_units INTEGER NOT NULL DEFAULT 0,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  cottage_rate INTEGER NOT NULL DEFAULT 0,
  standard_rate INTEGER NOT NULL DEFAULT 0,
  gst_percent REAL NOT NULL DEFAULT 0,
  subtotal_paise INTEGER NOT NULL,
  gst_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  pay_now_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT '',
  provider_order_id TEXT NOT NULL DEFAULT '',
  provider_payment_id TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  hold_expires_at TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX idx_bookings_order ON bookings(provider_order_id);

CREATE TABLE room_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('cottage','standard_room')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  units INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_blocks_dates ON room_blocks(start_date, end_date);
`
  },
  {
    id: 3,
    name: 'FAQ wording for online booking',
    // Only rewrites answers that still have the original seeded wording.
    sql: `
UPDATE faqs SET question = 'Can I book and pay online?',
  answer = 'Yes. On the Book page choose your dates, rooms and guests and pay securely online by UPI, card or netbanking. The Centre then checks your rooms and confirms your booking. If the rooms cannot be provided, the amount you paid is refunded in full.'
  WHERE question = 'Is the enquiry form a confirmed booking?';
UPDATE faqs SET answer = 'Carmel Heritage has 8 cottages and 7 standard rooms. The Book page shows how many are free for your dates.'
  WHERE question = 'How many cottages and rooms does the Centre have?' AND answer LIKE 'Carmel Heritage has 8 cottages and 7 standard rooms in total. This is the number of units%';
UPDATE faqs SET question = 'Can I ask a question before booking?',
  answer = 'Yes. Use the enquiry form or WhatsApp, or call the Centre on the numbers shown on the Contact page. An enquiry is not a booking.'
  WHERE question = 'How do I send an enquiry?';
`
  },
  {
    id: 4,
    name: 'guest profiles',
    sql: `
CREATE TABLE guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_key TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  alt_phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_guests_phone ON guests(phone_key);
CREATE INDEX idx_guests_email ON guests(email);
CREATE INDEX idx_guests_last ON guests(last_seen_at);
ALTER TABLE bookings ADD COLUMN guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL;
ALTER TABLE enquiries ADD COLUMN guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_enquiries_guest ON enquiries(guest_id);
`
  }
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(id,name,applied_at) VALUES (?,?,?)')
        .run(m.id, m.name, new Date().toISOString());
    })();
    console.log(`Applied migration ${m.id}: ${m.name}`);
  }
  seed();
  // Link any bookings and enquiries that have no guest profile yet (first run after migration 4).
  const linked = require('./guests').backfill();
  if (linked) console.log(`Guest profiles: linked ${linked} existing bookings and enquiries`);
}

function count(table) { return db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c; }

// Seed only what was supplied by the brand. Everything else starts empty and unapproved.
function seed() {
  if (count('accommodation_types') === 0) {
    const ins = db.prepare(`INSERT INTO accommodation_types (slug,kind,name,total_units,price_per_night,max_adults,max_children,sort_order,approved) VALUES (?,?,?,?,?,?,?,?,1)`);
    ins.run('cottages', 'cottage', 'Cottages', inventory.cottage, 4500, 3, 2, 1);
    ins.run('standard-rooms', 'standard_room', 'Standard Rooms', inventory.standard_room, 1500, 3, 2, 2);
  }
  if (count('testimonials') === 0) {
    const ins = db.prepare(`INSERT INTO testimonials (name,location,quote,permission_confirmed,sort_order,approved) VALUES (?,?,?,0,?,0)`);
    ins.run('Jiby Jose E', 'Delhi', '', 1);
    ins.run('Ebin V Francis', 'Bangalore, India', '', 2);
  }
  if (count('faqs') === 0) {
    const ins = db.prepare(`INSERT INTO faqs (question,answer,category,sort_order,approved) VALUES (?,?,?,?,?)`);
    ins.run('How many cottages and rooms does the Centre have?',
      'Carmel Heritage has 8 cottages and 7 standard rooms. The Book page shows how many are free for your dates.', 'Accommodation', 1, 1);
    ins.run('Can I book and pay online?',
      'Yes. On the Book page choose your dates, rooms and guests and pay securely online by UPI, card or netbanking. The Centre then checks your rooms and confirms your booking. If the rooms cannot be provided, the amount you paid is refunded in full.', 'Bookings', 2, 1);
    ins.run('Can I ask a question before booking?',
      'Yes. Use the enquiry form or WhatsApp, or call the Centre on the numbers shown on the Contact page. An enquiry is not a booking.', 'Enquiries', 3, 1);
    ins.run('Can I ask whether an Ayurveda treatment is suitable for me?',
      'Yes. Contact the Centre, describe what you would like to ask, and the Centre will advise. The website does not give medical advice and does not promise any treatment result.', 'Treatments', 4, 1);
    ins.run('Where is Carmel Heritage?',
      'Bhoothathankettu P.O., Kothamangalam, Kochi, Kerala 686681, India. See the Contact and Directions page for details.', 'Directions', 5, 1);
    ins.run('What are the cancellation and change terms?',
      'Terms are shared by the Centre when it confirms a request. Please read the Booking and Cancellation Policy page and ask the Centre about anything unclear before you confirm.', 'Policies', 6, 1);
    ins.run('What are the check-in and check-out times?', '', 'Policies', 7, 0);
    ins.run('Are meals included in the stay?', '', 'Accommodation', 8, 0);
    ins.run('How do I get there from Kochi or Kothamangalam?', '', 'Directions', 9, 0);
  }
}

module.exports = { db, migrate, migrations };
