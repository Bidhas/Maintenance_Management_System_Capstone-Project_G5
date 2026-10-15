const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { audit } = require('../services/audit');
const { processQueue } = require('../services/routing');

router.use(authenticate);

router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT bl.block_id AS id, bl.block_name AS name, bl.hostels, bl.rooms, bl.is_hostel,
           COALESCE((SELECT json_agg(json_build_object('id', b.building_id, 'name', b.name, 'gender', b.gender) ORDER BY b.name)
                     FROM building b WHERE b.block_id = bl.block_id AND b.is_active), '[]'::json) AS buildings
    FROM block bl WHERE bl.is_active ORDER BY bl.block_name`);
  res.json({ blocks: rows });
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

module.exports = router;
