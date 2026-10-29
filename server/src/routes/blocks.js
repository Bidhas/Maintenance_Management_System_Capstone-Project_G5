const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { audit } = require('../services/audit');
const { processQueue } = require('../services/routing');

router.use(authenticate);

/**
 * GET /api/blocks            -> blocks the CALLER may report problems in, each with its floors/groups and rooms.
 *   Student : hostel blocks + blocks that have classrooms/learning spaces; only student-visible rooms.
 *   Staff   : every block except hostels. Add ?all=1 (the "show all blocks" checkbox) to include hostels too.
 *   Admin / technician : everything (used by filters and Settings).
 * Visibility is also enforced again when a request is created, so this is convenience, not the only guard.
 */
router.get('/', wrap(async (req, res) => {
  const { rows: blocks } = await query(`
    SELECT bl.block_id AS id, bl.block_name AS name, bl.hostels, bl.rooms, bl.is_hostel,
           COALESCE((SELECT json_agg(json_build_object('id', b.building_id, 'name', b.name, 'gender', b.gender) ORDER BY b.building_id)
                     FROM building b WHERE b.block_id = bl.block_id AND b.is_active), '[]'::json) AS buildings
    FROM block bl WHERE bl.is_active ORDER BY bl.is_hostel DESC, bl.block_name`);
  const { rows: rooms } = await query(
    `SELECT room_id AS id, block_id, building_id, room_no AS no, is_kitchen AS kitchen, student_visible AS student FROM room WHERE is_active ORDER BY room_id`);
  const byBlock = new Map();
  for (const r of rooms) { if (!byBlock.has(r.block_id)) byBlock.set(r.block_id, []); byBlock.get(r.block_id).push(r); }

  let student = false; let staff = false;
  if (req.user.role === 'requester') {
    const me = (await query('SELECT role FROM requester WHERE user_id=$1', [req.user.id])).rows[0];
    student = me?.role === 'Student'; staff = !student;
  }
  const showAll = req.query.all === '1';
  const out = [];
  for (const b of blocks) {
    let list = byBlock.get(b.id) || [];
    if (student) { list = list.filter((r) => r.student); if (!b.is_hostel && !list.length) continue; }
    if (staff && b.is_hostel && !showAll) continue;
    out.push({ ...b, rooms: list.map(({ id, building_id, no, kitchen }) => ({ id, building_id, no, kitchen })), room_total: list.length, rooms_declared: b.rooms });
  }
  res.json({ blocks: out });
}));

const schema = z.object({
  name: z.string().trim().min(2, 'Block name is required').max(50),
  hostels: z.coerce.number().int().min(0).max(1000).default(0),
  rooms: z.coerce.number().int().min(0).max(100000).default(0),
  is_hostel: z.boolean().default(false),
});

router.post('/', requireRole('admin'), validate(schema), wrap(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO block (block_name, hostels, rooms, is_hostel) VALUES ($1,$2,$3,$4)
     ON CONFLICT (block_name) DO UPDATE SET is_active=TRUE, hostels=EXCLUDED.hostels, rooms=EXCLUDED.rooms, is_hostel=EXCLUDED.is_hostel
     RETURNING block_id AS id, block_name AS name, hostels, rooms, is_hostel`, [req.body.name, req.body.hostels, req.body.rooms, req.body.is_hostel]);
  await audit(null, req.user, 'BLOCK_CREATE', 'block', rows[0].id, rows[0].name);
  res.status(201).json({ block: { ...rows[0], buildings: [] } });
}));

router.put('/:id(\\d+)', requireRole('admin'), validate(schema), wrap(async (req, res) => {
  const old = (await query('SELECT block_name FROM block WHERE block_id=$1', [req.params.id])).rows[0];
  if (!old) throw new AppError(404, 'Block not found');
  const { rows } = await query(
    `UPDATE block SET block_name=$1, hostels=$2, rooms=$3, is_hostel=$4 WHERE block_id=$5
     RETURNING block_id AS id, block_name AS name, hostels, rooms, is_hostel`,
    [req.body.name, req.body.hostels, req.body.rooms, req.body.is_hostel, req.params.id]);
  if (old.block_name !== req.body.name) await query('UPDATE request SET block=$1 WHERE block=$2', [req.body.name, old.block_name]);
  await audit(null, req.user, 'BLOCK_UPDATE', 'block', rows[0].id, rows[0].name);
  res.json({ block: rows[0] });
}));

router.delete('/:id(\\d+)', requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await query('UPDATE block SET is_active=FALSE WHERE block_id=$1 RETURNING block_name', [req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Block not found');
  await audit(null, req.user, 'BLOCK_REMOVE', 'block', parseInt(req.params.id, 10), rows[0].block_name);
  res.json({ ok: true });
}));

/* ------------------------------ Buildings (nested under a block) ------------------------------ */
const buildingSchema = z.object({
  name: z.string().trim().min(1, 'Building name is required').max(80),
  gender: z.enum(['M', 'F']).optional(),
});

router.post('/:blockId(\\d+)/buildings', requireRole('admin'), validate(buildingSchema), wrap(async (req, res) => {
  const blockId = parseInt(req.params.blockId, 10);
  const block = (await query('SELECT is_hostel FROM block WHERE block_id=$1 AND is_active', [blockId])).rows[0];
  if (!block) throw new AppError(404, 'Block not found');
  try {
    const { rows } = await query(
      `INSERT INTO building (block_id, name, gender) VALUES ($1,$2,$3) RETURNING building_id AS id, name, gender`,
      [blockId, req.body.name, block.is_hostel ? req.body.gender || null : null]);
    await audit(null, req.user, 'BUILDING_CREATE', 'building', rows[0].id, `${req.body.name} in block ${blockId}`);
    res.status(201).json({ building: rows[0] });
  } catch (e) {
    if (e.code === '23505') throw new AppError(409, 'A building with that name already exists in this block');
    throw e;
  }
}));

router.put('/buildings/:id(\\d+)', requireRole('admin'), validate(buildingSchema), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = (await query(
    `SELECT bl.is_hostel FROM building b JOIN block bl ON bl.block_id = b.block_id WHERE b.building_id=$1`, [id])).rows[0];
  if (!row) throw new AppError(404, 'Building not found');
  const { rows } = await query(
    `UPDATE building SET name=$1, gender=$2 WHERE building_id=$3 RETURNING building_id AS id, name, gender`,
    [req.body.name, row.is_hostel ? req.body.gender || null : null, id]);
  await audit(null, req.user, 'BUILDING_UPDATE', 'building', id, req.body.name);
  processQueue().catch((e) => console.error('processQueue after building update:', e.message));
  res.json({ building: rows[0] });
}));

router.delete('/buildings/:id(\\d+)', requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await query('UPDATE building SET is_active=FALSE WHERE building_id=$1 RETURNING name', [req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Building not found');
  await audit(null, req.user, 'BUILDING_REMOVE', 'building', parseInt(req.params.id, 10), rows[0].name);
  res.json({ ok: true });
}));

/* ------------------------------ Rooms (admin) ------------------------------ */
// Bulk add: one room per line (or comma separated). Lines starting with K are marked as kitchens.
const roomsSchema = z.object({
  building_id: z.coerce.number().int().positive().optional(),
  rooms: z.string().trim().min(1, 'Enter at least one room'),
  student_visible: z.boolean().default(false),
});
router.post('/:blockId(\\d+)/rooms', requireRole('admin'), validate(roomsSchema), wrap(async (req, res) => {
  const blockId = parseInt(req.params.blockId, 10);
  const blk = (await query('SELECT is_hostel FROM block WHERE block_id=$1 AND is_active', [blockId])).rows[0];
  if (!blk) throw new AppError(404, 'Block not found');
  if (req.body.building_id) {
    const ok = (await query('SELECT 1 FROM building WHERE building_id=$1 AND block_id=$2', [req.body.building_id, blockId])).rows[0];
    if (!ok) throw new AppError(400, 'Floor/group does not belong to this block');
  }
  const names = [...new Set(req.body.rooms.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 300);
  let added = 0;
  for (const no of names) {
    const r = await query(
      `INSERT INTO room (block_id, building_id, room_no, is_kitchen, student_visible) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (block_id, COALESCE(building_id, 0), LOWER(room_no)) DO UPDATE SET is_active = TRUE RETURNING room_id`,
      [blockId, req.body.building_id || null, no.slice(0, 60), /^k\d/i.test(no), blk.is_hostel || req.body.student_visible]);
    if (r.rowCount) added += 1;
  }
  await audit(null, req.user, 'ROOMS_ADD', 'block', blockId, `${added} room(s)`);
  res.status(201).json({ added });
}));

router.patch('/rooms/:id(\\d+)', requireRole('admin'), validate(z.object({ student_visible: z.boolean().optional(), is_active: z.boolean().optional() })), wrap(async (req, res) => {
  const { rows } = await query(
    `UPDATE room SET student_visible = COALESCE($1, student_visible), is_active = COALESCE($2, is_active) WHERE room_id=$3 RETURNING room_no`,
    [req.body.student_visible ?? null, req.body.is_active ?? null, req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Room not found');
  await audit(null, req.user, 'ROOM_UPDATE', 'room', parseInt(req.params.id, 10), rows[0].room_no);
  res.json({ ok: true });
}));

module.exports = router;
