/**
 * Seeds the database.
 *   npm run seed        -> full demo data (sample students, Main + Volunteer
 *                          technicians, hostel buildings, sample work orders
 *                          including an escalation and a reopened ticket) - good
 *                          for local development/demo.
 *   npm run seed:base   -> only what a fresh production deploy needs: one admin
 *                          account, the categories and blocks/buildings.
 * Safe to re-run: uses ON CONFLICT DO NOTHING / UPDATE throughout.
 */
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');

const isBase = process.argv.includes('--base');
const hash = (pw) => bcrypt.hashSync(pw, 10);

const CATEGORIES = ['Electrical', 'AC / Ventilation', 'Plumbing', 'Furniture', 'Projector', 'Network', 'Carpentry'];
const BLOCKS = [
  { name: 'Hostel Block A', hostels: 3, rooms: 96, is_hostel: true, buildings: [{ name: 'Wing 1 (Male)', gender: 'M' }, { name: 'Wing 2 (Female)', gender: 'F' }] },
  { name: 'Hostel Block B', hostels: 2, rooms: 64, is_hostel: true, buildings: [{ name: 'Block B Male', gender: 'M' }, { name: 'Block B Female', gender: 'F' }] },
  { name: 'Hostel Block C', hostels: 2, rooms: 72, is_hostel: true, buildings: [{ name: 'Block C Male', gender: 'M' }, { name: 'Block C Female', gender: 'F' }] },
  { name: 'Academic Block A', hostels: 0, rooms: 18, is_hostel: false, buildings: [] },
  { name: 'Academic Block B', hostels: 0, rooms: 14, is_hostel: false, buildings: [] },
  { name: 'Faculty Wing', hostels: 0, rooms: 22, is_hostel: false, buildings: [] },
];

async function seedBase(c) {
  const { rows: admin } = await c.query(
    `INSERT INTO admin (name, email, password_hash, designation) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING admin_id`,
    ['Dorji Penjor', 'admin@cmms.local', hash('Admin@123'), 'Lead Ops Admin']);
  for (const name of CATEGORIES) {
    await c.query('INSERT INTO category (category_name) VALUES ($1) ON CONFLICT (category_name) DO NOTHING', [name]);
  }
  const buildingIds = {};
  for (const b of BLOCKS) {
    const { rows } = await c.query(
      `INSERT INTO block (block_name, hostels, rooms, is_hostel) VALUES ($1,$2,$3,$4)
       ON CONFLICT (block_name) DO UPDATE SET hostels = EXCLUDED.hostels, rooms = EXCLUDED.rooms, is_hostel = EXCLUDED.is_hostel
       RETURNING block_id`, [b.name, b.hostels, b.rooms, b.is_hostel]);
    for (const building of b.buildings) {
      const { rows: br } = await c.query(
        `INSERT INTO building (block_id, name, gender) VALUES ($1,$2,$3)
         ON CONFLICT (block_id, name) DO UPDATE SET gender = EXCLUDED.gender RETURNING building_id`,
        [rows[0].block_id, building.name, building.gender]);
      buildingIds[`${b.name}::${building.name}`] = br[0].building_id;
    }
  }
  console.log('Base data seeded.');
  console.log('  Admin login: admin@cmms.local / Admin@123');
  return { adminId: admin[0].admin_id, buildingIds };
}

async function seedDemo(c, adminId, buildingIds) {
  const catId = async (name) => (await c.query('SELECT category_id FROM category WHERE category_name=$1', [name])).rows[0].category_id;
  const electrical = await catId('Electrical');
  const ac = await catId('AC / Ventilation');
  const furniture = await catId('Furniture');
  const projector = await catId('Projector');
  const plumbing = await catId('Plumbing');

  // Main Technicians (staff) — specialization-matched, not gender/duty-restricted the same way volunteers are.
  const mains = [
    { name: 'P. Wangmo', email: 'p.wangmo@cmms.local', location: 'Hostel Block A', cats: [electrical, projector] },
    { name: 'S. Dorji', email: 's.dorji@cmms.local', location: 'Hostel Block B', cats: [furniture, ac] },
  ];
  // Volunteer Technicians (students) — gender-matched to hostel buildings, weekly-capped.
  // Pema Choden has duty_override forced ON so a demo request to a female hostel building
  // routes immediately regardless of the real clock, without needing the sim-clock control.
  const volunteers = [
    { name: 'K. Namgay', email: 'k.namgay@cmms.local', gender: 'M', weekly_cap: 3, duty_override: null, cats: [ac, electrical] },
    { name: 'Pema Choden', email: 'pema.c@cmms.local', gender: 'F', weekly_cap: 2, duty_override: true, cats: [ac, furniture] },
    { name: 'Tenzin Norbu', email: 'tenzin.n@cmms.local', gender: 'M', weekly_cap: 4, duty_override: null, cats: [electrical, plumbing] },
  ];
  const techIds = {};
  for (const t of mains) {
    const { rows } = await c.query(
      `INSERT INTO technician (name, email, password_hash, location, admin_id, tier) VALUES ($1,$2,$3,$4,$5,'Main')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING tech_id`,
      [t.name, t.email, hash('Tech@123'), t.location, adminId]);
    techIds[t.name] = rows[0].tech_id;
    for (const cid of t.cats) await c.query('INSERT INTO technician_category (tech_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].tech_id, cid]);
  }
  for (const t of volunteers) {
    const { rows } = await c.query(
      `INSERT INTO technician (name, email, password_hash, admin_id, tier, gender, weekly_cap, duty_override)
       VALUES ($1,$2,$3,$4,'Volunteer',$5,$6,$7)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING tech_id`,
      [t.name, t.email, hash('Volunteer@123'), adminId, t.gender, t.weekly_cap, t.duty_override]);
    techIds[t.name] = rows[0].tech_id;
    for (const cid of t.cats) await c.query('INSERT INTO technician_category (tech_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].tech_id, cid]);
  }
  console.log('  Main Technician login: p.wangmo@cmms.local / Tech@123 (also s.dorji@)');
  console.log('  Volunteer Technician login: pema.c@cmms.local / Volunteer@123 (on-duty override — good for a live demo; also k.namgay@, tenzin.n@)');

  const students = [
    { name: 'Tashi Dorji', email: '02230148@college.bt', college_id: '02230148', hostel_room: 'Hostel Block A · Wing 1 (Male) · Room 214', programme: 'BE Civil Engineering, Yr 4' },
    { name: 'Dechen Wangmo', email: '02230201@college.bt', college_id: '02230201', hostel_room: 'Hostel Block A · Wing 2 (Female) · Room 118', programme: 'BE Software Engineering, Yr 3' },
    { name: 'Karma Tshering', email: '02230255@college.bt', college_id: '02230255', hostel_room: 'Hostel Block C · Block C Male · Room 301', programme: 'BE Electrical Engineering, Yr 2' },
  ];
  const userIds = {};
  for (const s of students) {
    const { rows } = await c.query(
      `INSERT INTO requester (role, name, email, password_hash, college_id, hostel_room, programme) VALUES ('Student',$1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id`,
      [s.name, s.email, hash('Student@123'), s.college_id, s.hostel_room, s.programme]);
    userIds[s.name] = rows[0].user_id;
  }
  // Karma Tshering is seeded pre-suspended, purely so the admin Users page has something to demo immediately.
  await c.query(`UPDATE requester SET suspended_reason='Multiple duplicate/false reports in the same week', suspended_at=NOW() WHERE user_id=$1`, [userIds['Karma Tshering']]);
  console.log('  Student login: 02230148@college.bt / Student@123 (college ID also works)');
  console.log('  Suspended demo account: 02230255@college.bt / Student@123 (for the Users > Reinstate demo)');

  const { rows: existing } = await c.query('SELECT COUNT(*) AS n FROM request');
  if (parseInt(existing[0].n, 10) > 0) { console.log('  Requests already present — skipping sample work orders.'); return; }

  const now = Date.now();
  const days = (n) => new Date(now - n * 86400000);
  const bid = (block, building) => buildingIds[`${block}::${building}`];

  const samples = [
    { u: userIds['Tashi Dorji'], t: null, cat: electrical, block: 'Hostel Block A', building: bid('Hostel Block A', 'Wing 1 (Male)'), room: 'Room 214', title: 'Ceiling fan not spinning',
      desc: 'The ceiling fan in Room 214 has stopped spinning entirely. It makes a slight humming noise when switched on but does not rotate. Possible regulator or capacitor burn.',
      urgency: 'High', status: 'Pending', created: days(0), queue_reason: 'Waiting for the next on-duty window' },
    { u: userIds['Tashi Dorji'], t: techIds['P. Wangmo'], cat: projector, block: 'Academic Block A', room: 'Room A-305', title: 'Projector no display signal',
      desc: 'Classroom projector powers on but shows no signal from the laptop input.', urgency: 'High', status: 'In Progress', created: days(1), assigned: days(1), started: days(0) },
    { u: userIds['Dechen Wangmo'], t: techIds['Pema Choden'], cat: ac, block: 'Hostel Block A', building: bid('Hostel Block A', 'Wing 2 (Female)'), room: 'Room 118', title: 'AC unit leaking water',
      desc: 'Air conditioning unit is dripping water onto the floor near the window.', urgency: 'Medium', status: 'In Progress', created: days(2), assigned: days(2), started: days(1) },
    { u: userIds['Dechen Wangmo'], t: techIds['S. Dorji'], cat: furniture, block: 'Faculty Wing', room: 'Office F-02', title: 'Office chair armrest broken',
      desc: 'The right armrest has snapped off the office chair.', urgency: 'Low', status: 'In Progress', created: days(2), assigned: days(2), started: days(1) },
    { u: userIds['Karma Tshering'], t: techIds['Tenzin Norbu'], cat: electrical, block: 'Hostel Block C', building: bid('Hostel Block C', 'Block C Male'), room: 'Room 301', title: 'Light fixture flickering',
      desc: 'Corridor light fixture flickers constantly, especially in the evening.', urgency: 'Medium', status: 'Assigned', created: days(2), assigned: days(2) },
    { u: userIds['Dechen Wangmo'], t: techIds['S. Dorji'], cat: furniture, block: 'Academic Block B', room: 'Room B-210', title: 'Window latch not closing',
      desc: 'The window latch does not catch, so the window will not stay shut.', urgency: 'Low', status: 'Completed', created: days(4), assigned: days(4), started: days(3), completed: days(3),
      notes: 'Replaced the latch mechanism.', minutes: 40, rating: 5 },
    // Completed, then reopened — demonstrates the reopen feature out of the box.
    { u: userIds['Tashi Dorji'], t: techIds['K. Namgay'], cat: ac, block: 'Hostel Block A', building: bid('Hostel Block A', 'Wing 1 (Male)'), room: 'Room 207', title: 'Wi-Fi access point offline',
      desc: 'The corridor Wi-Fi access point light is off and there is no signal on this floor.', urgency: 'Medium', status: 'Assigned', created: days(5), assigned: days(5), started: days(4),
      reopenFrom: { completed: days(3), notes: 'Power-cycled the access point and reseated the PoE cable.', minutes: 25, rating: 3, reopen_reason: 'Went offline again two days later' } },
    { u: userIds['Karma Tshering'], t: null, cat: plumbing, block: 'Hostel Block C', building: bid('Hostel Block C', 'Block C Male'), room: 'Room 108', title: 'Leaking sink in room 108',
      desc: 'Sink pipe under the basin has a slow but steady leak.', urgency: 'Medium', status: 'Pending', created: days(1), queue_reason: 'All matching volunteers have reached their weekly job cap' },
  ];

  for (const s of samples) {
    const isReopen = !!s.reopenFrom;
    const { rows } = await c.query(
      `INSERT INTO request (block, building_id, room_no, urgency, status, user_id, tech_id, admin_id, category_id, title, description,
                             created_at, assigned_at, started_at, completed_at, resolution_notes, time_spent_minutes, rating,
                             reopen_count, reopened_at, queue_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING request_id`,
      [s.block, s.building || null, s.room, s.urgency, s.status, s.u, s.t, s.t ? adminId : null, s.cat, s.title, s.desc,
       s.created, s.assigned || null, s.started || null, isReopen ? null : (s.completed || null), isReopen ? null : (s.notes || null),
       isReopen ? null : (s.minutes || null), isReopen ? null : (s.rating || null),
       isReopen ? 1 : 0, isReopen ? s.reopenFrom.completed : null, s.queue_reason || null]);
    await c.query(
      `INSERT INTO request_status_history (request_id, old_status, new_status, changed_by_role, changed_by_id, changed_by_name, changed_at)
       VALUES ($1,NULL,'Pending','requester',$2,'',$3)`, [rows[0].request_id, s.u, s.created]);
    if (isReopen) {
      await c.query(
        `INSERT INTO request_status_history (request_id, old_status, new_status, changed_by_role, changed_by_id, changed_by_name, note, changed_at)
         VALUES ($1,'In Progress','Completed','technician',$2,'',$3,$4)`,
        [rows[0].request_id, s.t, s.reopenFrom.notes, s.reopenFrom.completed]);
      await c.query(
        `INSERT INTO request_status_history (request_id, old_status, new_status, changed_by_role, changed_by_id, changed_by_name, note, changed_at)
         VALUES ($1,'Completed','Assigned','requester',$2,'',$3,$4)`,
        [rows[0].request_id, s.u, `Reopened: ${s.reopenFrom.reopen_reason}`, s.created]);
    }
  }
  console.log(`  ${samples.length} sample work orders created (one pre-reopened).`);

  // One escalation, from Pema Choden (Volunteer, assigned to the AC job below) up to S. Dorji
  // (Main, AC-specialised) — demonstrates the Escalations log out of the box.
  const { rows: escReq } = await c.query(
    `SELECT request_id FROM request WHERE title = 'AC unit leaking water' LIMIT 1`);
  if (escReq[0]) {
    await c.query(
      `INSERT INTO escalation (request_id, from_tech_id, to_tech_id, reason, note, created_at)
       VALUES ($1,$2,$3,'Beyond skill level','Compressor unit needs a licensed HVAC technician, not just a filter clean.',$4)`,
      [escReq[0].request_id, techIds['Pema Choden'], techIds['S. Dorji'], days(1)]);
  }
}

async function main() {
  await tx(async (c) => {
    const { adminId, buildingIds } = await seedBase(c);
    if (!isBase) await seedDemo(c, adminId, buildingIds);
  });
  await pool.end();
}
main().catch((err) => { console.error(err); process.exit(1); });
