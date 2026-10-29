/**
 * Creates (or updates) an admin account.   npm run admin:create -- --email x.cst@rub.edu.bt --name "Full Name"
 *
 * The password is NEVER stored in the repo. It is read, in this order, from:
 *   1. the ADMIN_PASSWORD environment variable      (e.g.  ADMIN_PASSWORD='...' npm run admin:create -- ...)
 *   2. a hidden prompt in the terminal
 *   3. none — skip it entirely with --no-password: the admin then signs in ONLY with Google
 * Re-running for an existing email updates the name/password — handy for a password reset.
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); else process.stdout.write('*'); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const name = (arg('name') || '').trim() || email.split('@')[0];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Usage: npm run admin:create -- --email <email> --name "<Full Name>"'); process.exit(1); }

  let hash = null;
  if (!process.argv.includes('--no-password')) {
    const pw = process.env.ADMIN_PASSWORD || (await askHidden('Admin password (min 8 chars): '));
    if (!pw || pw.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
    hash = bcrypt.hashSync(pw, 10);
  }
  const { rows } = await pool.query(
    `INSERT INTO admin (name, email, password_hash, designation) VALUES ($1,$2,$3,'Administrator')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = COALESCE(EXCLUDED.password_hash, admin.password_hash), is_active = TRUE
     RETURNING admin_id`, [name, email, hash]);
  console.log(`Admin ready: ${email} (id ${rows[0].admin_id}). ${hash ? 'Password set.' : 'Google sign-in only.'}`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
