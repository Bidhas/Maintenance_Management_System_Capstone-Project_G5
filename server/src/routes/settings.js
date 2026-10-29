const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { getSettings, saveSettings } = require('../services/settings');
const { audit } = require('../services/audit');
const duty = require('../services/duty');
const { processQueue } = require('../services/routing');

router.use(authenticate, requireRole('admin'));

async function withCompliance() {
  const s = await getSettings();
  // "SLA met" = share of assigned requests that were assigned within the target hours for their urgency
  const { rows } = await query(
    `SELECT urgency, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (assigned_at - created_at)) / 3600 <=
              CASE urgency WHEN 'High' THEN $1::numeric WHEN 'Medium' THEN $2::numeric ELSE $3::numeric END) AS met
     FROM request WHERE assigned_at IS NOT NULL GROUP BY urgency`,
    [s.sla_hours.High, s.sla_hours.Medium, s.sla_hours.Low]);
  const compliance = {};
  for (const u of ['High', 'Medium', 'Low']) {
    const r = rows.find((x) => x.urgency === u);
    compliance[u] = r && r.total ? Math.round((r.met / r.total) * 100) : null;
  }
  return { ...s, sla_compliance: compliance };
}

router.get('/', wrap(async (_req, res) => res.json({ settings: await withCompliance() })));

const hours = z.coerce.number().int().min(1).max(720);
const schema = z.object({
  sla_hours: z.object({ High: hours, Medium: hours, Low: hours }).optional(),
  notify_email_enabled: z.boolean().optional(),
  notify_inapp_enabled: z.boolean().optional(),
  assignment_mode: z.enum(['pick', 'auto']).optional(),
});

router.put('/', validate(schema), wrap(async (req, res) => {
  const b = req.body;
  const values = {};
  if (b.sla_hours) Object.assign(values, { sla_high_hours: b.sla_hours.High, sla_medium_hours: b.sla_hours.Medium, sla_low_hours: b.sla_hours.Low });
  if (b.notify_email_enabled !== undefined) values.notify_email_enabled = b.notify_email_enabled;
  if (b.notify_inapp_enabled !== undefined) values.notify_inapp_enabled = b.notify_inapp_enabled;
  if (b.assignment_mode) values.assignment_mode = b.assignment_mode;
  await tx(async (c) => {
    await saveSettings(c, values);
    await audit(c, req.user, 'SETTINGS_UPDATE', 'settings', null, JSON.stringify(values));
  });
  // Switching to 'auto' should immediately try to place everything that is waiting.
  if (b.assignment_mode === 'auto') processQueue().catch((e) => console.error('processQueue after mode change:', e.message));
  res.json({ settings: await withCompliance() });
}));

/* Dev/demo tool: preview routing behaviour at a different simulated time of day without
 * waiting for a real duty window. Never affects anything outside this one process. */
router.get('/clock', wrap(async (_req, res) => res.json(duty.dutyInfo())));

const clockSchema = z.object({ mode: z.enum(['live', 'main-hours', 'volunteer-hours', 'all-off', 'duty-weekday', 'offduty-weekday', 'weekend']) });
router.post('/clock', validate(clockSchema), wrap(async (req, res) => {
  duty.setSimClock(req.body.mode);
  await audit(null, req.user, 'SIM_CLOCK', 'settings', null, req.body.mode);
  processQueue().catch((e) => console.error('processQueue after sim clock:', e.message));
  res.json(duty.dutyInfo());
}));

module.exports = router;
