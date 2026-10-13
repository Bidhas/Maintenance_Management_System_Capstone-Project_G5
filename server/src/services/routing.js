// Auto-routing: a hostel request goes to a gender-matched Volunteer Technician; any
// other request (or one that's been escalated) goes to a Main Technician with a
// matching specialization. Only on-duty technicians are considered, and Volunteers
// are additionally bound by their weekly job cap. A request that can't be matched
// right now stays Pending with a human-readable queue_reason, and is retried
// automatically every minute and whenever something changes that might free up a
// match (a technician goes on duty, a cap frees up, a new technician is added, ...).
const { query, tx } = require('../db');
const { isOnDuty } = require('./duty');
const { logStatus } = require('./requests');
const { notify } = require('./notify');
const { requestCode } = require('../utils/http');

const WEEK_MS = 7 * 24 * 3600 * 1000;

async function candidatePool(client, request) {
  const isHostelJob = request.building_gender && !request.escalated;
  if (isHostelJob) {
    const { rows } = await client.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.assigned_at >= $2) AS week_count,
              (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.status IN ('Assigned','In Progress')) AS open_count,
              EXISTS (SELECT 1 FROM technician_category tc WHERE tc.tech_id = t.tech_id AND tc.category_id = $3) AS specialised
       FROM technician t
       WHERE t.is_active AND t.tier = 'Volunteer' AND t.gender = $1`,
      [request.building_gender, new Date(Date.now() - WEEK_MS), request.category_id]
    );
    return rows;
  }
  const { rows } = await client.query(
    `SELECT t.*,
            (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.assigned_at >= $2) AS week_count,
            (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.status IN ('Assigned','In Progress')) AS open_count,
            TRUE AS specialised
     FROM technician t
     JOIN technician_category tc ON tc.tech_id = t.tech_id AND tc.category_id = $1
     WHERE t.is_active AND t.tier = 'Main'`,
    [request.category_id, new Date(Date.now() - WEEK_MS)]
  );
  return rows;
}

/** Attempts to assign one request. Returns true if it found a technician, false if it stayed queued.
 * IMPORTANT: notifications are sent after the transaction commits, not inside it — a notification
 * INSERT references request_id via a foreign key, and issuing that INSERT on a *different* pooled
 * connection while this transaction still holds a FOR UPDATE lock on that same row causes the two
 * connections to wait on each other indefinitely. */
async function routeRequest(requestId, actor = { role: 'system', id: null, name: 'Auto-router' }) {
  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `SELECT r.*, b.gender AS building_gender
       FROM request r LEFT JOIN building b ON b.building_id = r.building_id
       WHERE r.request_id = $1 FOR UPDATE OF r`,
      [requestId]
    );
    const request = rows[0];
    if (!request || request.tech_id || !['Pending'].includes(request.status)) return { assigned: false };

    const pool = await candidatePool(client, request);
    const onDuty = pool.filter((t) => isOnDuty(t));
    const eligible = onDuty.filter((t) => t.tier !== 'Volunteer' || Number(t.week_count) < t.weekly_cap);

    if (!eligible.length) {
      const reason = !pool.length
        ? 'No matching technician is registered for this category/location yet'
        : !onDuty.length
          ? 'Waiting for the next on-duty window'
          : 'All matching volunteers have reached their weekly job cap';
      await client.query('UPDATE request SET queue_reason = $2 WHERE request_id = $1', [requestId, reason]);
      return { assigned: false };
    }

    eligible.sort((a, b) => Number(b.specialised) - Number(a.specialised) || a.open_count - b.open_count);
    const tech = eligible[0];

    await client.query(
      `UPDATE request SET tech_id = $2, status = 'Assigned', assigned_at = NOW(), queue_reason = NULL WHERE request_id = $1`,
      [requestId, tech.tech_id]
    );
    await logStatus(client, requestId, 'Pending', 'Assigned', actor, `Auto-assigned to ${tech.name}`);
    await client.query(
      `UPDATE escalation SET to_tech_id = $2 WHERE request_id = $1 AND to_tech_id IS NULL`,
      [requestId, tech.tech_id]
    );

    return { assigned: true, request, tech };
  });

  if (result.assigned) {
    const code = requestCode(requestId);
    const { request, tech } = result;
    await notify({ role: 'requester', id: request.user_id, requestId, type: 'Request', title: 'Request assigned', message: `${code} has been assigned to ${tech.name}.` });
    await notify({ role: 'technician', id: tech.tech_id, requestId, type: 'Request', title: 'New work order assigned', message: `${code}: ${request.title}${request.escalated ? ' (escalated)' : ''}` });
  }
  return result.assigned;
}

/** Re-tries every Pending, unassigned request. Called on a timer and after anything that might open up a match. */
async function processQueue() {
  const { rows } = await query(`SELECT request_id FROM request WHERE status = 'Pending' AND tech_id IS NULL ORDER BY request_id`);
  for (const r of rows) {
    try { await routeRequest(r.request_id); } catch (err) { console.error(`processQueue: request ${r.request_id}:`, err.message); }
  }
}

/** May this technician pick up this still-unassigned request themselves? Same rules as auto-routing:
 * right tier/gender/specialization, currently on duty, and (Volunteers) under their weekly cap. */
async function canClaim(clientOrQuery, techId, requestId) {
  const run = (sql, p) => (clientOrQuery.query ? clientOrQuery.query(sql, p) : query(sql, p));
  const { rows } = await run(
    `SELECT r.*, b.gender AS building_gender FROM request r LEFT JOIN building b ON b.building_id = r.building_id WHERE r.request_id = $1`,
    [requestId]
  );
  if (!rows[0]) return false;
  const pool = await candidatePool({ query: run }, rows[0]);
  const me = pool.find((t) => t.tech_id === techId);
  return !!me && isOnDuty(me) && (me.tier !== 'Volunteer' || Number(me.week_count) < me.weekly_cap);
}

module.exports = { routeRequest, processQueue, canClaim };
