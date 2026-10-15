const router = require('express').Router();
const { query } = require('../db');
const { wrap } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { BASE_SELECT, present } = require('../services/requests');
const { getSettings } = require('../services/settings');
const { isOnDuty } = require('../services/duty');

router.use(authenticate);

router.get('/requester', requireRole('requester'), wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('Pending','Assigned','In Progress')) AS open,
            COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress,
            COUNT(*) FILTER (WHERE status = 'Pending') AS awaiting,
            COUNT(*) FILTER (WHERE status = 'Completed') AS completed,
            COUNT(*) AS total
     FROM request WHERE user_id = $1`, [req.user.id]);
  res.json({ stats: rows[0] });
}));

router.get('/technician', requireRole('technician'), wrap(async (req, res) => {
  const id = req.user.id;
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE assigned_at >= date_trunc('day', NOW()) AND status IN ('Assigned','In Progress')) AS assigned_today,
            COUNT(*) FILTER (WHERE status = 'Assigned') AS assigned,
            COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress,
            COUNT(*) FILTER (WHERE status = 'Completed' AND completed_at >= date_trunc('week', NOW())) AS completed_week,
            COUNT(*) FILTER (WHERE status = 'Completed' AND completed_at >= date_trunc('week', NOW()) - INTERVAL '7 days'
                                                       AND completed_at <  date_trunc('week', NOW())) AS completed_last_week,
            ROUND(AVG(time_spent_minutes) FILTER (WHERE status = 'Completed'), 0) AS avg_minutes,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(rating) AS rating_count,
            COUNT(*) FILTER (WHERE status = 'Completed') AS completed_total
     FROM request WHERE tech_id = $1`, [id]);
  res.json({ stats: rows[0] });
}));

router.get('/admin', requireRole('admin'), wrap(async (_req, res) => {
  const { rows: s } = await query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status IN ('Pending','Assigned','In Progress')) AS open,
            COUNT(*) FILTER (WHERE status = 'Pending' AND urgency = 'High') AS urgent_unassigned,
            COUNT(*) FILTER (WHERE status = 'Pending') AS unassigned,
            COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress,
            COUNT(*) FILTER (WHERE status = 'Completed' AND completed_at >= date_trunc('day', NOW())) AS completed_today
     FROM request`);
  const { rows: byCategory } = await query(
    `SELECT c.category_name AS name, COUNT(*) AS count FROM request r JOIN category c USING (category_id)
     WHERE r.status <> 'Declined' GROUP BY c.category_name ORDER BY count DESC, name LIMIT 6`);
  const { rows: techRows } = await query(
    `SELECT t.tech_id AS id, t.name, t.tier, t.gender, t.duty_override, t.weekly_cap,
            COALESCE((SELECT string_agg(c.category_name, ', ' ORDER BY c.category_name) FROM technician_category tc
                      JOIN category c USING (category_id) WHERE tc.tech_id = t.tech_id), 'General') AS specialty,
            (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.status IN ('Assigned','In Progress')) AS active,
            (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.assigned_at >= NOW() - INTERVAL '7 days') AS week_count
     FROM technician t WHERE t.is_active ORDER BY t.tier, t.name LIMIT 8`);
  const techs = techRows.map((t) => ({ ...t, on_duty: isOnDuty(t) }));
  const { rows: [q] } = await query(`SELECT COUNT(*) AS n FROM request WHERE status = 'Pending' AND tech_id IS NULL`);
  const { rows: [esc] } = await query(`SELECT COUNT(*) AS n FROM request WHERE escalated AND status IN ('Pending','Assigned','In Progress')`);
  const { rows: recent } = await query(`${BASE_SELECT} ORDER BY r.created_at DESC LIMIT 7`);
  const { sla_hours } = await getSettings();
  res.json({ stats: { ...s[0], queued: q.n, escalated_open: esc.n }, by_category: byCategory, technicians: techs, recent: recent.map((r) => present(r, sla_hours)) });
}));

module.exports = router;
