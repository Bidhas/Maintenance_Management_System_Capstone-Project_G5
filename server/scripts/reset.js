/* Drops and recreates the public schema, then reapplies migrations. Local/dev use only. */
const { pool } = require('../src/db');
const { execSync } = require('child_process');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset the database when NODE_ENV=production.');
    process.exit(1);
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  console.log('Schema dropped. Re-applying migrations...');
  execSync('node ' + __dirname + '/migrate.js', { stdio: 'inherit' });
}
main();
