# CMMS

A web-based College Maintenance Management System (CMMS) built on the PERN stack
(PostgreSQL, Express, React, Node), for IDE201 Group 5's capstone project.

Students/staff submit maintenance requests → admins assign technicians → technicians
resolve and close them out, with notifications, an audit trail, and reporting at every
stage. See `docs/PROJECT_NOTES.md` for how this build maps back to your proposal,
backlog and database design documents.

## Project structure

```
campuscare/
├── server/          Express REST API + PostgreSQL
│   ├── migrations/   SQL schema
│   ├── scripts/      migrate / seed / reset
│   ├── src/
│   │   ├── routes/       one file per resource (auth, requests, technicians, ...)
│   │   ├── middleware/   auth (JWT), validation, file upload, error handling
│   │   ├── services/     notifications, audit log, image storage, settings
│   │   └── utils/
│   └── tests/        Jest + Supertest integration tests
├── client/          React (Vite) + Tailwind CSS
│   └── src/
│       ├── pages/        student/, technician/, admin/ + shared pages
│       ├── components/   Shell (top bar), request table + panel, dialogs, cards, notification bell
│       ├── styles/       cm.css - the look of every screen after sign-in (Landing/Login/Register use index.css)
│       ├── hooks/        useAsync, usePolling, useDebounced
│       ├── context/      auth + toast
│       └── lib/          API client, formatting helpers
└── docs/            Notes on design decisions
```

## Prerequisites

- **Node.js 18+** (tested on Node 22) and npm
- **PostgreSQL 14+** running locally (or a connection string to a hosted instance)

## 1. Install dependencies

From the `campuscare` folder:

```bash
npm run install:all
```

This installs both `server/` and `client/` dependencies. (You can also `cd server && npm install`
and `cd client && npm install` separately if you prefer.)

## 2. Configure the server

```bash
cd server
cp .env.example .env
```

Open `.env` and set `DATABASE_URL` to your local Postgres connection string, e.g.:

```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/cmms
```

Create the database first if it doesn't exist:

```bash
psql -U postgres -c "CREATE DATABASE cmms;"
```

Everything else in `.env.example` has a sensible default for local development — you
only need to add real values for `SMTP_*` (email) or `CLOUDINARY_URL` (photo hosting)
if you want those working; otherwise emails are just logged to the console and photos
are saved to `server/uploads/`.

## 3. Set up the database

From the `campuscare` root:

```bash
npm run db:setup
```

This runs the migration (creates all tables) and seeds demo data: an admin, three
technicians, two students, and a handful of sample work orders matching the Figma
mockups. Printed to the console are the demo logins:

| Role                      | Identifier                    | Password      |
|---------------------------|-------------------------------|---------------|
| Admin                     | admin@cmms.local              | Admin@123     |
| Main technician           | p.wangmo@cmms.local (also s.dorji@) | Tech@123 |
| Volunteer technician      | pema.c@cmms.local (also k.namgay@, tenzin.n@) | Volunteer@123 |
| Student                   | 02230148@college.bt (or the ID 02230148) | Student@123 |
| Suspended student (demo)  | 02230255@college.bt           | Student@123   |

Pema Choden has a "forced on duty" override so you can demo auto-assignment at any
hour. Admin → Settings has a demo clock to simulate duty / off-duty / weekend.

If you'd rather start from a clean slate with just the categories/blocks/one admin
account (no demo work orders), run `npm run seed:base --prefix server` instead of the
full seed.

To wipe and rebuild the database from scratch at any point: `npm run db:reset --prefix server`.

## 4. Run it

From the `campuscare` root, this starts both the API (port 5000) and the React dev
server (port 5173) together:

```bash
npm run dev
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api` and `/uploads`
requests to the Express server automatically (see `client/vite.config.js`), so you
don't need CORS configuration for local development.

To run them separately: `npm run dev:server` and `npm run dev:client` in two terminals.

## Running the tests

```bash
npm run test:server
```

This runs the Jest/Supertest integration suite (`server/tests/lifecycle.test.js`)
against `TEST_DATABASE_URL` from your `.env` (defaults to a `cmms_test` database —
create it the same way you created `cmms`). The suite exercises the full request
lifecycle (submit → assign → start → complete → feedback), permission boundaries
between roles, and a concurrency test where two technicians race to claim the same
pooled request.

## Building for production / deployment

```bash
npm run build:client
```

This builds the React app into `client/dist/`. The Express server (`server/src/app.js`)
already serves that folder in production, so a single Node process can serve both the
API and the frontend — convenient for a one-service deploy (e.g. Render, as named in
your proposal's tech stack). Set `NODE_ENV=production` and run `npm start --prefix server`.

## Opening in VS Code

1. Unzip this folder and open it in VS Code (`File > Open Folder…`).
2. Install the recommended extensions if prompted (ESLint, Tailwind CSS IntelliSense —
   see `.vscode/extensions.json`).
3. Open two integrated terminals, or just run `npm run dev` from the root as above.
4. The REST API is documented by reading through `server/src/routes/*.js` — each file
   is scoped to one resource and fairly short.

## Notes on scope vs. the proposal

A few things were added beyond what the ER diagram / physical design documents
listed, because the app needs them to function (password hashes, timestamps on every
status change, resolution notes, an audit log, system settings for SLA targets). Every
such column is commented `-- [+]` in `server/migrations/001_init.sql` so you can see
exactly what was added and why — useful if your group needs to explain deviations
from the submitted design in your final report. See `docs/PROJECT_NOTES.md` for the
full list mapped to your user stories.

Not implemented: native mobile app, SIS integration, QR-code reporting, billing,
inventory management, and SMS notifications (dropped by request; email + in-app remain).

## What the merged version adds (Main / Volunteer model)

- **Dark glass UI** with video background, landing page and tilt/ripple effects.
- **Two technician tiers.** Main technicians are staff matched by specialization.
  Volunteers are students matched by gender to the hostel building, with a weekly job cap.
- **Duty windows**: weekdays 7–9 PM and all weekend (Asia/Thimphu), with a per-technician
  override (auto / on / off).
- **Auto-routing + queue**: requests are assigned automatically to an eligible on-duty
  technician. If nobody matches, the request stays Pending with a visible reason and is
  retried every minute. Admins are only notified when a request gets queued.
- **Escalation** (Volunteer → Main, with reason and note, logged), **reopen** of completed
  requests, and **requester suspension** (admin, with reason).
- **Admin-editable** blocks, hostel buildings (with gender) and categories.
- Admin manual assignment deliberately bypasses duty/gender/cap checks.

If you already have a database from the earlier version, run `npm run db:reset --prefix server`
once: migration 002 adds the new tables and columns.

