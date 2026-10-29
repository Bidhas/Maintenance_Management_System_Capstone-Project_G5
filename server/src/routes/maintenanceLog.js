// Maintenance Log (replaces the old "Audit log" screen — Sprint 6, spec item 4).
// Instead of "who changed what in the web app" it answers maintenance questions:
//   • what work was COMPLETED, where, how many times per room, and by which technician
//   • which equipment was used
//   • which accounts were suspended / reinstated
// It is READ-ONLY and built from the real tables (request, audit_log). The raw audit_log table is still
// written to behind the scenes (append-only) — see /api/audit — it just isn't the main screen any more.
const router = require('express').Router();
const { query } = require('../db');
const { wrap, requestCode } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

router.get('/', wrap(async (req, res) => {
  const { from, to, block, tech_id } = req.query;
  const where = [`r.status = 'Completed'`];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (from) add('r.completed_at >= ?::date', from);
  if (to) add('r.completed_at < (?::date + 1)', to);
  if (block) add('r.block = ?', block);
  if (tech_id) add('r.tech_id = ?', parseInt(tech_id, 10) || 0);
  const w = where.join(' AND ');

  // 1) every completed job (newest first)
  const { rows: jobs } = await query(
    `SELECT r.request_id, r.title, r.block, bd.name AS floor, r.room_no, c.category_name, r.completed_at,
            r.time_spent_minutes, r.equipment_used, r.resolution_notes, t.tech_id, t.name AS tech_name, t.tier
     FROM request r JOIN category c USING (category_id)
     LEFT JOIN building bd ON bd.building_id = r.building_id
     LEFT JOIN technician t ON t.tech_id = r.tech_id
     WHERE ${w} ORDER BY r.completed_at DESC LIMIT 1000`, params);

  // 2) amount of maintenance per room
  const { rows: byRoom } = await query(
    `SELECT r.block, bd.name AS floor, r.room_no, COUNT(*) AS jobs, COALESCE(SUM(r.time_spent_minutes),0) AS minutes,
            MAX(r.completed_at) AS last_completed
     FROM request r LEFT JOIN building bd ON bd.building_id = r.building_id
     WHERE ${w} GROUP BY r.block, bd.name, r.room_no ORDER BY jobs DESC, r.block, r.room_no LIMIT 500`, params);

  // 3) which technicians completed how much
  const { rows: byTech } = await query(
    `SELECT t.tech_id, t.name, t.tier, COUNT(*) AS jobs, COALESCE(SUM(r.time_spent_minutes),0) AS minutes
     FROM request r JOIN technician t ON t.tech_id = r.tech_id WHERE ${w} GROUP BY t.tech_id, t.name, t.tier ORDER BY jobs DESC, t.name`, params);

  // 4) equipment: the field is free text ("drill, ladder"); split on commas/newlines and count each item
  const counts = new Map();
  for (const j of jobs) {
    for (const raw of String(j.equipment_used || '').split(/[,\n;]+/)) {
      const item = raw.trim();
      if (!item || /^(none|nil|n\/a|-)$/i.test(item)) continue;
      const key = item.toLowerCase();
      counts.set(key, { item: counts.get(key)?.item || item, uses: (counts.get(key)?.uses || 0) + 1 });
    }
  }
  const equipment = [...counts.values()].sort((a, b) => b.uses - a.uses || a.item.localeCompare(b.item)).slice(0, 200);

  // 5) suspensions: the history (from the append-only audit trail) + who is suspended right now
  const { rows: history } = await query(
    `SELECT log_id AS id, action, actor_name, entity_id, details, created_at FROM audit_log
     WHERE action IN ('USER_SUSPEND','USER_REINSTATE') ORDER BY created_at DESC, log_id DESC LIMIT 200`);
  const { rows: current } = await query(
    `SELECT user_id AS id, name, email, role AS account_type, suspended_reason, suspended_at FROM requester WHERE suspended_reason IS NOT NULL ORDER BY suspended_at DESC`);
  const { rows: names } = await query(`SELECT user_id, name FROM requester WHERE user_id = ANY($1::int[])`, [history.map((h) => h.entity_id).filter(Boolean)]);
  const nameOf = new Map(names.map((n) => [n.user_id, n.name]));

  const { rows: blocks } = await query('SELECT block_name FROM block ORDER BY block_name');
  const { rows: techs } = await query('SELECT tech_id AS id, name FROM technician ORDER BY name');

  res.json({
    summary: {
      completed: jobs.length,
      minutes: jobs.reduce((n, j) => n + (j.time_spent_minutes || 0), 0),
      rooms: byRoom.length,
      technicians: byTech.length,
      suspended_now: current.length,
    },
    jobs: jobs.map((j) => ({ ...j, code: requestCode(j.request_id) })),
    by_room: byRoom, by_technician: byTech, equipment,
    suspensions: { current, history: history.map((h) => ({ ...h, user_name: nameOf.get(h.entity_id) || `#${h.entity_id}` })) },
    filters: { blocks: blocks.map((b) => b.block_name), technicians: techs },
  });
}));

module.exports = router;
