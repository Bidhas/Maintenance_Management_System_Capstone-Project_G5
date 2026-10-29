/**
 * PRODUCTION seed: the real categories + the real campus locations (blocks, floors/groups, rooms).
 *   npm run seed:prod
 * Creates NO accounts and NO demo data. Safe to re-run any time (everything is upsert / do-nothing).
 * The admin is created separately:  npm run admin:create -- --email you.cst@rub.edu.bt --name "Your Name"
 */
const { pool, tx } = require('../src/db');
const { BLOCKS, spec } = require('./data/locations');

const CATEGORIES = ['Electrical', 'AC / Ventilation', 'Plumbing', 'Furniture', 'Projector', 'Network', 'Carpentry'];

async function addRoom(c, blockId, buildingId, r, isHostel) {
  const s = spec(r, isHostel);
  await c.query(
    `INSERT INTO room (block_id, building_id, room_no, is_kitchen, student_visible) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (block_id, COALESCE(building_id, 0), LOWER(room_no)) DO NOTHING`,
    [blockId, buildingId, s.no, s.kitchen, s.student]);
}

async function main() {
  let blocks = 0; let rooms = 0;
  await tx(async (c) => {
    for (const name of CATEGORIES) await c.query('INSERT INTO category (category_name) VALUES ($1) ON CONFLICT (category_name) DO NOTHING', [name]);
    for (const b of BLOCKS) {
      const total = (b.floors || []).reduce((n, f) => n + f.rooms.length, 0) + (b.rooms || []).length;
      const { rows } = await c.query(
        `INSERT INTO block (block_name, hostels, rooms, is_hostel, is_active) VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (block_name) DO UPDATE SET rooms = EXCLUDED.rooms, is_hostel = EXCLUDED.is_hostel, is_active = TRUE RETURNING block_id`,
        [b.name, b.is_hostel ? 1 : 0, total, !!b.is_hostel]);
      blocks += 1;
      for (const f of b.floors || []) {
        const gender = b.is_hostel ? b.gender : null; // gender drives volunteer matching for hostels only
        const { rows: br } = await c.query(
          `INSERT INTO building (block_id, name, gender, is_active) VALUES ($1,$2,$3,TRUE)
           ON CONFLICT (block_id, name) DO UPDATE SET gender = EXCLUDED.gender, is_active = TRUE RETURNING building_id`,
          [rows[0].block_id, f.name, gender]);
        for (const r of f.rooms) { await addRoom(c, rows[0].block_id, br[0].building_id, r, !!b.is_hostel); rooms += 1; }
      }
      for (const r of b.rooms || []) { await addRoom(c, rows[0].block_id, null, r, !!b.is_hostel); rooms += 1; }
    }
  });
  console.log(`Production data loaded: ${blocks} blocks, ${rooms} rooms, ${CATEGORIES.length} categories.`);
  console.log('Next: npm run admin:create -- --email <you>.cst@rub.edu.bt --name "Your Name"');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
