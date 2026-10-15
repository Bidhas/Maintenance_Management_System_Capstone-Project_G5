const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { ROLES, isRole } = require('../utils/roles');
const { audit } = require('../services/audit');
const { notify } = require('../services/notify');

router.use(authenticate, requireRole('admin'));

// All accounts across the three account tables (US-16)
router.get('/', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT * FROM (
      SELECT user_id AS id, 'requester' AS role, role AS account_type, name, email, college_id, is_active, created_at, suspended_reason,
             (SELECT COUNT(*) FROM request WHERE request.user_id = requester.user_id) AS request_count FROM requester
      UNION ALL SELECT tech_id, 'technician', 'Technician', name, email, NULL, is_active, created_at, NULL, NULL FROM technician
      UNION ALL SELECT admin_id, 'admin', 'Admin', name, email, NULL, is_active, created_at, NULL, NULL FROM admin
    ) u ORDER BY created_at DESC`);
  res.json({ users: rows });
}));

router.patch('/:role/:id(\\d+)/status', validate(z.object({ is_active: z.boolean() })), wrap(async (req, res) => {
  const { role } = req.params;
  const id = parseInt(req.params.id, 10);
  if (!isRole(role)) throw new AppError(400, 'Unknown role');
  if (role === req.user.role && id === req.user.id) throw new AppError(400, 'You cannot deactivate your own account');
  const { table, idCol } = ROLES[role];
  const { rows } = await query(`UPDATE ${table} SET is_active=$1 WHERE ${idCol}=$2 RETURNING name`, [req.body.is_active, id]);
  if (!rows[0]) throw new AppError(404, 'User not found');
  await audit(null, req.user, req.body.is_active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', role, id, rows[0].name);
  res.json({ ok: true });
}));

router.patch('/requester/:id(\\d+)/type', validate(z.object({ account_type: z.enum(['Student', 'Staff', 'Faculty']) })), wrap(async (req, res) => {
  const { rows } = await query('UPDATE requester SET role=$1 WHERE user_id=$2 RETURNING name', [req.body.account_type, req.params.id]);
  if (!rows[0]) throw new AppError(404, 'User not found');
  await audit(null, req.user, 'USER_TYPE_CHANGE', 'requester', parseInt(req.params.id, 10), `${rows[0].name} → ${req.body.account_type}`);
  res.json({ ok: true });
}));

// Suspension blocks new submissions without deactivating the account (distinct from is_active above).
const suspendSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });
router.post('/requester/:id(\\d+)/suspend', validate(suspendSchema), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rows } = await query('UPDATE requester SET suspended_reason=$1, suspended_at=NOW() WHERE user_id=$2 RETURNING name', [req.body.reason, id]);
  if (!rows[0]) throw new AppError(404, 'User not found');
  await audit(null, req.user, 'USER_SUSPEND', 'requester', id, req.body.reason);
  await notify({ role: 'requester', id, requestId: null, type: 'Update', title: 'Submission rights suspended', message: `Your ability to submit new requests has been suspended: ${req.body.reason}` });
  res.json({ ok: true });
}));

router.post('/requester/:id(\\d+)/reinstate', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rows } = await query('UPDATE requester SET suspended_reason=NULL, suspended_at=NULL WHERE user_id=$1 RETURNING name', [id]);
  if (!rows[0]) throw new AppError(404, 'User not found');
  await audit(null, req.user, 'USER_REINSTATE', 'requester', id, rows[0].name);
  await notify({ role: 'requester', id, requestId: null, type: 'Update', title: 'Submission rights reinstated', message: 'You can submit new maintenance requests again.' });
  res.json({ ok: true });
}));

module.exports = router;

