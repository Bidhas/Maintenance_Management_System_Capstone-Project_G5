// Technician work flow: claim, start, complete. Mounted under /api/requests.
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, upload } = require('../middleware/common');
const { present, getRow, logStatus, canMove } = require('../services/requests');
const { notify, notifyAdmins } = require('../services/notify');
const { audit } = require('../services/audit');
const { saveImage } = require('../services/storage');
const { getSettings } = require('../services/settings');
const { canClaim } = require('../services/routing');

router.use(authenticate);

/* ------------------------------ TECHNICIAN ACTIONS ------------------------------ */
router.post('/:id(\\d+)/claim', requireRole('technician'), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  if (!(await canClaim({ query }, req.user.id, rid))) {
    throw new AppError(403, 'You can only claim requests that match your tier, specialization and duty status (and weekly cap, for volunteers)');
  }
  const r = await tx(async (c) => {
    // atomic: only one technician can win the claim (US-13)
    const upd = await c.query(
      `UPDATE request SET tech_id=$1, status='Assigned', assigned_at=NOW(), queue_reason=NULL
       WHERE request_id=$2 AND status='Pending' AND tech_id IS NULL RETURNING *`, [req.user.id, rid]);
    if (!upd.rows[0]) {
      const ex = await c.query('SELECT status FROM request WHERE request_id=$1', [rid]);
      if (!ex.rows[0]) throw new AppError(404, 'Request not found');
      throw new AppError(409, 'This request has already been assigned to someone else');
    }
    await logStatus(c, rid, 'Pending', 'Assigned', req.user, 'Self-assigned by technician');
    await audit(c, req.user, 'REQUEST_CLAIM', 'request', rid);
    return upd.rows[0];
  });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Update', title: 'Request assigned', message: `${req.user.name} has been assigned to "${r.title}". Work should begin shortly.` });
  await notifyAdmins(rid, 'Request self-assigned', `${req.user.name} picked up ${requestCode(rid)} "${r.title}".`, 'Update');
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

router.post('/:id(\\d+)/start', requireRole('technician'), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    const cur = rows[0];
    if (!cur) throw new AppError(404, 'Request not found');
    if (cur.tech_id !== req.user.id) throw new AppError(403, 'This work order is not assigned to you');
    if (!canMove(cur.status, 'In Progress')) throw new AppError(409, `Cannot start a work order that is ${cur.status}`);
    await c.query(`UPDATE request SET status='In Progress', started_at=NOW() WHERE request_id=$1`, [rid]);
    await logStatus(c, rid, cur.status, 'In Progress', req.user);
    await audit(c, req.user, 'STATUS_CHANGE', 'request', rid, 'Assigned → In Progress');
    return cur;
  });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Update', title: 'Status updated', message: `Your request "${r.title}" is now in progress — a technician has started work.` });
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

const completeSchema = z.object({
  resolution_notes: z.string().trim().min(5, 'Describe what was done (at least 5 characters)').max(2000),
  time_spent_minutes: z.coerce.number({ invalid_type_error: 'Enter the time spent in minutes' }).int('Whole minutes only').positive('Time spent must be greater than 0').max(60 * 24 * 7),
});

router.post('/:id(\\d+)/complete', requireRole('technician'), upload.single('photo'), validate(completeSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const photo = await saveImage(req.file);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    const cur = rows[0];
    if (!cur) throw new AppError(404, 'Request not found');
    if (cur.tech_id !== req.user.id) throw new AppError(403, 'This work order is not assigned to you');
    if (!canMove(cur.status, 'Completed')) throw new AppError(409, cur.status === 'Assigned' ? 'Start the work before completing it' : `Cannot complete a ${cur.status} work order`);
    await c.query(
      `UPDATE request SET status='Completed', completed_at=NOW(), resolution_notes=$1,
              time_spent_minutes=$2, completion_photo_url=$3 WHERE request_id=$4`,
      [req.body.resolution_notes, req.body.time_spent_minutes, photo, rid]);
    await logStatus(c, rid, 'In Progress', 'Completed', req.user, req.body.resolution_notes);
    await audit(c, req.user, 'STATUS_CHANGE', 'request', rid, 'In Progress → Completed');
    return cur;
  });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Completed', title: 'Work completed', message: `${requestCode(rid)} "${r.title}" has been completed. Please rate the resolution.` });
  await notifyAdmins(rid, 'Work completed', `${req.user.name} completed ${requestCode(rid)} "${r.title}".`, 'Completed');
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

module.exports = router;
