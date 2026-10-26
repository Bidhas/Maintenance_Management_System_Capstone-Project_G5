// Requester follow-up: reopen a completed request, leave feedback. Mounted under /api/requests.
const router = require('express').Router();
const { z } = require('zod');
const { tx } = require('../db');
const { AppError, wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { present, getRow, logStatus } = require('../services/requests');
const { notify, notifyAdmins } = require('../services/notify');
const { audit } = require('../services/audit');
const { getSettings } = require('../services/settings');
const { routeRequest } = require('../services/routing');

router.use(authenticate);

/* ------------------------------ REOPEN (requester only) ------------------------------ */
const reopenSchema = z.object({ why: z.string().trim().min(5, 'Tell us what happened (at least 5 characters)').max(500) });
router.post('/:id(\\d+)/reopen', requireRole('requester'), validate(reopenSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT r.*, t.is_active AS tech_active FROM request r LEFT JOIN technician t ON t.tech_id = r.tech_id WHERE r.request_id=$1 FOR UPDATE OF r', [rid]);
    const cur = rows[0];
    if (!cur || cur.user_id !== req.user.id) throw new AppError(404, 'Request not found');
    if (cur.status !== 'Completed') throw new AppError(409, 'Only a completed request can be reopened');

    const keepTech = cur.tech_id && cur.tech_active;
    await c.query(
      `UPDATE request SET status=$2, tech_id=$3, reopen_count=reopen_count+1, reopened_at=completed_at, completed_at=NULL, started_at=NULL
       WHERE request_id=$1`,
      [rid, keepTech ? 'Assigned' : 'Pending', keepTech ? cur.tech_id : null]);
    await logStatus(c, rid, 'Completed', keepTech ? 'Assigned' : 'Pending', req.user, `Reopened: ${req.body.why}`);
    await audit(c, req.user, 'REQUEST_REOPEN', 'request', rid, req.body.why);
    return { ...cur, keepTech };
  });
  if (r.keepTech) await notify({ role: 'technician', id: r.tech_id, requestId: rid, type: 'Update', title: 'Request reopened', message: `${requestCode(rid)} was reopened: ${req.body.why}` });
  await notifyAdmins(rid, 'Request reopened', `${req.user.name} reopened ${requestCode(rid)}: ${req.body.why}`, 'Update');
  if (!r.keepTech) await routeRequest(rid, req.user);
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

/* ------------------------------ REQUESTER FEEDBACK ------------------------------ */
const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating from 1 to 5').max(5, 'Choose a rating from 1 to 5'),
  comment: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null),
});
router.post('/:id(\\d+)/feedback', requireRole('requester'), validate(feedbackSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM request WHERE request_id=$1 FOR UPDATE', [rid]);
    const cur = rows[0];
    if (!cur || cur.user_id !== req.user.id) throw new AppError(404, 'Request not found');
    if (cur.status !== 'Completed') throw new AppError(409, 'You can rate a request once it is completed');
    if (cur.rating) throw new AppError(409, 'Feedback has already been submitted');
    await c.query('UPDATE request SET rating=$1, feedback_comment=$2 WHERE request_id=$3', [req.body.rating, req.body.comment, rid]);
    await audit(c, req.user, 'FEEDBACK', 'request', rid, `${req.body.rating}/5`);
    return cur;
  });
  if (r.tech_id) await notify({ role: 'technician', id: r.tech_id, requestId: rid, type: 'Update', title: 'New feedback', message: `${requestCode(rid)} was rated ${req.body.rating}/5.` });
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

module.exports = router;
