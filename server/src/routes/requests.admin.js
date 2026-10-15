// Admin actions on a request: assign / reassign, change urgency, decline. Mounted under /api/requests.
const router = require('express').Router();
const { z } = require('zod');
const { tx } = require('../db');
const { AppError, wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { present, getRow, logStatus, canMove } = require('../services/requests');
const { notify } = require('../services/notify');
const { audit } = require('../services/audit');
const { getSettings } = require('../services/settings');

router.use(authenticate);

/* ------------------------------ ADMIN ACTIONS ------------------------------ */
const assignSchema = z.object({ tech_id: z.coerce.number().int().positive('Select a technician') });

router.post('/:id(\\d+)/assign', requireRole('admin'), validate(assignSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const result = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    const r = rows[0];
    if (!r) throw new AppError(404, 'Request not found');
    if (!['Pending', 'Assigned', 'In Progress'].includes(r.status)) throw new AppError(409, `A ${r.status} request cannot be assigned`);
    const t = (await c.query('SELECT * FROM technician WHERE tech_id=$1', [req.body.tech_id])).rows[0];
    if (!t || !t.is_active) throw new AppError(400, 'Technician not found or inactive');
    if (r.tech_id === t.tech_id) throw new AppError(409, `Already assigned to ${t.name}`);
    // Manual admin assignment is a deliberate override — it bypasses duty window, gender-matching
    // and weekly-cap checks on purpose, the same way zip1's "force edit" did.

    const reassign = !!r.tech_id;
    await c.query(
      `UPDATE request SET tech_id=$1, admin_id=$2, status='Assigned',
              assigned_at=COALESCE(assigned_at, NOW()), started_at=NULL, queue_reason=NULL WHERE request_id=$3`,
      [t.tech_id, req.user.id, rid]);
    if (r.status !== 'Assigned') await logStatus(c, rid, r.status, 'Assigned', req.user, reassign ? `Manually reassigned to ${t.name}` : `Manually assigned to ${t.name}`);
    else await logStatus(c, rid, 'Assigned', 'Assigned', req.user, `Manually reassigned to ${t.name}`);
    await audit(c, req.user, reassign ? 'REQUEST_REASSIGN' : 'REQUEST_ASSIGN', 'request', rid, `→ ${t.name}`);
    return { r, t, reassign };
  });
  const code = requestCode(rid);
  const { r, t, reassign } = result;
  await notify({ role: 'technician', id: t.tech_id, requestId: rid, type: 'Request', title: 'New work order assigned', message: `${code} "${r.title}" (${r.block}, ${r.room_no}) has been assigned to you.` });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Update', title: reassign ? 'Technician changed' : 'Request assigned', message: `${t.name} has been assigned to "${r.title}". Work should begin shortly.` });
  if (reassign && r.tech_id) await notify({ role: 'technician', id: r.tech_id, requestId: rid, type: 'Update', title: 'Work order reassigned', message: `${code} has been reassigned to another technician.` });
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

const urgencySchema = z.object({ urgency: z.enum(['Low', 'Medium', 'High']) });
router.patch('/:id(\\d+)/urgency', requireRole('admin'), validate(urgencySchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    if (!rows[0]) throw new AppError(404, 'Request not found');
    if (['Completed', 'Declined'].includes(rows[0].status)) throw new AppError(409, 'Closed requests cannot be changed');
    await c.query('UPDATE request SET urgency=$1 WHERE request_id=$2', [req.body.urgency, rid]);
    await audit(c, req.user, 'URGENCY_CHANGE', 'request', rid, `${rows[0].urgency} → ${req.body.urgency}`);
    return rows[0];
  });
  if (r.tech_id) await notify({ role: 'technician', id: r.tech_id, requestId: rid, type: 'Update', title: 'Urgency changed', message: `${requestCode(rid)} is now ${req.body.urgency === 'High' ? 'Urgent' : req.body.urgency} priority.` });
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

const declineSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(500) });
router.post('/:id(\\d+)/decline', requireRole('admin'), validate(declineSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    const cur = rows[0];
    if (!cur) throw new AppError(404, 'Request not found');
    if (!canMove(cur.status, 'Declined')) throw new AppError(409, `A ${cur.status} request cannot be declined`);
    await c.query(`UPDATE request SET status='Declined', decline_reason=$1, admin_id=$2 WHERE request_id=$3`, [req.body.reason, req.user.id, rid]);
    await logStatus(c, rid, cur.status, 'Declined', req.user, req.body.reason);
    await audit(c, req.user, 'REQUEST_DECLINE', 'request', rid, req.body.reason);
    return cur;
  });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Update', title: 'Request declined', message: `${requestCode(rid)} "${r.title}" was declined: ${req.body.reason}` });
  if (r.tech_id) await notify({ role: 'technician', id: r.tech_id, requestId: rid, type: 'Update', title: 'Work order cancelled', message: `${requestCode(rid)} was declined by the admin.` });
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

module.exports = router;
