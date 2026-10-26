const router = require('express').Router();
const { query } = require('../db');
const { wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { toCsv } = require('../utils/csv');
const { audit } = require('../services/audit');

router.use(authenticate, requireRole('admin'));

const iso = (d) => d.toISOString().slice(0, 10);

/** Resolves the filter set. Default range = last 30 days. */
function filters(q) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : iso(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : iso(new Date(Date.now() - 29 * 86400000));
  const params = [from, to];
  const where = ['r.created_at >= $1::date', 'r.created_at < ($2::date + 1)'];
  if (q.category_id) { params.push(parseInt(q.category_id, 10) || 0); where.push(`r.category_id = $${params.length}`); }
  if (q.block) { params.push(q.block); where.push(`r.block = $${params.length}`); }
  return { from, to, params, where: where.join(' AND ') };
}

router.get('/summary', wrap(async (req, res) => {
  const f = filters(req.query);
  const { rows: [k] } = await query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'Completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'Declined') AS declined,
            ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status='Completed'), 1) AS avg_resolution_hours,
            ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 3600) FILTER (WHERE assigned_at IS NOT NULL), 1) AS avg_assignment_hours,
            ROUND(AVG(rating), 1) AS avg_rating, COUNT(rating) AS rating_count
     FROM request r WHERE ${f.where}`, f.params);

  // previous period of equal length, for the "vs last period" comparison
  const days = Math.round((new Date(f.to) - new Date(f.from)) / 86400000) + 1;
  const prevTo = iso(new Date(new Date(f.from).getTime() - 86400000));
  const prevFrom = iso(new Date(new Date(f.from).getTime() - days * 86400000));
  const pf = filters({ ...req.query, from: prevFrom, to: prevTo });
  const { rows: [p] } = await query(
    `SELECT COUNT(*) AS total, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status='Completed'), 1) AS avg_resolution_hours
     FROM request r WHERE ${pf.where}`, pf.params);

  const { rows: byStatus } = await query(`SELECT status AS name, COUNT(*) AS count FROM request r WHERE ${f.where} GROUP BY status ORDER BY count DESC`, f.params);
  const { rows: byCategory } = await query(
    `SELECT c.category_name AS name, COUNT(*) AS count FROM request r JOIN category c USING (category_id) WHERE ${f.where} GROUP BY c.category_name ORDER BY count DESC, name`, f.params);
  const { rows: byBlock } = await query(`SELECT r.block AS name, COUNT(*) AS count FROM request r WHERE ${f.where} GROUP BY r.block ORDER BY count DESC, name`, f.params);
  const { rows: perDay } = await query(
    `SELECT to_char(date_trunc('week', r.created_at), 'YYYY-MM-DD') AS week, COUNT(*) AS count FROM request r WHERE ${f.where} GROUP BY 1 ORDER BY 1`, f.params);

  const nonDeclined = k.total - k.declined;
  res.json({
    range: { from: f.from, to: f.to },
    totals: {
      total: k.total, completed: k.completed, declined: k.declined,
      completion_rate: nonDeclined ? Math.round((k.completed / nonDeclined) * 100) : null,
      avg_resolution_hours: k.avg_resolution_hours, avg_assignment_hours: k.avg_assignment_hours,
      avg_rating: k.avg_rating, rating_count: k.rating_count,
    },
    previous: { total: p.total, avg_resolution_hours: p.avg_resolution_hours },
    by_status: byStatus, by_category: byCategory, by_block: byBlock,
    per_week: perDay.map((w, i) => ({ label: `W${i + 1}`, week: w.week, count: w.count })),
  });
}));

const fmtDate = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '');
const hoursBetween = (a, b) => (a && b ? Math.round(((new Date(b) - new Date(a)) / 3600000) * 10) / 10 : '');

// CSV export honours the same filters as the on-screen report (US-21)
router.get('/export', wrap(async (req, res) => {
  const f = filters(req.query);
  const type = ['requests', 'technicians', 'summary'].includes(req.query.type) ? req.query.type : 'requests';
  let csv;
  if (type === 'requests') {
    const { rows } = await query(
      `SELECT r.*, c.category_name, u.name AS requester_name, t.name AS technician_name
       FROM request r JOIN category c USING (category_id) JOIN requester u ON u.user_id = r.user_id
       LEFT JOIN technician t ON t.tech_id = r.tech_id WHERE ${f.where} ORDER BY r.created_at`, f.params);
    csv = toCsv([
      { header: 'Work order', value: (r) => requestCode(r.request_id) },
      { header: 'Title', value: (r) => r.title },
      { header: 'Category', value: (r) => r.category_name },
      { header: 'Block', value: (r) => r.block },
      { header: 'Room', value: (r) => r.room_no },
      { header: 'Urgency', value: (r) => r.urgency },
      { header: 'Status', value: (r) => r.status },
      { header: 'Requester', value: (r) => r.requester_name },
      { header: 'Technician', value: (r) => r.technician_name },
      { header: 'Submitted', value: (r) => fmtDate(r.created_at) },
      { header: 'Assigned', value: (r) => fmtDate(r.assigned_at) },
      { header: 'Completed', value: (r) => fmtDate(r.completed_at) },
      { header: 'Hours to assign', value: (r) => hoursBetween(r.created_at, r.assigned_at) },
      { header: 'Hours to resolve', value: (r) => hoursBetween(r.created_at, r.completed_at) },
      { header: 'Time spent (min)', value: (r) => r.time_spent_minutes },
      { header: 'Rating', value: (r) => r.rating },
    ], rows);
  } else if (type === 'technicians') {
    const { rows } = await query(
      `SELECT t.name, t.availability,
              COUNT(r.request_id) AS handled,
              COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
              ROUND(AVG(r.time_spent_minutes) FILTER (WHERE r.status = 'Completed'), 0) AS avg_minutes,
              ROUND(AVG(r.rating), 2) AS avg_rating
       FROM technician t LEFT JOIN request r ON r.tech_id = t.tech_id AND ${f.where}
       GROUP BY t.tech_id, t.name, t.availability ORDER BY t.name`, f.params);
    csv = toCsv([
      { header: 'Technician', value: (r) => r.name },
      { header: 'Availability', value: (r) => r.availability },
      { header: 'Requests handled', value: (r) => r.handled },
      { header: 'Completed', value: (r) => r.completed },
      { header: 'Avg time spent (min)', value: (r) => r.avg_minutes },
      { header: 'Avg rating', value: (r) => r.avg_rating },
    ], rows);
  } else {
    const { rows } = await query(
      `SELECT c.category_name AS category, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
              ROUND(AVG(EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) / 3600) FILTER (WHERE r.status='Completed'), 1) AS avg_hours
       FROM request r JOIN category c USING (category_id) WHERE ${f.where} GROUP BY c.category_name ORDER BY total DESC`, f.params);
    csv = toCsv([
      { header: 'Category', value: (r) => r.category },
      { header: 'Requests', value: (r) => r.total },
      { header: 'Completed', value: (r) => r.completed },
      { header: 'Avg hours to resolve', value: (r) => r.avg_hours },
    ], rows);
  }
  await audit(null, req.user, 'REPORT_EXPORT', 'report', null, `${type} ${f.from}..${f.to}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cmms-${type}-${f.from}_${f.to}.csv"`);
  res.send(csv);
}));

module.exports = router;
