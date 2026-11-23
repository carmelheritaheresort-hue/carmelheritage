// Sends every value in .env.vercel to the linked Vercel project (Production), replacing old values.
// Values go to the Vercel CLI through stdin and are never printed.
//   node scripts/vercel-push-env.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, '..', '.env.vercel');
const pairs = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean);
let failed = 0;
for (const [, key, value] of pairs) {
  const r = spawnSync('npx.cmd', ['--yes', 'vercel@latest', 'env', 'add', key, 'production', '--force'], {
    input: value, encoding: 'utf8', shell: true, cwd: path.join(__dirname, '..')
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  const why = ok ? '' : ' -> ' + String(r.stderr || r.stdout).split('\n').filter(l => /Error|error/.test(l)).slice(0, 2).join(' ').replace(value, '***');
  console.log(`${ok ? 'saved ' : 'FAILED'} ${key}${why}`);
}
process.exit(failed ? 1 : 0);
