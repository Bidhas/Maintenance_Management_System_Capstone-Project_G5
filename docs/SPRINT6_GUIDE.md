# CampusCare — Sprint 6 guide

Google sign-in, real campus data, technician job board, maintenance log, working hours, block visibility, targeted notifications and email.

Read this once, top to bottom, before anyone starts. Every member's pack README then tells them exactly which files to paste.

---

## 1. What is changing (the 7 modifications)

| # | Modification | How we do it | Owner |
|---|---|---|---|
| 1 | **Google authentication** | Google's "Sign in with Google" button gives the browser a signed ID token. The server verifies it, checks the email pattern, and issues our normal JWT. Registration is removed. | A (server), E (login page) |
| 2 | **Every technician sees every request** | New "pick mode" (default). The technician home page gets a job board in the same table style as the admin Requests page, with a **Claim** button. | C |
| 3 | **Real data, no demo data** | New `room` table, a production seed with all blocks/floors/rooms, an admin-creation script that takes the password at run time, and a demo-wipe script. | B |
| 4 | **Maintenance log (replaces the audit screen)** | New page and endpoint: completed work, jobs per room, which technician, equipment used, suspensions. Technicians now enter "equipment used" when completing a job. | E (page + endpoint), C (the field) |
| 5 | **Working hours** | Volunteers 7–9 PM every day; Main technicians 8 AM–5 PM every day. Technicians can only claim while on duty. | C |
| 6 | **Block visibility** | Students: hostel rooms + classrooms/learning spaces. Staff/teachers: everything except hostels, with a "Show all blocks" checkbox. Student vs staff is decided by the email pattern. Enforced on the server, not just in the form. | D (+ B for the data) |
| 7 | **Notification workflow + email** | One file (`notifyFlow.js`) decides who hears what. Nodemailer sends the same notices by email without ever blocking the app. | D |

### Who is notified of what (the new rule)

| Person | Gets notified when… |
|---|---|
| Student / teacher / staff | their request is **submitted**; the work is **completed** |
| Technician / volunteer | they **accept** (claim) a job; a job is **assigned** to them (by admin or auto mode) |
| Admin | a request is **uploaded**; a request is **assigned** (by anyone); the work is **completed** |

Three operational notices are kept because otherwise people would be left in the dark: **request declined** (to the requester and the technician), **job reassigned away** (to the old technician), and **account suspended / reinstated** (to that person). Say so if you want them removed — it is one line each.

---

## 2. How sign-in works (and why it will not crash the system)

```
Browser                         Our server                         Google
  | click "Continue with Google"     |                                  |
  |--------------------------------->| (button script comes from Google)|
  |<--- signed ID token (a JWT) -----|                                  |
  | POST /api/auth/google {token}    |                                  |
  |--------------------------------->| verify signature, audience,      |
  |                                  | expiry, email_verified, domain   |
  |                                  | find or create the account       |
  |<---- OUR JWT + profile ----------|                                  |
```

Design rules we followed so nothing breaks:

1. **The server never trusts the browser's email.** It only reads the email out of Google's signed token (`google-auth-library` checks the signature against Google's public keys).
2. **Everything after sign-in is unchanged.** We still issue the same JWT the app already understands, so every route, role guard and screen keeps working. Google only replaces *how you get the token*.
3. **Who may enter** (looked up by verified email, in this order): an **admin** row → a **technician** row (pre-created by the admin) → anyone whose email matches the college pattern, who gets a requester account created automatically. Anything else is refused with a clear message.

   | Email | Result |
   |---|---|
   | `02250345.cst@rub.edu.bt` | Student (digits before `.cst`, college id = the digits) |
   | `dorjiphuntsho.cst@rub.edu.bt` | Staff (a name before `.cst`) — or Admin if that email is in the admin table |
   | `someone@gmail.com`, `x@rub.edu.bt`, `x.cst@evil.com` | **Denied** |
4. **Google's permanent id (`sub`) is stored** on first sign-in. If someone later signs in to the same email with a *different* Google identity, they are refused.
5. **Kill switch / fallback.** Password sign-in for Admin and Technician stays behind `ALLOW_PASSWORD_LOGIN` (on in development, **off in production** unless you set it). Keep it on until you have personally signed in as admin with Google on the live site, then turn it off.
6. **Automated tests mock Google** (the token is a fake string), so CI never needs internet or credentials. The real Google check is done by hand once (section 4, step 8).
7. The button's client id is delivered by `GET /api/auth/config` at runtime, so changing it needs **no rebuild** of the React app.

---

## 3. Setting up Google (Member A does this once; ~15 minutes)

You need a Google account that can use <https://console.cloud.google.com>. Use your **college** account if the college Workspace allows Cloud Console; otherwise any Google account works.

1. Open the Cloud Console → project picker → **New project** → name it `CampusCare` → Create.
2. **APIs & Services → OAuth consent screen** (called *Google Auth Platform → Branding* in the newer console).
   - **User type:**
     - If you are signed in with a `@rub.edu.bt` account and the option **Internal** is offered, pick **Internal**. Then only college accounts can ever sign in, and no review is needed.
     - Otherwise pick **External**. Fill in app name `CampusCare`, support email, developer email. Scopes: only the defaults (`openid`, `email`, `profile`) — these need **no Google verification**. Then press **Publish app** (move from *Testing* to *In production*). **If you leave it in *Testing*, only the people you list as test users (max 100) can sign in — everyone else gets "Access blocked".** This is the most common mistake.
   - Our server enforces the college domain either way, so External is safe.
3. **Credentials → Create credentials → OAuth client ID** → Application type **Web application**, name `CampusCare web`.
   - **Authorized JavaScript origins** (exact, no trailing slash, no path):
     - `http://localhost:5173`  (local development)
     - `http://localhost:5000`  (only if you open the built app from the server locally)
     - `https://YOUR-LIVE-URL`  (your deployed site, e.g. `https://campuscare.onrender.com`)
   - **Authorized redirect URIs:** leave **empty**. The button uses a popup + token, not a redirect.
   - Create → copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`). You do **not** need the client secret anywhere.
4. Put the Client ID in `server/.env` (local) and in your host's environment variables (live):
   ```
   GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
   ALLOWED_EMAIL_DOMAIN=rub.edu.bt
   ```
   Restart the server. `http://localhost:5000/api/auth/config` should now show your client id.
5. Origins can take **up to a few minutes (rarely hours)** to start working after you save them.
6. Open `http://localhost:5173/login`. You should see Google's blue **Continue with Google** button.
7. Sign in with the admin's college email (after the admin account exists — section 5). You land on the admin overview.
8. Only after step 7 works **on the live site** should you set `ALLOW_PASSWORD_LOGIN=false` there.

---

## 4. Real data

### 4.1 What the seed loads (588 rooms)

- **Hostels (boys):** RKA, RKB, HE, HA, HB, NK, LH. **Girls:** HC, HD, HF. Each *floor* is a "building" in the database with the hostel's gender, so volunteer matching still works. Kitchens (rooms starting with `K`) are flagged.
- **Staff Quarters:** groups A, B, C, D, E, F (F1a–F6a, F1b–F6b), H, with each unit as a room.
- **Academic Building**, **Library Building**, **Administration Building** with every room/hall/office in your document.
- Counts were checked against your list (e.g. RKB floor 2 = 15, NK floor = 8 rooms + 2 kitchens, LH floor 3 = 9 + K301).

### 4.2 Where I had to make a call (please confirm)

- **"(check the numbers)" entries** (Architecture offices; DRIL, ECE, Electrical, SHD and CEED faculty offices) are loaded as **one room each** for now. When you know the real room numbers, add them in **Settings → Locations** (bulk "Add rooms" box) — no code change needed.
- **What counts as "classes" for students:** CR01–CR18, Smart Classroom, Teamwork Hall, Engineering Mechanics Lab, Renewable Lab and Drawing Studios 1–5. Everything else in the three buildings is staff-only. Each room can be changed later; new rooms added in Settings have a **Students can report** tick-box.
- **Teachers vs staff:** both are `name.cst@rub.edu.bt`, so both are stored as **Staff**. The existing "Faculty" type is unused. (The email pattern cannot tell a teacher from other staff.)
- **Volunteer hours** are read as 7–9 PM on **every** day (weekdays and weekends), not "weekends all day" as before.
- **Staff can still submit for hostels** (they just have to tick "Show all blocks"). Students can never submit for non-classroom rooms, even with a hand-made API call.

### 4.3 The admin account and the password

`dorjiphuntsho.cst@rub.edu.bt` is created by a script that **asks for the password at the terminal**; the password is never written into the repo, a seed file, or these docs:

```bash
cd server
npm run admin:create -- --email dorjiphuntsho.cst@rub.edu.bt --name "Dorji Phuntsho"
```

> **Security note.** The admin password appeared in a shared Word document. Treat it as exposed: set a different one with the script (re-running it for the same email updates the password), or use `--no-password` and sign in only with Google. With Google sign-in on, the password is only a fallback.

### 4.4 Removing demo data from Supabase — do this LAST

Demo accounts (`@cmms.local`, `@college.bt`), all sample requests and the old demo blocks are removed by `wipe-demo.js`. It **refuses to run unless a real admin already exists**, and it prints exactly what it will delete first. Order of operations is in section 7.

---

## 5. Email (Nodemailer) without breaking anything

The app already used Nodemailer; Sprint 6 makes it safe and useful:

- **Never blocks, never throws.** Emails are sent in the background with 10–15 s timeouts. A dead mail server only prints a line in the server log.
- **Skipped in tests** and, with no `SMTP_HOST`, only **printed to the console** (so development needs no setup).
- Respects both the **admin switch** (Settings → Notifications) and each person's **own preference** (Profile).
- Each email has the notice text and an **Open CampusCare** button that links to the request.

### Setting it up

1. Pick an SMTP provider:
   - **Gmail / college Google Workspace:** `smtp.gmail.com`, port `587`, user = the full address, password = an **App Password** (Google Account → Security → 2-Step Verification must be on → App passwords). College Workspaces often disable app passwords; if so, use a provider below.
   - **Brevo, Resend, SendGrid, Mailgun:** all have a free tier and give you an SMTP host/user/password (and tell you which "From" address is allowed).
2. In `server/.env` (and the host's environment variables):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=maintenance.cst@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM="CampusCare <maintenance.cst@gmail.com>"
   APP_URL=https://YOUR-LIVE-URL
   ```
   `APP_URL` is what the button in the email points to.
3. Test **before** trusting it: `npm run email:test -- yourself@example.com`. It checks the connection and login, sends one email, and prints a plain-language hint if it fails.
4. Port `587` blocked on a network? Try `465`, or a different network/hotspot (same problem as the database earlier).

---

## 6. How "pick mode" behaves (so nobody is surprised)

- Default mode is **pick**: a new request stays *Pending* with the note "Open for any on-duty technician to pick up". Nothing is assigned automatically.
- Every technician sees all requests on **My jobs → Job board**. The **Claim** button is disabled with the reason when it would be refused:
  - off duty (Main 8 AM–5 PM, Volunteer 7–9 PM; a manual on/off override still wins)
  - a volunteer who reached the weekly cap
  - a volunteer looking at a hostel of the other gender
  - a volunteer looking at an escalated job (Main-only)
- Main technicians can claim anything; specialisation is no longer required in pick mode.
- Claiming is atomic: if two technicians press Claim together, one gets the job and the other gets "already assigned".
- The admin can still assign/reassign manually at any time, and can switch **Settings → Notifications → "Technicians pick their own jobs"** off to go back to automatic assignment.

---

## 7. Go-live runbook (Supabase + hosting) — in this order

Do the steps in order. Nothing here deletes data until step 9.

1. Merge Sprint 6 into `develop` (packs: B–E first, A last). Everyone pulls.
2. `npm run install:all` (a new package, `google-auth-library`, was added to `server/`).
3. In `server/.env` (pointing at Supabase): add `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL_DOMAIN`, the `SMTP_*` lines and `APP_URL` (section 3 and 5).
4. `npm run migrate --prefix server` — applies `003_real_data_google_auth.sql`. It only **adds** columns/tables, so existing demo data is untouched. (Run it once, from one machine.)
5. `npm run seed:prod --prefix server` — loads the real blocks, floors, rooms and categories. Safe to run twice.
6. `npm run admin:create --prefix server -- --email dorjiphuntsho.cst@rub.edu.bt --name "Dorji Phuntsho"`.
7. Run the app and sign in with Google as that admin. In **Technicians**, add each technician/volunteer using their college email (no password needed). They sign in with Google.
8. Have one student and one staff member sign in; submit a request each; have a technician claim and complete one; check the notifications and the Maintenance log.
9. When satisfied: `npm run wipe:demo --prefix server` (dry run — read the table), then `npm run wipe:demo --prefix server -- --yes`.
10. On the live host: set `ALLOW_PASSWORD_LOGIN=false` (or leave it unset in production).

If anything goes wrong before step 9, nothing real was lost: the demo data is still there and the old behaviour is available by leaving `ALLOW_PASSWORD_LOGIN=true`.

---

## 8. Heads-ups and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Login page says "Google sign-in is not configured" | `GOOGLE_CLIENT_ID` missing/typo in `server/.env` or the host, or server not restarted | Set it, restart, open `/api/auth/config` to confirm |
| Google popup says **Error 400: origin_mismatch** | The exact page origin isn't in *Authorized JavaScript origins* (wrong port, `http` vs `https`, trailing slash, or `127.0.0.1` vs `localhost`) | Add the exact origin; wait a few minutes; use `localhost`, not `127.0.0.1` |
| Google says **Access blocked / app not verified** | Consent screen still in *Testing* | OAuth consent screen → **Publish app** (or use Internal) |
| Button never appears; console says CSP violation (production only) | A security header blocking Google's script | Fixed in `app.js` (CSP + `same-origin-allow-popups`). If you add other external scripts/fonts, add them there too |
| Button area is blank, "could not load" message | Network blocks `accounts.google.com` | Try another network/hotspot/VPN — same cause as the database port problem |
| "This Google account is not authorised" for a real student | Email doesn't match the pattern (`digits.cst@rub.edu.bt` / `name.cst@rub.edu.bt`), or they chose a personal Google account | Ask them to pick the college account in Google's chooser. If a real staff address doesn't fit the pattern (e.g. no `.cst`), tell Member A: the rule is one regex in `utils/collegeEmail.js` |
| Technician can't sign in | Their row doesn't exist yet, or the email on the Technicians page differs from their Google email | Add/edit the technician with the exact college email |
| "linked to a different Google identity" | The same email signed in with another Google account id earlier | Admin: ask the person to use the right account. If an account was genuinely reissued, clear `google_sub` for that row in the database |
| Everyone sees 403/401 right after deploy | Browser still holds a token from the demo accounts | Log out / clear site data; demo users are removed by the wipe |
| `npm run migrate` fails on `uq_*_email_lower` | Two existing rows differ only by letter-case | Fix the duplicate email in the database, run migrate again (the migration is transactional; nothing half-applied) |
| `npm run wipe:demo` says "Refusing: no real admin" | Admin script not run yet | Run `admin:create` first. That's the safety lock working |
| Student can't see a room they need | The room isn't flagged student-visible | Settings → Locations → add it (tick **Students can report**) or ask an admin to change it |
| Request form says "Select a room from the list" | The block has rooms registered and the text didn't match | Choose from the drop-down; add missing rooms in Settings |
| Emails never arrive | `SMTP_*` not set (they're only logged), wrong App Password, provider blocks the From address, or lands in spam | `npm run email:test -- you@x.com`; check the server log for `Email failed:` |
| Emails arrive but notification bell shows nothing | In-app notifications switched off (Settings or Profile) | Re-enable |
| Technician sees "Outside working hours" at 5:30 PM | Working hours are fixed in code (`services/duty.js`, `HOURS`) and use **Bhutan time** | Change the numbers there if the hours change; or use the Profile duty override (on/off) |
| Weekly cap blocks a volunteer on the board | Cap counts jobs assigned in the last 7 days | Admin raises the cap on the Technicians page |
| Tests fail with `relation "room" does not exist` | Test database not migrated | `npm test` runs the migration itself; make sure `TEST_DATABASE_URL` points to a database that exists |
| Old tests (Sprint 5) fail on registration/login | Registration and requester password login no longer exist | Use the updated `lifecycle.test.js` from Member E's pack |
| `git status` shows `Register.jsx` / `Audit.jsx` still present after pasting | Pasting never deletes files | Member E runs the `git rm` lines in their README |
| A merge conflict in `server/package.json` | Only Member A edits this file in Sprint 6 | Others must not touch it; their scripts are already inside A's copy |
| Render/hosting build fails on `google-auth-library` | Lock file not committed | Member A commits `server/package-lock.json` with the package change |
| Sign-in works locally but not on the live site | Live URL missing from authorized origins, or `GOOGLE_CLIENT_ID` not set on the host | Add both; redeploy |
| You want to start over locally | — | `npm run db:reset --prefix server` then `npm run db:setup:prod` |

---

## 9. Assumptions to confirm (nothing is blocked on these)

1. Students may report **hostel rooms and classrooms/learning spaces only**; the room list for "classes" is in section 4.2.
2. Teachers and other staff are one group ("Staff").
3. Volunteer hours 7–9 PM every day.
4. Staff can report hostels by ticking **Show all blocks**.
5. The three extra notices (declined, reassigned away, suspended/reinstated) are kept.
6. The old Audit screen is replaced by the Maintenance log; the underlying append-only audit table still records everything for the database owner.
7. "(check the numbers)" locations are placeholders until real room numbers are known.
