const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { audit } = require('../services/audit');
const { processQueue } = require('../services/routing');
const { isOnDuty } = require('../services/duty');
const config = require('../config');

router.use(authenticate, requireRole('admin'));

const LIST_SQL = `
  SELECT t.tech_id AS id, t.name, t.email, t.phone, t.location, t.availability, t.is_active,
         t.tier, t.gender, t.duty_override, t.weekly_cap,
         COALESCE((SELECT json_agg(json_build_object('category_id', c.category_id, 'category_name', c.category_name) ORDER BY c.category_name)
                   FROM technician_category tc JOIN category c USING (category_id) WHERE tc.tech_id = t.tech_id), '[]'::json) AS categories,
         (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.status IN ('Assigned','In Progress')) AS active_orders,
         (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.assigned_at >= NOW() - INTERVAL '7 days') AS week_count
  FROM technician t`;

const present = (t) => ({
  ...t,
  specialty: t.categories.map((c) => c.category_name).join(', ') || (t.tier === 'Volunteer' ? 'General' : 'Unassigned'),
  on_duty: isOnDuty(t),
  duty_mode: t.duty_override === null ? 'auto' : t.duty_override ? 'on' : 'off',
});

router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`${LIST_SQL} ORDER BY t.is_active DESC, t.tier, t.name`);
  const list = rows.map(present);
  const active = list.filter((t) => t.is_active);
  res.json({
    technicians: list,
    stats: {
      total: active.length,
      on_duty: active.filter((t) => t.on_duty).length,
      open_assignments: active.reduce((n, t) => n + t.active_orders, 0),
      main: active.filter((t) => t.tier === 'Main').length,
      volunteer: active.filter((t) => t.tier === 'Volunteer').length,
    },
  });
}));

const ids = z.array(z.coerce.number().int().positive()).default([]);
const dutyMode = z.enum(['auto', 'on', 'off']).default('auto').transform((v) => (v === 'auto' ? null : v === 'on'));
const fields = {
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(100),
  phone: z.string().trim().max(20).optional().or(z.literal('')).transform((v) => v || null),
  location: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || null),
  availability: z.enum(['Available', 'Busy', 'Off Duty']).default('Available'),
  tier: z.enum(['Main', 'Volunteer'], { errorMap: () => ({ message: 'Select Main or Volunteer' }) }).default('Main'),
  gender: z.enum(['M', 'F']).optional(),
  weekly_cap: z.coerce.number().int().positive('Must be at least 1').max(20, 'Must be 20 or fewer').default(3),
  duty_override: dutyMode,
  category_ids: ids,
};

// When Google sign-in is configured the technician's email MUST be their real college address, otherwise they could never log in.
function requireCollegeEmail(data, ctx) {
  if (config.googleClientId && !data.email.endsWith(`@${config.allowedEmailDomain}`)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Use the technician's @${config.allowedEmailDomain} college email`, path: ['email'] });
  }
}

function requireGenderForVolunteers(data, ctx) {
  if (data.tier === 'Volunteer' && !data.gender) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gender is required for Volunteer Technicians (used for hostel matching)', path: ['gender'] });
  }
}

// Technicians now sign in with Google, so NO password is needed. (An optional one can still be set for the fallback login.)
const optPassword = z.string().min(8, 'Password must be at least 8 characters').max(72).optional().or(z.literal(''));
const createSchema = z.object({ ...fields, password: optPassword }).superRefine(requireGenderForVolunteers).superRefine(requireCollegeEmail);
const updateSchema = z.object({
  ...fields,
  is_active: z.boolean().default(true),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional().or(z.literal('')),
}).superRefine(requireGenderForVolunteers).superRefine(requireCollegeEmail);

async function setCategories(c, techId, categoryIds) {
  await c.query('DELETE FROM technician_category WHERE tech_id=$1', [techId]);
  for (const cid of [...new Set(categoryIds)]) {
    await c.query('INSERT INTO technician_category (tech_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [techId, cid]);
  }
}

router.post('/', validate(createSchema), wrap(async (req, res) => {
  const b = req.body;
  const hash = b.password ? await bcrypt.hash(b.password, 10) : null; // null = Google-only account
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO technician (name, email, phone, location, availability, admin_id, password_hash, tier, gender, weekly_cap, duty_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING tech_id`,
      [b.name, b.email, b.phone, b.location, b.availability, req.user.id, hash, b.tier, b.gender || null, b.weekly_cap, b.duty_override]);
    await setCategories(c, rows[0].tech_id, b.category_ids);
    await audit(c, req.user, 'TECHNICIAN_CREATE', 'technician', rows[0].tech_id, `${b.name} (${b.tier})`);
    return rows[0].tech_id;
  }).catch((e) => { if (e.code === '23503') throw new AppError(400, 'Unknown category selected'); throw e; });
  processQueue().catch((e) => console.error('processQueue after technician create:', e.message));
  const { rows } = await query(`${LIST_SQL} WHERE t.tech_id=$1`, [id]);
  res.status(201).json({ technician: present(rows[0]) });
}));

router.put('/:id(\\d+)', validate(updateSchema), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  await tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE technician SET name=$1, email=$2, phone=$3, location=$4, availability=$5, is_active=$6,
              tier=$7, gender=$8, weekly_cap=$9, duty_override=$10 WHERE tech_id=$11`,
      [b.name, b.email, b.phone, b.location, b.availability, b.is_active, b.tier, b.gender || null, b.weekly_cap, b.duty_override, id]);
    if (!rowCount) throw new AppError(404, 'Technician not found');
    if (b.password) await c.query('UPDATE technician SET password_hash=$1 WHERE tech_id=$2', [await bcrypt.hash(b.password, 10), id]);
    await setCategories(c, id, b.category_ids);
    await audit(c, req.user, 'TECHNICIAN_UPDATE', 'technician', id, b.name + (b.is_active ? '' : ' (deactivated)'));
    if (!b.is_active) {
      // Freeing up their open jobs back into the routing pool, same as removing a technician in zip1
      await c.query(`UPDATE request SET tech_id=NULL, status='Pending', queue_reason=NULL WHERE tech_id=$1 AND status IN ('Assigned','In Progress')`, [id]);
    }
  });
  processQueue().catch((e) => console.error('processQueue after technician update:', e.message));
  const { rows } = await query(`${LIST_SQL} WHERE t.tech_id=$1`, [id]);
  res.json({ technician: present(rows[0]) });
}));

module.exports = router;
