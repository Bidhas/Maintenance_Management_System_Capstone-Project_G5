// Technician work flow: claim, start, complete. Mounted under /api/requests.
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, upload } = require('../middleware/common');
const { present, getRow, logStatus, canMove } = require('../services/requests');
const { requestAssigned, requestCompleted } = require('../services/notifyFlow');
const { audit } = require('../services/audit');
const { saveImage } = require('../services/storage');
const { getSettings } = require('../services/settings');
const { claimCheck } = require('../services/routing');

router.use(authenticate);

/* ------------------------------ TECHNICIAN ACTIONS ------------------------------ */
router.post('/:id(\\d+)/claim', requireRole('technician'), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  // Same rules for everyone: must be on duty; Volunteers also have the weekly cap + hostel-gender rule.
  const check = await claimCheck({ query }, req.user.id, rid);
  if (!check.ok) throw new AppError(check.reason === 'Already taken or no longer open' ? 409 : 403, check.reason);
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
  // Notice to the technician ("job accepted") and to the admins ("request assigned"). Requester is NOT notified.
  await requestAssigned({ request: r, tech: { tech_id: req.user.id, name: req.user.name }, how: 'self' });
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
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

const completeSchema = z.object({
  resolution_notes: z.string().trim().min(5, 'Describe what was done (at least 5 characters)').max(2000),
  // What was used on the job (tools, parts, materials). Feeds the Maintenance Log. Write "None" if nothing was used.
  equipment_used: z.string().trim().min(2, 'List the equipment used (or write "None")').max(500),
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
              time_spent_minutes=$2, completion_photo_url=$3, equipment_used=$4 WHERE request_id=$5`,
      [req.body.resolution_notes, req.body.time_spent_minutes, photo, req.body.equipment_used, rid]);
    await logStatus(c, rid, 'In Progress', 'Completed', req.user, req.body.resolution_notes);
    await audit(c, req.user, 'STATUS_CHANGE', 'request', rid, 'In Progress → Completed');
    return cur;
  });
  await requestCompleted({ request: r, techName: req.user.name }); // requester + admins
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

module.exports = router;
