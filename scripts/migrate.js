// Creates or updates the database tables in Supabase. Safe to run any number of times.
// Runs automatically during the Vercel build (npm run build) and when the local server starts.
const { db, migrate } = require('../src/db');

(async () => {
  await migrate();
  console.log('Database is up to date.');
  await db.close();
})().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
