// Requests core: list, create (with auto-routing), detail. Other request actions live in requests.*.js, mounted on the same path.
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, upload } = require('../middleware/common');
const { BASE_SELECT, present, getRow, logStatus } = require('../services/requests');
const { notify, notifyAdmins } = require('../services/notify');
const { audit } = require('../services/audit');
const { saveImage } = require('../services/storage');
const { getSettings } = require('../services/settings');
const { routeRequest, canClaim } = require('../services/routing');
const duty = require('../services/duty');
const { nextDutyWindow } = duty;

router.use(authenticate);

/* ------------------------------ LIST ------------------------------ */
router.get('/', wrap(async (req, res) => {
  const { role, id } = req.user;
  const { status, urgency, category_id, block, q, scope } = req.query;
  const where = [];
  const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };

  let order = 'r.created_at DESC';
  if (role === 'requester') {
    add('r.user_id = ?', id);
  } else if (role === 'technician') {
    if (scope === 'pool') {
      where.push(`r.status = 'Pending' AND r.tech_id IS NULL`);
      order = `CASE r.urgency WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, r.created_at ASC`;
    } else if (scope === 'completed') {
      add('r.tech_id = ?', id);
      where.push(`r.status = 'Completed'`);
      order = 'r.completed_at DESC';
    } else {
      add('r.tech_id = ?', id);
      where.push(`r.status IN ('Assigned','In Progress')`);
      order = `CASE r.urgency WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, r.created_at ASC`;
    }
  }
  if (status) add('r.status = ?', status);
  if (urgency) add('r.urgency = ?', urgency);
  if (category_id) add('r.category_id = ?', parseInt(category_id, 10) || 0);
  if (block) add('r.block = ?', block);
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    params.push(term);
    const n = `$${params.length}`;
    const num = String(q).trim().replace(/^wo-?/i, '');
    let codeClause = '';
    if (/^\d+$/.test(num)) { params.push(parseInt(num, 10)); codeClause = ` OR r.request_id = $${params.length}`; }
    where.push(`(r.title ILIKE ${n} OR r.description ILIKE ${n} OR r.room_no ILIKE ${n} OR r.block ILIKE ${n} OR u.name ILIKE ${n}${codeClause})`);
  }

  const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`;
  let { rows } = await query(sql, params);
  if (role === 'technician' && scope === 'pool') {
    const ok = await Promise.all(rows.map((r) => canClaim({ query }, id, r.request_id)));
    rows = rows.filter((_, i) => ok[i]);
  }
  const { sla_hours } = await getSettings();
  // `duty` feeds the on-duty / off-duty banner on every dashboard (`now` lets the client notice a simulated demo clock)
  res.json({
    requests: rows.map((r) => present(r, sla_hours)),
    next_duty_window: nextDutyWindow(),
    duty: { now: duty.now().toISOString(), in_window: duty.isDutyWindow(), next_window: nextDutyWindow(), tz: duty.TZ },
  });
}));

/* ------------------------------ CREATE ------------------------------ */
const createSchema = z.object({
  block: z.string().trim().min(1, 'Select a block').max(50),
  building_id: z.coerce.number().int().positive().optional(),
  room_no: z.string().trim().min(1, 'Enter the room / office').max(20),
  category_id: z.coerce.number({ invalid_type_error: 'Select a category' }).int().positive('Select a category'),
  title: z.string().trim().min(3, 'Give the issue a short title').max(120),
  description: z.string().trim().min(10, 'Describe the issue in at least 10 characters').max(2000),
  urgency: z.enum(['Low', 'Medium', 'High'], { errorMap: () => ({ message: 'Select an urgency' }) }),
});

router.post('/', requireRole('requester'), upload.single('photo'), validate(createSchema), wrap(async (req, res) => {
  const b = req.body;

  const { rows: susRows } = await query('SELECT suspended_reason FROM requester WHERE user_id=$1', [req.user.id]);
  if (susRows[0]?.suspended_reason) throw new AppError(403, `Your submission rights are currently suspended: ${susRows[0].suspended_reason}`);

  const cat = await query('SELECT category_id FROM category WHERE category_id=$1 AND is_active', [b.category_id]);
  if (!cat.rows[0]) throw new AppError(400, 'Please check the highlighted fields', { fields: { category_id: 'Select a valid category' } });
  const blk = (await query('SELECT block_id, is_hostel FROM block WHERE block_name=$1 AND is_active', [b.block])).rows[0];
  if (!blk) throw new AppError(400, 'Please check the highlighted fields', { fields: { block: 'Select a registered block' } });

  if (blk.is_hostel && !b.building_id) {
    throw new AppError(400, 'Please check the highlighted fields', { fields: { building_id: 'Select the hostel building' } });
  }
  if (b.building_id) {
    const bld = (await query('SELECT 1 FROM building WHERE building_id=$1 AND block_id=$2 AND is_active', [b.building_id, blk.block_id])).rows[0];
    if (!bld) throw new AppError(400, 'Please check the highlighted fields', { fields: { building_id: 'Select a valid building for this block' } });
  }

  const photo = await saveImage(req.file);
  const created = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO request (block, building_id, room_no, urgency, user_id, category_id, title, description, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING request_id`,
      [b.block, b.building_id || null, b.room_no, b.urgency, req.user.id, b.category_id, b.title, b.description, photo]);
    await logStatus(c, rows[0].request_id, null, 'Pending', req.user, 'Request submitted');
    await audit(c, req.user, 'REQUEST_CREATE', 'request', rows[0].request_id, `${b.block} ${b.room_no}`);
    return rows[0].request_id;
  });

  const code = requestCode(created);
  await notify({ role: 'requester', id: req.user.id, requestId: created, type: 'Request',
    title: 'Request received', message: `${code} "${b.title}" was submitted successfully and added to the queue.` });

  const routed = await routeRequest(created, req.user);
  if (!routed) {
    // Couldn't auto-assign right now (off-duty window, cap reached, or no matching technician) — this is
    // exactly the case that needs a human, so admins are notified here but NOT on routine auto-assigned requests.
    const row = await getRow(created);
    await notifyAdmins(created, 'Request needs attention', `${code} ${b.title} (${b.block}, ${b.room_no}) couldn't be auto-assigned: ${row.queue_reason}`, 'Request');
  }

  const { sla_hours } = await getSettings();
  res.status(201).json({ request: present(await getRow(created), sla_hours) });
}));

/* ------------------------------ DETAIL ------------------------------ */
router.get('/:id(\\d+)', wrap(async (req, res) => {
  const row = await getRow(parseInt(req.params.id, 10));
  if (!row) throw new AppError(404, 'Request not found');
  const { role, id } = req.user;
  if (role === 'requester' && row.user_id !== id) throw new AppError(403, 'You can only view your own requests');
  if (role === 'technician' && row.tech_id !== id && !(row.status === 'Pending' && !row.tech_id)) {
    throw new AppError(403, 'This work order is not assigned to you');
  }
  const { rows: history } = await query(
    `SELECT old_status, new_status, changed_by_role, changed_by_name, note, changed_at
     FROM request_status_history WHERE request_id=$1 ORDER BY changed_at, history_id`, [row.request_id]);
  const { rows: escalations } = await query(
    `SELECT e.reason, e.note, e.created_at, f.name AS from_name, t.name AS to_name
     FROM escalation e LEFT JOIN technician f ON f.tech_id = e.from_tech_id LEFT JOIN technician t ON t.tech_id = e.to_tech_id
     WHERE e.request_id = $1 ORDER BY e.created_at`, [row.request_id]);
  const { sla_hours } = await getSettings();
  res.json({ request: present(row, sla_hours), history, escalations, next_duty_window: nextDutyWindow() });
}));

module.exports = router;
