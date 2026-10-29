// The notification workflow (Sprint 6, spec item 7). ONE place decides who hears about what:
//
//   Student / Teacher / Staff : (1) request submitted   (2) work completed
//   Technician / Volunteer    : (1) job accepted (they picked it)   (2) job assigned (admin / auto)
//   Admin                     : (1) new request uploaded  (2) request assigned  (3) work completed
//
// Plus three operational notices that would otherwise leave people in the dark and are
// sent from their own routes: request declined, account suspended/reinstated, job taken away by reassignment.
//
// Each function: (a) is called AFTER the database transaction has committed, and (b) can never throw —
// notify() swallows its own errors, so a mail/DB hiccup can never fail the user's action.
const { notify, notifyAdmins } = require('./notify');
const { requestCode } = require('../utils/http');

const where = (r) => `${r.block}${r.room_no ? ` · ${r.room_no}` : ''}`;

/** A requester just uploaded a request. */
async function requestSubmitted(request, requesterName) {
  const code = requestCode(request.request_id);
  await notify({ role: 'requester', id: request.user_id, requestId: request.request_id, type: 'Request',
    title: 'Request submitted', message: `${code} "${request.title}" (${where(request)}) was submitted successfully.` });
  await notifyAdmins(request.request_id, 'New request uploaded', `${requesterName || 'A requester'} submitted ${code} "${request.title}" (${where(request)}, ${request.urgency} priority).`, 'Request');
}

/** A request got a technician. how: 'self' (they picked it) | 'admin' (manual) | 'auto' (system) */
async function requestAssigned({ request, tech, how }) {
  const code = requestCode(request.request_id);
  const self = how === 'self';
  await notify({ role: 'technician', id: tech.tech_id, requestId: request.request_id, type: 'Request',
    title: self ? 'Job accepted' : 'New work order assigned',
    message: self ? `You accepted ${code} "${request.title}" (${where(request)}).` : `${code} "${request.title}" (${where(request)}) has been assigned to you.` });
  await notifyAdmins(request.request_id, 'Request assigned',
    `${code} "${request.title}" ${self ? 'was picked up by' : how === 'admin' ? 'was assigned to' : 'was auto-assigned to'} ${tech.name}.`, 'Update');
}

/** The technician marked the work done. */
async function requestCompleted({ request, techName }) {
  const code = requestCode(request.request_id);
  await notify({ role: 'requester', id: request.user_id, requestId: request.request_id, type: 'Completed',
    title: 'Work completed', message: `${code} "${request.title}" has been completed. Please rate the resolution.` });
  await notifyAdmins(request.request_id, 'Work completed', `${techName} completed ${code} "${request.title}" (${where(request)}).`, 'Completed');
}

module.exports = { requestSubmitted, requestAssigned, requestCompleted };
