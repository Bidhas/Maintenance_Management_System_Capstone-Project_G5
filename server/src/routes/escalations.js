const router = require('express').Router();
const { query } = require('../db');
const { wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT e.escalation_id AS id, e.request_id, e.reason, e.note, e.created_at,
           f.name AS from_name, t.name AS to_name,
           r.title, r.status, r.block, r.room_no
    FROM escalation e
    JOIN request r ON r.request_id = e.request_id
    LEFT JOIN technician f ON f.tech_id = e.from_tech_id
    LEFT JOIN technician t ON t.tech_id = e.to_tech_id
    ORDER BY e.created_at DESC LIMIT 200`);
  res.json({ escalations: rows.map((r) => ({ ...r, code: requestCode(r.request_id) })) });
}));

module.exports = router;
