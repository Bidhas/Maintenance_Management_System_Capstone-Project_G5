// Volunteer escalation to a Main Technician. Mounted under /api/requests.
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

/* ------------------------------ ESCALATION (Volunteer only) ------------------------------ */
const escalateSchema = z.object({
  reason: z.enum(['Wrong tools', 'Beyond skill level', 'Needs follow-up'], { errorMap: () => ({ message: 'Select a reason' }) }),
  note: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null),
});
router.post('/:id(\\d+)/escalate', requireRole('technician'), validate(escalateSchema), wrap(async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const r = await tx(async (c) => {
    const { rows } = await c.query('SELECT r.*, t.tier FROM request r LEFT JOIN technician t ON t.tech_id = r.tech_id WHERE r.request_id=$1 FOR UPDATE OF r', [rid]);
    const cur = rows[0];
    if (!cur) throw new AppError(404, 'Request not found');
    if (cur.tech_id !== req.user.id) throw new AppError(403, 'This work order is not assigned to you');
    if (cur.tier !== 'Volunteer') throw new AppError(403, 'Only Volunteer Technicians can escalate a job to a Main Technician');
    if (!['Assigned', 'In Progress'].includes(cur.status)) throw new AppError(409, `Cannot escalate a ${cur.status} work order`);

    const why = req.body.reason + (req.body.note ? `: ${req.body.note}` : '');
    await c.query('INSERT INTO escalation (request_id, from_tech_id, reason, note) VALUES ($1,$2,$3,$4)', [rid, req.user.id, req.body.reason, req.body.note]);
    await c.query(`UPDATE request SET escalated=TRUE, tech_id=NULL, status='Pending', queue_reason=NULL WHERE request_id=$1`, [rid]);
    await logStatus(c, rid, cur.status, 'Pending', req.user, `Escalated: ${why}`);
    await audit(c, req.user, 'REQUEST_ESCALATE', 'request', rid, why);
    return cur;
  });
  await notify({ role: 'requester', id: r.user_id, requestId: rid, type: 'Update', title: 'Request escalated', message: `${requestCode(rid)} has been escalated to a Main Technician for specialist attention.` });
  await notifyAdmins(rid, 'Escalation logged', `${req.user.name} escalated ${requestCode(rid)}: ${req.body.reason}`, 'Update');
  await routeRequest(rid, req.user);
  const { sla_hours } = await getSettings();
  res.json({ request: present(await getRow(rid), sla_hours) });
}));

module.exports = router;
