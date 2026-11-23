// Asks for the Supabase database password and secret key, finds the right connection address,
// tests it, and saves everything into .env. Typed values are not shown on screen.
//   npm run setup-supabase
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REF = 'gksnkyonknvkuqhhuimc';
const ENV = path.join(__dirname, '..', '.env');
const REGIONS = ['ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1'];

function askHidden(q) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(q);
    let v = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const on = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', on); process.stdout.write('\n'); return resolve(v.trim()); }
        if (c === '\u0003') process.exit(1);
        if (c === '\u0008' || c === '\u007f') { if (v.length) { v = v.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        v += c; process.stdout.write('*');
      }
    };
    stdin.on('data', on);
  });
}

async function tryUrl(url) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try { await c.connect(); await c.query('select 1'); return 'ok'; }
  catch (e) { return e.message; }
  finally { try { await c.end(); } catch { /* ignore */ } }
}

function saveEnv(values) {
  let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, () => line) : text.replace(/\s*$/, '\n') + line + '\n';
  }
  fs.writeFileSync(ENV, text);
}

(async () => {
  console.log('\n=== Connect this website to Supabase ===\n');
  console.log('Paste with a RIGHT-CLICK in this window, then press Enter. You will see * instead of the text.\n');
  const existing = ((fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '').match(/^DATABASE_URL=(.+)$/m) || [])[1];
  let found = '';
  if (existing && (await tryUrl(existing.trim())) === 'ok') {
    found = existing.trim();
    console.log('1) Database password: already saved and working. Skipping.\n');
  } else {
    const password = await askHidden('1) Your Supabase DATABASE PASSWORD: ');
    if (!password) throw new Error('No password entered.');
    console.log('\nLooking for your database...');
    const enc = encodeURIComponent(password);
    let authError = '';
    outer:
    for (const prefix of ['aws-0', 'aws-1']) {
      for (const region of REGIONS) {
        const url = `postgresql://postgres.${REF}:${enc}@${prefix}-${region}.pooler.supabase.com:6543/postgres`;
        const r = await tryUrl(url);
        if (r === 'ok') { found = url; break outer; }
        if (/password authentication failed/i.test(r)) { authError = r; break outer; }
      }
    }
    if (authError) throw new Error('The password is wrong. Reset it in Supabase: Project Settings > Database > Reset database password, then run this again.');
    if (!found) throw new Error('Could not reach the database. Check your internet connection and try again.');
    console.log('Database found and connected.\n');
  }

  console.log('2) Your Supabase SECRET KEY');
  console.log('   (Supabase > Project Settings > API Keys > "secret" key, starts with sb_secret_)');
  const key = await askHidden('   Paste it here: ');
  if (!key) throw new Error('No key entered.');
  if (key.startsWith('sb_publishable_')) throw new Error('That is the PUBLISHABLE key. Copy the SECRET key instead (it starts with sb_secret_). You may need to click "Reveal" or create one with "+ New secret key".');
  const url = `https://${REF}.supabase.co`;
  const ok = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  // Only a secret (service) key may read storage bucket settings, so this proves the key type.
  const r = await fetch(`${url}/storage/v1/bucket/does-not-exist-check`, { headers: ok });
  if (r.status === 401 || r.status === 403) throw new Error(`That key did not work (${r.status}). Make sure you copied the SECRET key.`);
  console.log('Secret key works.\n');

  saveEnv({ DATABASE_URL: found, SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, SUPABASE_BUCKET: 'uploads' });
  console.log('Saved. You can close this window and tell Kiro "done".\n');
})().catch(e => { console.error('\nProblem: ' + e.message + '\n'); process.exitCode = 1; })
  .finally(() => { if (process.stdin.isTTY) { console.log('Press Enter to close.'); process.stdin.resume(); process.stdin.once('data', () => process.exit()); } });
