const { query } = require('../db');
const { requestCode } = require('../utils/http');

/** Base SELECT: a request with its category, building, requester and technician details. */
const BASE_SELECT = `
  SELECT r.*, c.category_name,
         u.name AS requester_name, u.email AS requester_email, u.role AS requester_role,
         u.suspended_reason AS requester_suspended_reason,
         t.name AS technician_name, t.tier AS technician_tier,
         a.name AS admin_name,
         bl.block_id AS block_row_id, bl.is_hostel,
         bd.name AS building_name, bd.gender AS building_gender
  FROM request r
  JOIN category c   ON c.category_id = r.category_id
  JOIN requester u  ON u.user_id = r.user_id
  LEFT JOIN technician t ON t.tech_id = r.tech_id
  LEFT JOIN admin a      ON a.admin_id = r.admin_id
  LEFT JOIN building bd  ON bd.building_id = r.building_id
  LEFT JOIN block bl     ON bl.block_id = bd.block_id`;

/** Shape a DB row for the API. `sla` = { High: hours, ... } enables the estimated resolution time. */
function present(r, sla) {
  let estimated = null;
  if (r.assigned_at && sla && r.status !== 'Completed' && r.status !== 'Declined') {
    estimated = new Date(new Date(r.created_at).getTime() + (sla[r.urgency] || 72) * 3600 * 1000).toISOString();
  }
  return {
    id: r.request_id,
    code: requestCode(r.request_id),
    title: r.title,
    description: r.description,
    block: r.block,
    building: r.building_name ? { id: r.building_id, name: r.building_name, gender: r.building_gender } : null,
    is_hostel: !!r.is_hostel,
    room_no: r.room_no,
    location: r.building_name ? `${r.block} · ${r.building_name} · ${r.room_no}` : `${r.block} · ${r.room_no}`,
    urgency: r.urgency,
    status: r.status,
    escalated: r.escalated,
    queue_reason: r.status === 'Pending' ? r.queue_reason : null,
    reopen_count: r.reopen_count,
    reopened_at: r.reopened_at,
    category_id: r.category_id,
    category_name: r.category_name,
    requester: { id: r.user_id, name: r.requester_name, role: r.requester_role, suspended: !!r.requester_suspended_reason },
    technician: r.tech_id ? { id: r.tech_id, name: r.technician_name, tier: r.technician_tier } : null,
    assigned_by: r.admin_id ? { id: r.admin_id, name: r.admin_name } : null,
    photo_url: r.photo_url,
    created_at: r.created_at,
    assigned_at: r.assigned_at,
    started_at: r.started_at,
    completed_at: r.completed_at,
    resolution_notes: r.resolution_notes,
    time_spent_minutes: r.time_spent_minutes,
    completion_photo_url: r.completion_photo_url,
    decline_reason: r.decline_reason,
    rating: r.rating,
    feedback_comment: r.feedback_comment,
    estimated_resolution: estimated,
  };
}

async function getRow(id, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`${BASE_SELECT} WHERE r.request_id = $1`, [id]);
  return rows[0] || null;
}

async function logStatus(client, requestId, oldStatus, newStatus, actor, note) {
  await client.query(
    `INSERT INTO request_status_history
       (request_id, old_status, new_status, changed_by_role, changed_by_id, changed_by_name, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [requestId, oldStatus, newStatus, actor.role, actor.id, actor.name, note || null]
  );
}

// Allowed lifecycle (US-14): Pending -> Assigned -> In Progress -> Completed. Declined only
// from Pending/Assigned. A Volunteer's escalation sends Assigned/In Progress back to Pending
// (handled directly in the escalate route, not via canMove, since it also clears tech_id and
// flips `escalated`). Completed -> Assigned is the reopen path.
const TRANSITIONS = {
  Pending: ['Assigned', 'Declined'],
  Assigned: ['In Progress', 'Declined'],
  'In Progress': ['Completed'],
  Completed: ['Assigned'],
  Declined: [],
};
const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);

module.exports = { BASE_SELECT, present, getRow, logStatus, canMove, TRANSITIONS };
