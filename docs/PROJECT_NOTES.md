# Project notes — how this build maps to your documents

This file exists so your group can explain, in the final report, exactly what was
built and where it came from. It cross-references the three documents you supplied
(Project Proposal, Product Backlog, Physical Database Design) against this codebase.

## User story coverage (Product Backlog)

| Story | Covered by | Notes |
|---|---|---|
| US-01 Student/Staff registration | `POST /api/auth/register`, `client/src/pages/Register.jsx` | Passwords hashed with bcrypt; duplicate email/college ID returns 409 |
| US-02 User login | `POST /api/auth/login`, `client/src/pages/Login.jsx` | Same error message for wrong password / unknown account / wrong role tab, as specified |
| US-03 Role-based route protection | `server/src/middleware/auth.js` (`requireRole`), `client/src/App.jsx` (`Protected`) | Backend returns 403; frontend redirects to `/` |
| US-04 Session persistence and logout | `AuthContext.jsx`, JWT in `localStorage`, "Keep me signed in" → 7‑day vs 12‑hour token | |
| US-05 Submit a maintenance complaint | `POST /api/requests`, `NewRequest.jsx` | |
| US-06 Attach a photo to a complaint | `multer` + `services/storage.js` (Cloudinary if configured, else local `uploads/`) | |
| US-07 Client + server validation | `zod` schemas in every route; inline field errors in forms | |
| US-08 View complaint history | `MyRequests.jsx` | |
| US-09 Track status of a complaint | `RequestDetail.jsx` timeline, backed by `request_status_history` | |
| US-10 View estimated resolution timeline | `present()` in `services/requests.js` computes `estimated_resolution` from the SLA hours in Settings | |
| US-11 View unassigned complaints | `GET /api/requests?scope=pool` (technician), admin Requests page filter | |
| US-12 Filter by category/location/priority | Query params on `GET /api/requests`; filter bar in `admin/Requests.jsx` | |
| US-13 Self-assign / accept a complaint | `POST /api/requests/:id/claim` — atomic `UPDATE ... WHERE status='Pending' AND tech_id IS NULL`, so two technicians can't claim the same request (see the race-condition test in `tests/lifecycle.test.js`) | |
| US-14 Update status through lifecycle | `canMove()` in `services/requests.js` enforces Pending → Assigned → In Progress → Completed | |
| US-15 Log resolution notes and time spent | `POST /api/requests/:id/complete` | |
| US-16 Manage user accounts | `admin/Users.jsx`, `GET/PATCH /api/users` | |
| US-17 Manage complaint categories | `admin/Settings.jsx` (Categories tab), `/api/categories` | |
| US-18 Allocate/rebalance technician workload | Assign/Reassign in `RequestDetail.jsx` and `admin/Requests.jsx`; `admin/Technicians.jsx` shows active-order counts | |
| US-19 Configure system-wide settings | `admin/Settings.jsx` (Notifications tab: SLA hours per urgency, channel toggles) | |
| US-20 View complaint summary reports | `admin/Reports.jsx`, `GET /api/reports/summary` | |
| US-21 Export reports to CSV | `GET /api/reports/export` (requests / technicians / category summary) | |
| US-22 Track response-time metrics | SLA compliance % in Settings; avg assignment/resolution hours in Reports | |
| US-23 Email on submission | `services/notify.js` → requester + all admins on `POST /api/requests` | |
| US-24 Email + in-app on assignment/status change | Every status-changing route calls `notify()`; failures are caught so they never block the action | |
| US-25 Log status changes and admin actions | `request_status_history` (status only) + `audit_log` (everything else) | |
| US-26 View the audit log | `admin/Audit.jsx`, `GET /api/audit` (read-only — no update/delete route exists) | |
| US-27 Database schema | `server/migrations/001_init.sql` (see below) | |
| US-28 CI/CD pipeline | `.github/workflows/ci.yml` — runs the Jest suite against a Postgres service container on every push/PR | |
| US-29 Responsive layout | Tailwind on Landing/Login/Register; `styles/cm.css` (scoped under `.cm`) after sign-in. The top bar wraps and tables scroll sideways on narrow screens | |
| US-30 Deploy to Render | `server/src/app.js` serves `client/dist/` directly, so one Node service can host both — see the README's "Building for production" section | You'll still need to actually create the Render service and connect a Postgres instance; that step can't be done from inside this codebase |

## Database: physical design vs. what's implemented

`server/migrations/001_init.sql` follows the entities and relationships in your ER
diagram and Physical Database Design document (Requester, Admin, Technician,
Category, Request, Notification, and the Submits / Assigns / Handles / Has /
Qualified_For / Oversees / Generates relationships). Every column that document
didn't specify but the app needs is marked `-- [+]` inline, so a reviewer can see at a
glance what was added and why. In summary, the additions are:

- **Authentication**: `password_hash` on all three account tables, `college_id` on
  `requester` (so students can log in with either their college ID or email, matching
  the login mockup)
- **Timestamps per lifecycle stage**: `assigned_at`, `started_at`, `completed_at` on
  `request` — needed for US-10 (estimated resolution) and US-22 (response-time metrics)
- **Resolution details**: `resolution_notes`, `time_spent_minutes`,
  `completion_photo_url`, `decline_reason` on `request` — needed for US-15
- **Feedback**: `rating`, `feedback_comment` on `request` — this is the feedback
  system your group added to scope after the estate-manager consultation (proposal
  §3.3.1 / §3.5)
- **`request_status_history`** — a full timestamped trail of every status transition,
  separate from the general audit log, so the timeline UI (US-09) doesn't have to be
  reconstructed from the audit log's free-text `details` column
- **`audit_log`** and **`system_setting`** tables — for US-25/26 and US-19, which the
  ER diagram doesn't have dedicated entities for
- **`block`** table — the Settings mockup's "Registered Blocks & Rooms" list needs
  somewhere to live; `request.block` stores the block name as a plain string (matching
  the ER diagram), and this table is what populates the dropdown and validates it
  server-side

## Known simplifications

- **Technician reassignment** overwrites the previous technician rather than keeping
  a full assignment history table — the status history log still records *that* a
  reassignment happened and who did it, just not a separate "assignment log" entity.
- **SLA compliance** (Settings → Notifications tab) is computed as "assigned within
  the target hours for that urgency", not resolved — this seemed like the more useful
  metric for an admin trying to catch requests stuck in the pool, but it's easy to
  change to resolution-time-based in `routes/settings.js` (`withCompliance`) if your
  team prefers.
- No native mobile app, SIS integration, QR codes, billing, or inventory (out of scope per
  proposal §3.3.2). SMS notifications were dropped; email (needs SMTP) and in-app remain.

## Merged version: Main / Volunteer model (migration `002_volunteer_system.sql`)

Additions on top of the physical design, all additive:

- `technician`: `tier` (Main|Volunteer), `gender`, `duty_override`, `weekly_cap`
- `block.is_hostel`; new `building` table (per block, with `gender`)
- `request`: `building_id`, `escalated`, `queue_reason`, `reopen_count`, `reopened_at`
- new `escalation` table (from/to technician, reason, note)
- `requester`: `suspended_reason`, `suspended_at` (separate from `is_active`)
- `audit_log` made append-only by a DB trigger
- `notification.request_id` nullable

Routing rules (`server/src/services/routing.js`): hostel requests go to gender-matched
Volunteers; everything else (and escalated jobs) to Main technicians with a matching
specialization. Only on-duty technicians qualify; Volunteers must be under their weekly cap.
Ties go to specialists, then fewest open jobs. Unmatched requests stay Pending with a
`queue_reason`, retried every 60s and after relevant changes. Technicians can self-claim
queued jobs only if they would have been eligible for auto-assignment.

Admin triage: admins are notified only when a request is queued (nobody eligible), not for
routine auto-assigned jobs.
