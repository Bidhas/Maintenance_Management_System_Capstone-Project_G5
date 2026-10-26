const router = require('express').Router();
const { query } = require('../db');
const { wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// Read-only by design: there is no update/delete endpoint for the audit trail (US-26)
router.get('/', wrap(async (req, res) => {
  const { action, q, from, to } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = parseInt(req.query.offset, 10) || 0;
  const where = [];
  const params = [];
  if (action) { params.push(action); where.push(`action = $${params.length}`); }
  if (from) { params.push(from); where.push(`created_at >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`created_at < ($${params.length}::date + 1)`); }
  if (q) { params.push(`%${q}%`); where.push(`(actor_name ILIKE $${params.length} OR details ILIKE $${params.length} OR action ILIKE $${params.length})`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await query(
    `SELECT log_id AS id, actor_role, actor_name, action, entity, entity_id, details, created_at
     FROM audit_log ${w} ORDER BY created_at DESC, log_id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const { rows: actions } = await query('SELECT DISTINCT action FROM audit_log ORDER BY action');
  res.json({ logs: rows, actions: actions.map((a) => a.action) });
}));

module.exports = router;
