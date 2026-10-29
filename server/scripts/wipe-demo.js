/**
 * Removes ALL demo data from the database so only real data remains.
 *   npm run wipe:demo            -> dry run: shows what WOULD be deleted
 *   npm run wipe:demo -- --yes   -> actually deletes
 *
 * Deletes: every request (and its history/notifications/escalations), the audit trail, the demo
 * accounts (@cmms.local technicians/admin, @college.bt students), and the old demo blocks.
 * Keeps: categories, the real blocks/rooms, and any account that is NOT a demo address.
 * SAFETY: refuses to run unless a real (non-@cmms.local) admin already exists, so you cannot lock yourself out.
 */
const { pool, tx } = require('../src/db');

const DEMO_BLOCKS = ['Hostel Block A', 'Hostel Block B', 'Hostel Block C', 'Academic Block A', 'Academic Block B', 'Faculty Wing'];
const demoEmail = `(email ILIKE '%@cmms.local' OR email ILIKE '%@college.bt')`;

async function main() {
  const yes = process.argv.includes('--yes');
  const real = await pool.query(`SELECT email FROM admin WHERE is_active AND email NOT ILIKE '%@cmms.local'`);
  if (!real.rows.length) { console.error('Refusing: no real admin exists yet. Run  npm run admin:create  first.'); process.exit(1); }
  const n = async (sql, p) => Number((await pool.query(sql, p)).rows[0].n);
  const plan = {
    requests: await n('SELECT COUNT(*) AS n FROM request'),
    notifications: await n('SELECT COUNT(*) AS n FROM notification'),
    audit_rows: await n('SELECT COUNT(*) AS n FROM audit_log'),
    demo_requesters: await n(`SELECT COUNT(*) AS n FROM requester WHERE ${demoEmail}`),
    demo_technicians: await n(`SELECT COUNT(*) AS n FROM technician WHERE ${demoEmail}`),
    demo_admins: await n(`SELECT COUNT(*) AS n FROM admin WHERE ${demoEmail}`),
    demo_blocks: await n('SELECT COUNT(*) AS n FROM block WHERE block_name = ANY($1)', [DEMO_BLOCKS]),
  };
  console.log('Real admin(s) kept:', real.rows.map((r) => r.email).join(', '));
  console.table(plan);
  if (!yes) { console.log('Dry run only. Re-run with --yes to delete.'); await pool.end(); return; }

  await tx(async (c) => {
    await c.query('DELETE FROM escalation');
    await c.query('DELETE FROM notification');
    await c.query('DELETE FROM request_status_history');
    await c.query('DELETE FROM request');
    await c.query('TRUNCATE audit_log'); // TRUNCATE: the append-only trigger blocks row-level deletes
    await c.query(`DELETE FROM requester WHERE ${demoEmail}`);
    await c.query(`DELETE FROM technician WHERE ${demoEmail}`);
    await c.query(`DELETE FROM admin WHERE ${demoEmail}`);
    await c.query('DELETE FROM block WHERE block_name = ANY($1)', [DEMO_BLOCKS]); // cascades to their buildings
  });
  console.log('Demo data removed.');
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
