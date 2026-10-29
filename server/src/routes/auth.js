const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { query } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { ROLES } = require('../utils/roles');
const { signToken, authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const { audit } = require('../services/audit');
const { isOnDuty } = require('../services/duty');
const { processQueue } = require('../services/routing');
const { verifyGoogleCredential } = require('../services/google');
const { classifyCollegeEmail, collegeIdFromEmail } = require('../utils/collegeEmail');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skip: () => config.isTest,
  message: { error: 'Too many attempts. Please try again later.' },
});

const password = z.string().min(8, 'Password must be at least 8 characters').max(72);
const phone = z.string().trim().max(20).optional().or(z.literal('')).transform((v) => v || null);

const loginSchema = z.object({
  role: z.enum(['technician', 'admin']), // requesters (students/staff) sign in with Google only
  identifier: z.string().trim().min(1, 'Enter your college ID or email'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean().optional(),
});

/** Build the profile payload returned to the client. */
async function loadProfile(role, id) {
  const { table, idCol } = ROLES[role];
  const { rows } = await query(`SELECT * FROM ${table} WHERE ${idCol} = $1`, [id]);
  const u = rows[0];
  if (!u) return null;
  const base = { id, role, name: u.name, email: u.email, phone: u.phone || null, created_at: u.created_at, has_password: !!u.password_hash };
  if (role === 'requester') {
    const { rows: s } = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('Pending','Assigned','In Progress')) AS open
       FROM request WHERE user_id = $1`, [id]);
    return {
      ...base, account_type: u.role, college_id: u.college_id, programme: u.programme, hostel_room: u.hostel_room,
      email_notifications: u.email_notifications, inapp_notifications: u.inapp_notifications,
      suspended_reason: u.suspended_reason || null,
      summary: { submitted: s[0].total, open: s[0].open },
    };
  }
  if (role === 'technician') {
    const { rows: cats } = await query(
      `SELECT c.category_id, c.category_name FROM technician_category tc
       JOIN category c ON c.category_id = tc.category_id WHERE tc.tech_id = $1 ORDER BY c.category_name`, [id]);
    const { rows: wk } = await query(
      `SELECT COUNT(*) AS n FROM request WHERE tech_id = $1 AND assigned_at >= NOW() - INTERVAL '7 days'`, [id]);
    return {
      ...base, availability: u.availability, location: u.location, categories: cats,
      specialty: cats.map((c) => c.category_name).join(', ') || (u.tier === 'Volunteer' ? 'General' : 'Unassigned'),
      email_notifications: u.email_notifications, inapp_notifications: u.inapp_notifications,
      tier: u.tier, gender: u.gender, weekly_cap: u.weekly_cap, week_count: wk[0].n,
      duty_mode: u.duty_override === null ? 'auto' : u.duty_override ? 'on' : 'off',
      on_duty: isOnDuty(u),
    };
  }
  return { ...base, designation: u.designation || 'Administrator' };
}

/** What the login page needs to know to draw itself (no secrets). */
router.get('/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null, passwordLogin: config.allowPasswordLogin, domain: config.allowedEmailDomain });
});

/** Fallback password sign-in for Admin/Technician accounts. Disabled in production unless ALLOW_PASSWORD_LOGIN=true. */
router.post('/login', loginLimiter, validate(loginSchema), wrap(async (req, res) => {
  if (!config.allowPasswordLogin) throw new AppError(403, 'Password sign-in is turned off. Please use "Continue with Google".');
  const { role, identifier, password: pw, remember } = req.body;
  const { table, idCol } = ROLES[role];
  const id = identifier.toLowerCase();
  const { rows } = await query(`SELECT * FROM ${table} WHERE LOWER(email) = $1`, [id]);
  const u = rows[0];
  // Same message for unknown account / wrong password / wrong role tab (US-02)
  const ok = u && u.password_hash && (await bcrypt.compare(pw, u.password_hash)); // Google-only accounts have no hash
  if (!ok) throw new AppError(401, 'Invalid credentials. Check your details and selected role.');
  if (!u.is_active) throw new AppError(403, 'This account has been deactivated. Contact the admin office.');

  const user = { id: u[idCol], role, name: u.name };
  res.json({ token: signToken(user, !!remember), user: await loadProfile(role, user.id) });
}));

/**
 * POST /api/auth/google  { credential, remember? }
 * Verifies the Google ID token, finds the matching account, issues OUR normal JWT.
 *
 * Who may enter (looked up by verified email, in this order):
 *   1. an ADMIN row        (created by the admin script)
 *   2. a TECHNICIAN row    (pre-created by an admin on the Technicians page)
 *   3. anyone whose email matches the college pattern  ->  a requester account is created automatically
 *        02250345.cst@rub.edu.bt = Student, name.cst@rub.edu.bt = Staff
 * Anything else gets 403 "not authorised". Deactivated accounts get 403 too.
 */
router.post('/google', loginLimiter, validate(z.object({ credential: z.string().min(20), remember: z.boolean().optional() })), wrap(async (req, res) => {
  let g;
  try { g = await verifyGoogleCredential(req.body.credential); }
  catch (err) {
    console.error('Google verification failed:', err.message);
    throw new AppError(401, 'We could not verify your Google sign-in. Please try again with your college account.');
  }

  const denied = () => new AppError(403, `This Google account (${g.email}) is not authorised. Sign in with your college email, e.g. 02250345.cst@${config.allowedEmailDomain} (students) or yourname.cst@${config.allowedEmailDomain} (staff).`);
  let role = null; let row = null;
  for (const r of ['admin', 'technician']) {
    const { table } = ROLES[r];
    const { rows } = await query(`SELECT * FROM ${table} WHERE LOWER(email) = $1`, [g.email]);
    if (rows[0]) { role = r; row = rows[0]; break; }
  }
  if (!row) {
    const { rows } = await query('SELECT * FROM requester WHERE LOWER(email) = $1', [g.email]);
    if (rows[0]) { role = 'requester'; row = rows[0]; }
  }
  if (!row) {
    const type = classifyCollegeEmail(g.email);
    if (!type) throw denied();
    try {
      const ins = await query(
        `INSERT INTO requester (role, name, email, college_id, google_sub) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [type, g.name, g.email, collegeIdFromEmail(g.email), g.sub]);
      role = 'requester'; row = ins.rows[0];
      await audit(null, { role: 'requester', id: row.user_id, name: row.name }, 'ACCOUNT_AUTO_CREATE', 'requester', row.user_id, `${type} via Google (${g.email})`);
    } catch (e) {
      if (e.code !== '23505') throw e;
      // two tabs signing in at the same moment: the other one won, just read the row it created
      const { rows } = await query('SELECT * FROM requester WHERE LOWER(email) = $1', [g.email]);
      role = 'requester'; row = rows[0];
    }
  }

  if (!row.is_active) throw new AppError(403, 'This account has been deactivated. Contact the maintenance office.');
  // google_sub is Google's permanent id for the person. First sign-in links it; after that it must match.
  const { table, idCol } = ROLES[role];
  if (!row.google_sub) await query(`UPDATE ${table} SET google_sub = $1 WHERE ${idCol} = $2`, [g.sub, row[idCol]]);
  else if (row.google_sub !== g.sub) throw new AppError(403, 'This account is linked to a different Google identity. Contact the maintenance office.');

  const user = { id: row[idCol], role, name: row.name };
  res.json({ token: signToken(user, !!req.body.remember), user: await loadProfile(role, user.id) });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  res.json({ user: await loadProfile(req.user.role, req.user.id) });
}));

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  phone,
  college_id: z.string().trim().max(20).optional().or(z.literal('')).transform((v) => v || null),
  programme: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || null),
  hostel_room: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || null),
  location: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || null),
  email_notifications: z.boolean().optional(),
  inapp_notifications: z.boolean().optional(),
  availability: z.enum(['Available', 'Busy', 'Off Duty']).optional(),
});

router.put('/profile', authenticate, validate(profileSchema), wrap(async (req, res) => {
  const b = req.body;
  const { role, id } = req.user;
  try {
    if (role === 'requester') {
      await query(
        `UPDATE requester SET name=$1, phone=$2, college_id=$3, programme=$4, hostel_room=$5,
           email_notifications=COALESCE($6,email_notifications), inapp_notifications=COALESCE($7,inapp_notifications)
         WHERE user_id=$8`,
        [b.name, b.phone, b.college_id, b.programme, b.hostel_room, b.email_notifications, b.inapp_notifications, id]);
    } else if (role === 'technician') {
      await query(
        `UPDATE technician SET name=$1, phone=$2, location=$3,
           availability=COALESCE($4,availability),
           email_notifications=COALESCE($5,email_notifications), inapp_notifications=COALESCE($6,inapp_notifications)
         WHERE tech_id=$7`,
        [b.name, b.phone, b.location, b.availability, b.email_notifications, b.inapp_notifications, id]);
    } else {
      await query('UPDATE admin SET name=$1 WHERE admin_id=$2', [b.name, id]);
    }
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'That college ID is already in use');
    throw err;
  }
  res.json({ user: await loadProfile(role, id) });
}));

const passwordSchema = z.object({ current_password: z.string().min(1, 'Enter your current password'), new_password: password });

router.put('/password', authenticate, validate(passwordSchema), wrap(async (req, res) => {
  const { table, idCol } = ROLES[req.user.role];
  const { rows } = await query(`SELECT password_hash FROM ${table} WHERE ${idCol}=$1`, [req.user.id]);
  if (!rows[0].password_hash) throw new AppError(400, 'This account signs in with Google and has no password to change');
  if (!(await bcrypt.compare(req.body.current_password, rows[0].password_hash))) {
    throw new AppError(400, 'Current password is incorrect', { fields: { current_password: 'Current password is incorrect' } });
  }
  await query(`UPDATE ${table} SET password_hash=$1 WHERE ${idCol}=$2`, [await bcrypt.hash(req.body.new_password, 10), req.user.id]);
  await audit(null, req.user, 'PASSWORD_CHANGE', req.user.role, req.user.id);
  res.json({ message: 'Password updated' });
}));

const dutySchema = z.object({ duty_override: z.enum(['auto', 'on', 'off']) });
router.patch('/duty', authenticate, validate(dutySchema), wrap(async (req, res) => {
  if (req.user.role !== 'technician') throw new AppError(403, 'Only technicians have a duty status');
  const value = req.body.duty_override === 'auto' ? null : req.body.duty_override === 'on';
  await query('UPDATE technician SET duty_override=$1 WHERE tech_id=$2', [value, req.user.id]);
  if (value !== false) processQueue().catch((e) => console.error('processQueue after duty change:', e.message));
  res.json({ user: await loadProfile('technician', req.user.id) });
}));

module.exports = router;
module.exports.loadProfile = loadProfile;
