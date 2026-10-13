const router = require('express').Router();
const { query } = require('../db');
const { wrap } = require('../utils/http');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', wrap(async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const { rows } = await query(
    `SELECT notif_id AS id, request_id, title, message, type, is_read, timestamp
     FROM notification WHERE recipient_role=$1 AND recipient_id=$2 ${unreadOnly ? 'AND NOT is_read' : ''}
     ORDER BY timestamp DESC, notif_id DESC LIMIT 100`, [req.user.role, req.user.id]);
  const { rows: c } = await query(
    'SELECT COUNT(*) AS n FROM notification WHERE recipient_role=$1 AND recipient_id=$2 AND NOT is_read', [req.user.role, req.user.id]);
  res.json({ notifications: rows, unread: c[0].n });
}));

router.get('/unread-count', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT COUNT(*) AS n FROM notification WHERE recipient_role=$1 AND recipient_id=$2 AND NOT is_read', [req.user.role, req.user.id]);
  res.json({ unread: rows[0].n });
}));

router.post('/read-all', wrap(async (req, res) => {
  await query('UPDATE notification SET is_read=TRUE WHERE recipient_role=$1 AND recipient_id=$2 AND NOT is_read', [req.user.role, req.user.id]);
  res.json({ ok: true });
}));

router.post('/:id(\\d+)/read', wrap(async (req, res) => {
  await query('UPDATE notification SET is_read=TRUE WHERE notif_id=$1 AND recipient_role=$2 AND recipient_id=$3', [req.params.id, req.user.role, req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
