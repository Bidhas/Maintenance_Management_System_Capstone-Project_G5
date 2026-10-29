// Requests core: list, create (with auto-routing), detail. Other request actions live in requests.*.js, mounted on the same path.
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, upload } = require('../middleware/common');
const { BASE_SELECT, present, getRow, logStatus } = require('../services/requests');
const { requestSubmitted } = require('../services/notifyFlow');
const { audit } = require('../services/audit');
const { saveImage } = require('../services/storage');
const { getSettings } = require('../services/settings');
const { routeRequest, evaluateClaim, loadClaimant } = require('../services/routing');
const { dutyInfo } = require('../services/duty');

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
    // Sprint 6: technicians can see EVERY request (pick mode). Scopes:
    //   (default)  my open jobs   |  pool  = unassigned & open   |  all = everything   |  completed = my finished jobs
    if (scope === 'pool') {
      where.push(`r.status = 'Pending' AND r.tech_id IS NULL`);
      order = `CASE r.urgency WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, r.created_at ASC`;
    } else if (scope === 'all') {
      order = `CASE WHEN r.status = 'Pending' AND r.tech_id IS NULL THEN 0 ELSE 1 END, CASE r.urgency WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, r.created_at DESC`;
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
  const { rows } = await query(sql, params);
  const { sla_hours, assignment_mode } = await getSettings();
  let claimant = null;
  if (role === 'technician' && (scope === 'pool' || scope === 'all')) claimant = await loadClaimant({ query }, id);
  const presented = rows.map((r) => {
    const p = present(r, sla_hours);
    if (claimant && r.status === 'Pending' && !r.tech_id) {
      const c = evaluateClaim(claimant, r); // can THIS technician pick it up right now, and if not, why
      p.can_claim = c.ok; p.claim_blocked_reason = c.reason;
    }
    return p;
  });
  // `duty` feeds the on-duty / off-duty banners (per tier) on every dashboard
  res.json({ requests: presented, assignment_mode, duty: dutyInfo(), next_duty_window: dutyInfo().next_window });
}));

/* ------------------------------ CREATE ------------------------------ */
const createSchema = z.object({
  block: z.string().trim().min(1, 'Select a block').max(50),
  building_id: z.coerce.number().int().positive().optional(),
  room_no: z.string().trim().min(1, 'Select the room / office').max(80),
  category_id: z.coerce.number({ invalid_type_error: 'Select a category' }).int().positive('Select a category'),
  title: z.string().trim().min(3, 'Give the issue a short title').max(120),
  description: z.string().trim().min(10, 'Describe the issue in at least 10 characters').max(2000),
  urgency: z.enum(['Low', 'Medium', 'High'], { errorMap: () => ({ message: 'Select an urgency' }) }),
});

router.post('/', requireRole('requester'), upload.single('photo'), validate(createSchema), wrap(async (req, res) => {
  const b = req.body;

  const me = (await query('SELECT suspended_reason, role AS account_type FROM requester WHERE user_id=$1', [req.user.id])).rows[0];
  if (me?.suspended_reason) throw new AppError(403, `Your submission rights are currently suspended: ${me.suspended_reason}`);
  const isStudent = me?.account_type === 'Student';

  const cat = await query('SELECT category_id FROM category WHERE category_id=$1 AND is_active', [b.category_id]);
  if (!cat.rows[0]) throw new AppError(400, 'Please check the highlighted fields', { fields: { category_id: 'Select a valid category' } });
  const blk = (await query('SELECT block_id, is_hostel FROM block WHERE block_name=$1 AND is_active', [b.block])).rows[0];
  if (!blk) throw new AppError(400, 'Please check the highlighted fields', { fields: { block: 'Select a registered block' } });

  if (blk.is_hostel && !b.building_id) {
    throw new AppError(400, 'Please check the highlighted fields', { fields: { building_id: 'Select the hostel floor' } });
  }
  if (b.building_id) {
    const bld = (await query('SELECT 1 FROM building WHERE building_id=$1 AND block_id=$2 AND is_active', [b.building_id, blk.block_id])).rows[0];
    if (!bld) throw new AppError(400, 'Please check the highlighted fields', { fields: { building_id: 'Select a valid floor/group for this block' } });
  }

  // Room check. If the block has registered rooms, the room MUST be one of them (no free text).
  // Students may only report hostel rooms and classrooms / learning spaces (room.student_visible) — enforced here,
  // not just hidden in the UI, so a hand-made API call can't bypass it.
  const roomCount = (await query('SELECT COUNT(*)::int AS n FROM room WHERE block_id=$1 AND is_active', [blk.block_id])).rows[0].n;
  if (roomCount > 0) {
    const room = (await query(
      `SELECT student_visible FROM room WHERE block_id=$1 AND is_active AND LOWER(room_no)=LOWER($2)
         AND COALESCE(building_id,0)=COALESCE($3::int,0)`, [blk.block_id, b.room_no, b.building_id || null])).rows[0];
    if (!room) throw new AppError(400, 'Please check the highlighted fields', { fields: { room_no: 'Select a room from the list' } });
    if (isStudent && !room.student_visible) throw new AppError(403, 'Students can only report hostel rooms and classrooms. Please contact a staff member for other areas.');
  } else if (isStudent && !blk.is_hostel) {
    throw new AppError(403, 'Students can only report hostel rooms and classrooms.');
  }

  const photo = await saveImage(req.file);
  const created = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO request (block, building_id, room_no, urgency, user_id, category_id, title, description, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.block, b.building_id || null, b.room_no, b.urgency, req.user.id, b.category_id, b.title, b.description, photo]);
    await logStatus(c, rows[0].request_id, null, 'Pending', req.user, 'Request submitted');
    await audit(c, req.user, 'REQUEST_CREATE', 'request', rows[0].request_id, `${b.block} ${b.room_no}`);
    return rows[0];
  });

  // Notifications go out AFTER the commit: requester ("submitted") + admins ("new request uploaded").
  await requestSubmitted(created, req.user.name);
  // In 'pick' mode this just marks the request as open for technicians; in 'auto' mode it may assign immediately.
  await routeRequest(created.request_id, req.user);

  const { sla_hours } = await getSettings();
  res.status(201).json({ request: present(await getRow(created.request_id), sla_hours) });
}));

/* ------------------------------ DETAIL ------------------------------ */
router.get('/:id(\\d+)', wrap(async (req, res) => {
  const row = await getRow(parseInt(req.params.id, 10));
  if (!row) throw new AppError(404, 'Request not found');
  const { role, id } = req.user;
  if (role === 'requester' && row.user_id !== id) throw new AppError(403, 'You can only view your own requests');
  const { rows: history } = await query(
    `SELECT old_status, new_status, changed_by_role, changed_by_name, note, changed_at
     FROM request_status_history WHERE request_id=$1 ORDER BY changed_at, history_id`, [row.request_id]);
  const { rows: escalations } = await query(
    `SELECT e.reason, e.note, e.created_at, f.name AS from_name, t.name AS to_name
     FROM escalation e LEFT JOIN technician f ON f.tech_id = e.from_tech_id LEFT JOIN technician t ON t.tech_id = e.to_tech_id
     WHERE e.request_id = $1 ORDER BY e.created_at`, [row.request_id]);
  const { sla_hours } = await getSettings();
  const out = present(row, sla_hours);
  if (role === 'technician' && row.status === 'Pending' && !row.tech_id) {
    const c = evaluateClaim(await loadClaimant({ query }, id), row); // lets the panel show Claim / the reason it is blocked
    out.can_claim = c.ok; out.claim_blocked_reason = c.reason;
  }
  res.json({ request: out, history, escalations, next_duty_window: dutyInfo().next_window });
}));

module.exports = router;
