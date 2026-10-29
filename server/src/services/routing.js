// Job allocation. Two modes, chosen by the admin in Settings (system_setting.assignment_mode):
//
//   'pick' (default, Sprint 6) — every request is visible to every technician; nothing is assigned
//          automatically. A technician claims the job they want (see claimCheck below).
//   'auto' — the original behaviour: a hostel request goes to a gender-matched on-duty Volunteer,
//          anything else (or an escalated job) to an on-duty Main technician with the right specialisation.
//
// In BOTH modes a technician may only claim while on duty (their tier's working hours — see duty.js).
//
// IMPORTANT: notifications are sent AFTER a transaction commits, never inside it — a notification INSERT
// on another pooled connection can deadlock against a FOR UPDATE row lock held by the transaction.
const { query, tx } = require('../db');
const { isOnDuty } = require('./duty');
const { logStatus } = require('./requests');
const { requestAssigned } = require('./notifyFlow');
const { getSettings } = require('./settings');

const WEEK_MS = 7 * 24 * 3600 * 1000;
const PICK_REASON = 'Open for any on-duty technician to pick up';

/* ------------------------------------------------------------------ auto mode helpers */
async function candidatePool(client, request) {
  const isHostelJob = request.building_gender && !request.escalated;
  const counts = `(SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.assigned_at >= $2) AS week_count,
                  (SELECT COUNT(*) FROM request r WHERE r.tech_id = t.tech_id AND r.status IN ('Assigned','In Progress')) AS open_count`;
  if (isHostelJob) {
    const { rows } = await client.query(
      `SELECT t.*, ${counts},
              EXISTS (SELECT 1 FROM technician_category tc WHERE tc.tech_id = t.tech_id AND tc.category_id = $3) AS specialised
       FROM technician t WHERE t.is_active AND t.tier = 'Volunteer' AND t.gender = $1`,
      [request.building_gender, new Date(Date.now() - WEEK_MS), request.category_id]);
    return rows;
  }
  const { rows } = await client.query(
    `SELECT t.*, ${counts}, TRUE AS specialised
     FROM technician t JOIN technician_category tc ON tc.tech_id = t.tech_id AND tc.category_id = $1
     WHERE t.is_active AND t.tier = 'Main'`,
    [request.category_id, new Date(Date.now() - WEEK_MS)]);
  return rows;
}

/** Attempts to auto-assign one request. Returns true if assigned. In 'pick' mode it never assigns. */
async function routeRequest(requestId, actor = { role: 'system', id: null, name: 'Auto-router' }) {
  const { assignment_mode } = await getSettings();
  if (assignment_mode === 'pick') {
    await query(`UPDATE request SET queue_reason = $2 WHERE request_id = $1 AND status = 'Pending' AND tech_id IS NULL`, [requestId, PICK_REASON]);
    return false;
  }

  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `SELECT r.*, b.gender AS building_gender FROM request r LEFT JOIN building b ON b.building_id = r.building_id
       WHERE r.request_id = $1 FOR UPDATE OF r`, [requestId]);
    const request = rows[0];
    if (!request || request.tech_id || request.status !== 'Pending') return { assigned: false };

    const pool = await candidatePool(client, request);
    const onDuty = pool.filter((t) => isOnDuty(t));
    const eligible = onDuty.filter((t) => t.tier !== 'Volunteer' || Number(t.week_count) < t.weekly_cap);
    if (!eligible.length) {
      const reason = !pool.length ? 'No matching technician is registered for this category/location yet'
        : !onDuty.length ? 'Waiting for the next on-duty window' : 'All matching volunteers have reached their weekly job cap';
      await client.query('UPDATE request SET queue_reason = $2 WHERE request_id = $1', [requestId, reason]);
      return { assigned: false };
    }
    eligible.sort((a, b) => Number(b.specialised) - Number(a.specialised) || a.open_count - b.open_count);
    const tech = eligible[0];
    await client.query(`UPDATE request SET tech_id=$2, status='Assigned', assigned_at=NOW(), queue_reason=NULL WHERE request_id=$1`, [requestId, tech.tech_id]);
    await logStatus(client, requestId, 'Pending', 'Assigned', actor, `Auto-assigned to ${tech.name}`);
    await client.query(`UPDATE escalation SET to_tech_id = $2 WHERE request_id = $1 AND to_tech_id IS NULL`, [requestId, tech.tech_id]);
    return { assigned: true, request, tech };
  });

  if (result.assigned) await requestAssigned({ request: result.request, tech: result.tech, how: 'auto' });
  return result.assigned;
}

/** Retries every unassigned Pending request (auto mode only). Runs on a timer and after changes that may free a match. */
async function processQueue() {
  const { assignment_mode } = await getSettings();
  if (assignment_mode === 'pick') return;
  const { rows } = await query(`SELECT request_id FROM request WHERE status = 'Pending' AND tech_id IS NULL ORDER BY request_id`);
  for (const r of rows) {
    try { await routeRequest(r.request_id); } catch (err) { console.error(`processQueue: request ${r.request_id}:`, err.message); }
  }
}

/* ------------------------------------------------------------------ claiming (both modes) */
/**
 * May this technician pick up this request right now? Returns { ok, reason }.
 * Rules (Sprint 6, "pick" design):
 *   • the request must still be Pending and unassigned
 *   • the technician must be active and ON DUTY (their tier's working hours, or a manual override)
 *   • Volunteers: weekly job cap applies; they cannot take escalated jobs (Main-only);
 *     and for a hostel job the building's gender must match theirs
 *   • Main technicians: no specialisation or location restriction — they may pick anything
 */
function evaluateClaim(t, r) {
  if (!t || !t.is_active) return { ok: false, reason: 'Account inactive' };
  if (r.status !== 'Pending' || r.tech_id) return { ok: false, reason: 'Already taken or no longer open' };
  if (!isOnDuty(t)) return { ok: false, reason: t.tier === 'Volunteer' ? 'Outside volunteer hours (7 PM – 9 PM) — you are off duty' : 'Outside working hours (8 AM – 5 PM) — you are off duty' };
  if (t.tier === 'Volunteer') {
    if (r.escalated) return { ok: false, reason: 'Escalated jobs are for Main technicians' };
    if (Number(t.week_count) >= t.weekly_cap) return { ok: false, reason: `Weekly cap of ${t.weekly_cap} jobs reached` };
    if (r.building_gender && t.gender !== r.building_gender) return { ok: false, reason: `This is a ${r.building_gender === 'F' ? "girls'" : "boys'"} hostel — reserved for ${r.building_gender === 'F' ? 'female' : 'male'} volunteers` };
  }
  return { ok: true, reason: null };
}

/** Technician row + how many jobs they were assigned in the last 7 days. */
async function loadClaimant(db, techId) {
  const run = (sql, p) => (db.query ? db.query(sql, p) : query(sql, p));
  const { rows } = await run(
    `SELECT t.*, (SELECT COUNT(*) FROM request x WHERE x.tech_id = t.tech_id AND x.assigned_at >= $2) AS week_count FROM technician t WHERE t.tech_id = $1`,
    [techId, new Date(Date.now() - WEEK_MS)]);
  return rows[0];
}

async function claimCheck(db, techId, requestId) {
  const run = (sql, p) => (db.query ? db.query(sql, p) : query(sql, p));
  const { rows } = await run(
    `SELECT r.*, b.gender AS building_gender FROM request r LEFT JOIN building b ON b.building_id = r.building_id WHERE r.request_id = $1`, [requestId]);
  if (!rows[0]) return { ok: false, reason: 'Request not found' };
  return evaluateClaim(await loadClaimant(db, techId), rows[0]);
}
const canClaim = async (db, techId, requestId) => (await claimCheck(db, techId, requestId)).ok;

module.exports = { routeRequest, processQueue, canClaim, claimCheck, evaluateClaim, loadClaimant, PICK_REASON };
