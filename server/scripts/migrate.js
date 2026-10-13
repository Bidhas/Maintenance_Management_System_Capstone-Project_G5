/* Applies every .sql file in ../migrations that hasn't run yet, in order, each in its
 * own transaction. Tracks what's already applied in a _migrations table, so this is
 * safe to run repeatedly as new migration files are added over time. */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // A database created by the original (pre-tracking) migration runner already has the 001 schema
  // but no _migrations rows. Record 001 as applied so only the genuinely new migrations run.
  const { rows: tracked } = await pool.query('SELECT COUNT(*)::int AS n FROM _migrations');
  if (tracked[0].n === 0) {
    const { rows: existing } = await pool.query("SELECT to_regclass('public.request') AS t");
    if (existing[0].t && files.includes('001_init.sql')) {
      await pool.query("INSERT INTO _migrations (filename) VALUES ('001_init.sql') ON CONFLICT DO NOTHING");
      console.log('Existing database detected - marked 001_init.sql as already applied.');
    }
  }
  const { rows } = await pool.query('SELECT filename FROM _migrations');
  const applied = new Set(rows.map((r) => r.filename));

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    ranAny = true;
    console.log(`Applying ${file} ...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration ${file} failed:`, err.message);
      client.release();
      await pool.end();
      process.exit(1);
    }
    client.release();
  }

  console.log(ranAny ? 'Migrations applied.' : 'Already up to date — nothing to do.');
  await pool.end();
}
main();
