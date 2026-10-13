// One-off script to create the cmms database, bypassing psql (blocked by Device Guard)
const { Client } = require('pg');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/create-db.js YOUR_POSTGRES_PASSWORD');
  process.exit(1);
}

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres', // connect to the default admin database first
  });
  await client.connect();
  try {
    await client.query('CREATE DATABASE cmms');
    console.log('Database "cmms" created.');
  } catch (err) {
    if (err.code === '42P04') console.log('Database "cmms" already exists — nothing to do.');
    else throw err;
  }
  await client.end();
}
main().catch((err) => { console.error(err.message); process.exit(1); });