const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { audit } = require('../services/audit');

router.use(authenticate);

router.get('/', wrap(async (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  const { rows } = await query(
    `SELECT c.category_id AS id, c.category_name AS name, c.is_active,
            (SELECT COUNT(*) FROM request r WHERE r.category_id = c.category_id) AS request_count
     FROM category c ${all ? '' : 'WHERE c.is_active'} ORDER BY c.category_name`);
  res.json({ categories: rows });
}));

const schema = z.object({ name: z.string().trim().min(2, 'Category name is required').max(100) });

router.post('/', requireRole('admin'), validate(schema), wrap(async (req, res) => {
  const { rows } = await query(
    `INSERT INTO category (category_name) VALUES ($1)
     ON CONFLICT (category_name) DO UPDATE SET is_active = TRUE RETURNING category_id AS id, category_name AS name, is_active`,
    [req.body.name]);
  await audit(null, req.user, 'CATEGORY_CREATE', 'category', rows[0].id, rows[0].name);
  res.status(201).json({ category: rows[0] });
}));

router.put('/:id(\\d+)', requireRole('admin'), validate(schema), wrap(async (req, res) => {
  const { rows } = await query('UPDATE category SET category_name=$1 WHERE category_id=$2 RETURNING category_id AS id, category_name AS name, is_active',
    [req.body.name, req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Category not found');
  await audit(null, req.user, 'CATEGORY_UPDATE', 'category', rows[0].id, rows[0].name);
  res.json({ category: rows[0] });
}));

// Removing a category that already has requests needs confirmation; it is then deactivated (not deleted)
router.delete('/:id(\\d+)', requireRole('admin'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rows } = await query('SELECT category_name, (SELECT COUNT(*) FROM request WHERE category_id=$1) AS n FROM category WHERE category_id=$1', [id]);
  if (!rows[0]) throw new AppError(404, 'Category not found');
  if (rows[0].n > 0) {
    if (req.query.confirm !== 'true') {
      throw new AppError(409, `${rows[0].n} request(s) use this category. Removing it will hide it from new requests.`, { needs_confirm: true });
    }
    await query('UPDATE category SET is_active=FALSE WHERE category_id=$1', [id]);
  } else {
    await query('DELETE FROM category WHERE category_id=$1', [id]);
  }
  await audit(null, req.user, 'CATEGORY_REMOVE', 'category', id, rows[0].category_name);
  res.json({ ok: true });
}));

module.exports = router;
