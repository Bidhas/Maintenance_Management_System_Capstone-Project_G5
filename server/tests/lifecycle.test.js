process.env.NODE_ENV = 'test';
const request = require('supertest');
const { execSync } = require('child_process');
const path = require('path');
const { pool } = require('../src/db');

// Google is mocked: the "credential" is just "email|sub|name". The REAL verification (signature, audience,
// expiry) lives in google-auth-library and is exercised manually with a real Google account.
jest.mock('../src/services/google', () => ({
  verifyGoogleCredential: async (credential) => {
    const [email, sub, name] = credential.split('|');
    if (!email || !sub) throw new Error('bad token');
    return { email: email.toLowerCase(), sub, name: name || 'Test Person' };
  },
}));
const googleLogin = (email, sub = `sub-${email}`, name) =>
  request(app).post('/api/auth/google').send({ credential: `${email}|${sub}|${name || 'Test Person'}-padding-padding` });

execSync(`node ${path.join(__dirname, '..', 'scripts', 'migrate.js')}`, {
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test' },
  stdio: 'inherit',
});

const app = require('../src/app');

const admin = { name: 'Test Admin', email: 'test-admin@cmms.local', password: 'Admin@1234' };
let adminToken, studentToken, techToken, categoryId, blockName = 'Test Block', requestId, techId;

beforeAll(async () => {
  await pool.query('DELETE FROM escalation');
  await pool.query('TRUNCATE audit_log'); // TRUNCATE (not DELETE): the append-only trigger blocks row deletes
  await pool.query('DELETE FROM notification');
  await pool.query('DELETE FROM request_status_history');
  await pool.query('DELETE FROM request');
  await pool.query('DELETE FROM technician_category');
  await pool.query('DELETE FROM technician');
  await pool.query('DELETE FROM requester');
  await pool.query('DELETE FROM admin');
  await pool.query('DELETE FROM category');
  await pool.query('DELETE FROM room');
  await pool.query('DELETE FROM building');
  await pool.query('DELETE FROM block');
  const bcrypt = require('bcryptjs');
  await pool.query('INSERT INTO admin (name, email, password_hash) VALUES ($1,$2,$3)',
    [admin.name, admin.email, bcrypt.hashSync(admin.password, 4)]);
  await pool.query(`INSERT INTO system_setting (key, value) VALUES ('assignment_mode','pick') ON CONFLICT (key) DO UPDATE SET value='pick'`);
});

/** Forces the simulated clock to a known off-duty moment so every test's routing
 * behaviour is deterministic regardless of when in real life the suite happens to run. */
async function setClock(mode) {
  const res = await request(app).post('/api/settings/clock').set('Authorization', `Bearer ${adminToken}`).send({ mode });
  expect(res.status).toBe(200);
}

afterAll(async () => { await pool.end(); });

test('admin can log in', async () => {
  const res = await request(app).post('/api/auth/login')
    .send({ role: 'admin', identifier: admin.email, password: admin.password });
  expect(res.status).toBe(200);
  adminToken = res.body.token;
  await setClock('offduty-weekday'); // deterministic: nothing auto-assigns until a test explicitly asks for it
});

test('rejects wrong password with generic message', async () => {
  const res = await request(app).post('/api/auth/login')
    .send({ role: 'admin', identifier: admin.email, password: 'wrong-pass' });
  expect(res.status).toBe(401);
  expect(res.body.error).toMatch(/invalid credentials/i);
});

test('admin creates a block and category', async () => {
  const b = await request(app).post('/api/blocks').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: blockName, hostels: 1, rooms: 10 });
  expect(b.status).toBe(201);
  const c = await request(app).post('/api/categories').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Category' });
  expect(c.status).toBe(201);
  categoryId = c.body.category.id;
});

test('admin creates a technician', async () => {
  const res = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Tech', email: 'test-tech@cmms.local', password: 'Tech@1234', category_ids: [categoryId] });
  expect(res.status).toBe(201);
  techId = res.body.technician.id;
  const login = await request(app).post('/api/auth/login')
    .send({ role: 'technician', identifier: 'test-tech@cmms.local', password: 'Tech@1234' });
  expect(login.status).toBe(200);
  techToken = login.body.token;
});

// "studentToken" is a STAFF requester here: general lifecycle tests use a block with no rooms, which students may not
// report (see the Sprint 6 describe block below for the student-specific rules).
test('staff requester signs in with Google (account auto-created)', async () => {
  const login = await googleLogin('test.staff.cst@rub.edu.bt', 'sub-staff-1', 'Test Staff');
  expect(login.status).toBe(200);
  expect(login.body.user.account_type).toBe('Staff');
  studentToken = login.body.token;
});

test('rejects a request with a bad category with field errors', async () => {
  const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
    .field('block', blockName).field('room_no', 'Room 1').field('category_id', '999999')
    .field('title', 'Broken thing').field('description', 'Short but over ten characters long')
    .field('urgency', 'Low');
  expect(res.status).toBe(400);
});

test('student submits a request', async () => {
  const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
    .field('block', blockName).field('room_no', 'Room 1').field('category_id', String(categoryId))
    .field('title', 'Broken thing').field('description', 'Something is broken and needs fixing soon')
    .field('urgency', 'High');
  expect(res.status).toBe(201);
  expect(res.body.request.status).toBe('Pending');
  requestId = res.body.request.id;
});

test('another requester cannot view someone elses request', async () => {
  const login = await googleLogin('other.staff.cst@rub.edu.bt', 'sub-staff-2', 'Other Staff');
  const res = await request(app).get(`/api/requests/${requestId}`).set('Authorization', `Bearer ${login.body.token}`);
  expect(res.status).toBe(403);
});

test('technician cannot act on unassigned foreign request (start)', async () => {
  const res = await request(app).post(`/api/requests/${requestId}/start`).set('Authorization', `Bearer ${techToken}`);
  expect(res.status).toBe(403);
});

test('admin assigns the technician', async () => {
  const res = await request(app).post(`/api/requests/${requestId}/assign`).set('Authorization', `Bearer ${adminToken}`)
    .send({ tech_id: techId });
  expect(res.status).toBe(200);
  expect(res.body.request.status).toBe('Assigned');
  expect(res.body.request.technician.id).toBe(techId);
});

test('technician cannot complete before starting', async () => {
  const res = await request(app).post(`/api/requests/${requestId}/complete`).set('Authorization', `Bearer ${techToken}`)
    .field('resolution_notes', 'Fixed it').field('equipment_used', 'None').field('time_spent_minutes', '30');
  expect(res.status).toBe(409);
});

test('technician starts then completes the work order', async () => {
  const start = await request(app).post(`/api/requests/${requestId}/start`).set('Authorization', `Bearer ${techToken}`);
  expect(start.status).toBe(200);
  expect(start.body.request.status).toBe('In Progress');

  const complete = await request(app).post(`/api/requests/${requestId}/complete`).set('Authorization', `Bearer ${techToken}`)
    .field('resolution_notes', 'Replaced the part and tested it').field('equipment_used', 'Screwdriver, multimeter').field('time_spent_minutes', '45');
  expect(complete.status).toBe(200);
  expect(complete.body.request.status).toBe('Completed');
  expect(complete.body.request.time_spent_minutes).toBe(45);
});

test('requester leaves feedback once', async () => {
  const ok = await request(app).post(`/api/requests/${requestId}/feedback`).set('Authorization', `Bearer ${studentToken}`)
    .send({ rating: 5, comment: 'Great job' });
  expect(ok.status).toBe(200);
  const twice = await request(app).post(`/api/requests/${requestId}/feedback`).set('Authorization', `Bearer ${studentToken}`)
    .send({ rating: 4 });
  expect(twice.status).toBe(409);
});

test('student received in-app notifications', async () => {
  const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(200);
  expect(res.body.notifications.length).toBeGreaterThan(0);
});

test('two technicians racing to claim a pooled request: only one wins', async () => {
  const created = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
    .field('block', blockName).field('room_no', 'Room 2').field('category_id', String(categoryId))
    .field('title', 'Race condition test').field('description', 'Testing concurrent claim behaviour please')
    .field('urgency', 'Low');
  const rid = created.body.request.id;

  const tech2reg = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Second Tech', email: 'second-tech@cmms.local', password: 'Tech@1234', category_ids: [categoryId] });
  const tech2login = await request(app).post('/api/auth/login')
    .send({ role: 'technician', identifier: 'second-tech@cmms.local', password: 'Tech@1234' });

  // Claiming requires being on duty. Flip the in-process sim clock directly (not via the API) so the
  // queue isn't re-run and auto-assigns the request before the two technicians race for it.
  const duty = require('../src/services/duty');
  duty.setSimClock('main-hours');
  let a, b;
  try {
    [a, b] = await Promise.all([
      request(app).post(`/api/requests/${rid}/claim`).set('Authorization', `Bearer ${techToken}`),
      request(app).post(`/api/requests/${rid}/claim`).set('Authorization', `Bearer ${tech2login.body.token}`),
    ]);
  } finally {
    duty.setSimClock('offduty-weekday');
  }
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([200, 409]);
});

test('admin reports summary reflects the completed request', async () => {
  const res = await request(app).get('/api/reports/summary').set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.totals.total).toBeGreaterThanOrEqual(2);
});

test('audit log recorded the key actions', async () => {
  const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  const actions = res.body.logs.map((l) => l.action);
  expect(actions).toEqual(expect.arrayContaining(['REQUEST_ASSIGN', 'STATUS_CHANGE', 'REQUEST_CREATE']));
});

describe('volunteer routing, duty windows, escalation, reopen, suspension (AUTO assignment mode)', () => {
  beforeAll(async () => {
    const r = await request(app).put('/api/settings').set('Authorization', `Bearer ${adminToken}`).send({ assignment_mode: 'auto' });
    expect(r.status).toBe(200);
  });
  afterAll(async () => {
    await request(app).put('/api/settings').set('Authorization', `Bearer ${adminToken}`).send({ assignment_mode: 'pick' });
  });
  let hostelBuildingId, volunteerToken, volunteerId, queuedRequestId, hostelRequestId;

  test('admin registers a gender-specific hostel block/building', async () => {
    const block = await request(app).post('/api/blocks').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Hostel', hostels: 1, rooms: 20, is_hostel: true });
    expect(block.status).toBe(201);
    const building = await request(app).post(`/api/blocks/${block.body.block.id}/buildings`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Female Wing', gender: 'F' });
    expect(building.status).toBe(201);
    hostelBuildingId = building.body.building.id;
  });

  test('creating a Volunteer technician without a gender is rejected', async () => {
    const res = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Vol No Gender', email: 'vol-no-gender@cmms.local', password: 'Volunteer@1234', tier: 'Volunteer', category_ids: [categoryId] });
    expect(res.status).toBe(400);
  });

  test('admin creates a duty-overridden Volunteer technician matching the hostel gender', async () => {
    const res = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Volunteer', email: 'test-volunteer@cmms.local', password: 'Volunteer@1234', tier: 'Volunteer', gender: 'F', weekly_cap: 2, duty_override: 'on', category_ids: [categoryId] });
    expect(res.status).toBe(201);
    volunteerId = res.body.technician.id;
    const login = await request(app).post('/api/auth/login').send({ role: 'technician', identifier: 'test-volunteer@cmms.local', password: 'Volunteer@1234' });
    volunteerToken = login.body.token;
  });

  test('a hostel request auto-assigns to the gender-matched, on-duty volunteer', async () => {
    const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
      .field('block', 'Test Hostel').field('building_id', String(hostelBuildingId)).field('room_no', 'F-101')
      .field('category_id', String(categoryId)).field('title', 'Hostel AC issue').field('description', 'Needs attention from a matched volunteer please')
      .field('urgency', 'Medium');
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('Assigned');
    expect(res.body.request.technician.id).toBe(volunteerId);
    hostelRequestId = res.body.request.id;
  });

  test('an academic request stays queued while globally off-duty, with a reason', async () => {
    const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
      .field('block', blockName).field('room_no', 'Room 9').field('category_id', String(categoryId))
      .field('title', 'Queued test').field('description', 'Should stay pending while off duty please')
      .field('urgency', 'Low');
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('Pending');
    expect(res.body.request.queue_reason).toBeTruthy();
    queuedRequestId = res.body.request.id;
  });

  test('flipping to a duty window auto-assigns the previously queued request', async () => {
    await setClock('main-hours');
    await new Promise((r) => setTimeout(r, 500)); // processQueue fires asynchronously after the clock change
    const res = await request(app).get(`/api/requests/${queuedRequestId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.request.status).toBe('Assigned');
    expect(res.body.request.technician.tier).toBe('Main'); // one of the two Main technicians created earlier — which one depends on load balancing
    await setClock('offduty-weekday'); // back to a known state for the remaining tests
  });

  test('a Main technician cannot escalate (only Volunteers can)', async () => {
    const res = await request(app).post(`/api/requests/${queuedRequestId}/escalate`).set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'Beyond skill level' });
    expect(res.status).toBe(403);
  });

  test('a Volunteer escalating sends the job back to the pool, tagged escalated', async () => {
    const res = await request(app).post(`/api/requests/${hostelRequestId}/escalate`).set('Authorization', `Bearer ${volunteerToken}`)
      .send({ reason: 'Beyond skill level', note: 'Needs a specialist' });
    expect(res.status).toBe(200);
    expect(res.body.request.escalated).toBe(true);
  });

  test('escalations show up in the admin escalation log', async () => {
    const res = await request(app).get('/api/escalations').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.escalations.length).toBeGreaterThan(0);
  });

  test('requester can reopen a completed request', async () => {
    const res = await request(app).post(`/api/requests/${requestId}/reopen`).set('Authorization', `Bearer ${studentToken}`)
      .send({ why: 'The issue came back' });
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('Assigned');
    expect(res.body.request.reopen_count).toBe(1);
  });

  test('admin can suspend a requester, blocking new submissions, then reinstate them', async () => {
    const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    const student = users.body.users.find((u) => u.email === 'test.staff.cst@rub.edu.bt');
    expect(Number(student.request_count)).toBeGreaterThan(0);

    // the request list carries the duty-clock info that the dashboard banner shows
    const list = await request(app).get('/api/requests').set('Authorization', `Bearer ${studentToken}`);
    expect(list.body.duty).toEqual(expect.objectContaining({ in_window: expect.any(Boolean), tz: expect.any(String), main: expect.any(Object), volunteer: expect.any(Object) }));
    expect(typeof list.body.duty.now).toBe('string');

    const suspend = await request(app).post(`/api/users/requester/${student.id}/suspend`).set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Testing suspension flow' });
    expect(suspend.status).toBe(200);

    const blocked = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
      .field('block', blockName).field('room_no', 'Room X').field('category_id', String(categoryId))
      .field('title', 'Should be blocked').field('description', 'This submission should be rejected please')
      .field('urgency', 'Low');
    expect(blocked.status).toBe(403);

    const reinstate = await request(app).post(`/api/users/requester/${student.id}/reinstate`).set('Authorization', `Bearer ${adminToken}`);
    expect(reinstate.status).toBe(200);

    const allowed = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
      .field('block', blockName).field('room_no', 'Room X').field('category_id', String(categoryId))
      .field('title', 'Should work now').field('description', 'This submission should be allowed please')
      .field('urgency', 'Low');
    expect(allowed.status).toBe(201);
  });

  test('a Volunteer technician cannot exceed their weekly cap', async () => {
    // Test Volunteer's cap is 2; the earlier hostel job no longer counts (it was escalated away).
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${studentToken}`)
        .field('block', 'Test Hostel').field('building_id', String(hostelBuildingId)).field('room_no', `F-10${i}`)
        .field('category_id', String(categoryId)).field('title', `Cap test ${i}`).field('description', 'Testing the weekly cap enforcement please')
        .field('urgency', 'Low');
      statuses.push(res.body.request.status);
    }
    expect(statuses).toContain('Pending'); // the 3rd should queue once the cap of 2 is reached
  });
});

/* ============================== Sprint 6 ============================== */
describe('Sprint 6: Google sign-in rules', () => {
  test('a student email is auto-provisioned as a Student with the digits as college id', async () => {
    const res = await googleLogin('02250345.cst@rub.edu.bt', 'sub-stu-1', 'Tashi Student');
    expect(res.status).toBe(200);
    expect(res.body.user.account_type).toBe('Student');
    expect(res.body.user.college_id).toBe('02250345');
  });
  test('signing in again reuses the same account', async () => {
    const a = await googleLogin('02250345.cst@rub.edu.bt', 'sub-stu-1');
    expect(a.status).toBe(200);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM requester WHERE email = '02250345.cst@rub.edu.bt'`);
    expect(rows[0].n).toBe(1);
  });
  test('other emails (gmail, wrong domain, no .cst) are denied', async () => {
    for (const e of ['someone@gmail.com', 'person@rub.edu.bt', 'x.cst@evil.com', '02250346.cst@rub.edu.bt.evil.com']) {
      const res = await googleLogin(e);
      expect(res.status).toBe(403);
    }
  });
  test('a different Google identity cannot take over an existing account', async () => {
    const res = await googleLogin('02250345.cst@rub.edu.bt', 'someone-elses-sub');
    expect(res.status).toBe(403);
  });
  test('an invalid token is rejected with 401', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'garbage-garbage-garbage-garbage' });
    expect(res.status).toBe(401);
  });
  test('a deactivated account cannot sign in', async () => {
    await googleLogin('02250999.cst@rub.edu.bt', 'sub-stu-off');
    await pool.query(`UPDATE requester SET is_active = FALSE WHERE email = '02250999.cst@rub.edu.bt'`);
    expect((await googleLogin('02250999.cst@rub.edu.bt', 'sub-stu-off')).status).toBe(403);
  });
  test('a technician pre-created by the admin (no password) signs in with Google', async () => {
    const mk = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Google Tech', email: 'google.tech.cst@rub.edu.bt', category_ids: [categoryId] });
    expect(mk.status).toBe(201);
    const res = await googleLogin('google.tech.cst@rub.edu.bt', 'sub-tech-g', 'Google Tech');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('technician');
  });
  test('the admin signs in with Google when their row exists', async () => {
    const res = await googleLogin(admin.email, 'sub-admin');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
  test('self-registration no longer exists', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'x@y.z', password: 'Password1', role: 'Student' });
    expect(res.status).toBe(404);
  });
});

describe('Sprint 6: room visibility (students vs staff)', () => {
  let studentTok, staffTok, hostelBlockId, floorId, cat;
  beforeAll(async () => {
    studentTok = (await googleLogin('02250400.cst@rub.edu.bt', 'sub-vis-stu')).body.token;
    staffTok = (await googleLogin('vis.staff.cst@rub.edu.bt', 'sub-vis-staff')).body.token;
    cat = categoryId;
    const hb = await request(app).post('/api/blocks').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Vis Hostel', is_hostel: true });
    hostelBlockId = hb.body.block.id;
    const fl = await request(app).post(`/api/blocks/${hostelBlockId}/buildings`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Floor 1', gender: 'M' });
    floorId = fl.body.building.id;
    await request(app).post(`/api/blocks/${hostelBlockId}/rooms`).set('Authorization', `Bearer ${adminToken}`).send({ building_id: floorId, rooms: '101\n102\nK101' });
    const ab = await request(app).post('/api/blocks').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Vis Academic' });
    await request(app).post(`/api/blocks/${ab.body.block.id}/rooms`).set('Authorization', `Bearer ${adminToken}`).send({ rooms: 'CR01', student_visible: true });
    await request(app).post(`/api/blocks/${ab.body.block.id}/rooms`).set('Authorization', `Bearer ${adminToken}`).send({ rooms: 'Principal Office', student_visible: false });
  });
  const names = (r) => r.body.blocks.map((b) => b.name);

  test('students see hostels and classrooms only', async () => {
    const res = await request(app).get('/api/blocks').set('Authorization', `Bearer ${studentTok}`);
    expect(names(res)).toEqual(expect.arrayContaining(['Vis Hostel', 'Vis Academic']));
    const acad = res.body.blocks.find((b) => b.name === 'Vis Academic');
    expect(acad.rooms.map((r) => r.no)).toEqual(['CR01']);
  });
  test('staff do not see hostels unless they tick "show all"', async () => {
    const def = await request(app).get('/api/blocks').set('Authorization', `Bearer ${staffTok}`);
    expect(names(def)).not.toContain('Vis Hostel');
    expect(names(def)).toContain('Vis Academic');
    const all = await request(app).get('/api/blocks?all=1').set('Authorization', `Bearer ${staffTok}`);
    expect(names(all)).toContain('Vis Hostel');
  });
  const submit = (tok, block, room, extra = {}) => {
    let r = request(app).post('/api/requests').set('Authorization', `Bearer ${tok}`)
      .field('block', block).field('room_no', room).field('category_id', String(cat))
      .field('title', 'Visibility test').field('description', 'Checking the room visibility rules').field('urgency', 'Low');
    if (extra.building_id) r = r.field('building_id', String(extra.building_id));
    return r;
  };
  test('a student can report a hostel room and a classroom', async () => {
    expect((await submit(studentTok, 'Vis Hostel', '101', { building_id: floorId })).status).toBe(201);
    expect((await submit(studentTok, 'Vis Academic', 'CR01')).status).toBe(201);
  });
  test('a student cannot report a non-classroom room even via a direct API call', async () => {
    expect((await submit(studentTok, 'Vis Academic', 'Principal Office')).status).toBe(403);
  });
  test('a room that is not registered is rejected', async () => {
    expect((await submit(staffTok, 'Vis Academic', 'Made Up Room')).status).toBe(400);
  });
  test('staff can report any room', async () => {
    expect((await submit(staffTok, 'Vis Academic', 'Principal Office')).status).toBe(201);
  });
});

describe('Sprint 6: pick mode, working hours, notifications, maintenance log', () => {
  let staffTok, mainTok, mainId, volTok, volId, rid, cat;
  const notifs = async (email, role) => {
    const table = role; const idCol = role === 'requester' ? 'user_id' : role === 'technician' ? 'tech_id' : 'admin_id';
    const { rows } = await pool.query(
      `SELECT n.title FROM notification n JOIN ${table} t ON t.${idCol} = n.recipient_id WHERE n.recipient_role = $1 AND LOWER(t.email) = $2 ORDER BY n.notif_id`, [role, email]);
    return rows.map((r) => r.title);
  };
  beforeAll(async () => {
    cat = categoryId;
    staffTok = (await googleLogin('pick.staff.cst@rub.edu.bt', 'sub-pick-staff')).body.token;
    const m = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Pick Main', email: 'pick.main@cmms.local', password: 'Tech@1234', category_ids: [] }); // NO specialisation on purpose
    mainId = m.body.technician.id;
    mainTok = (await request(app).post('/api/auth/login').send({ role: 'technician', identifier: 'pick.main@cmms.local', password: 'Tech@1234' })).body.token;
    const v = await request(app).post('/api/technicians').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Pick Vol', email: 'pick.vol@cmms.local', password: 'Tech@1234', tier: 'Volunteer', gender: 'M', category_ids: [] });
    volId = v.body.technician.id;
    volTok = (await request(app).post('/api/auth/login').send({ role: 'technician', identifier: 'pick.vol@cmms.local', password: 'Tech@1234' })).body.token;
  });

  test('a new request stays Pending in pick mode (nothing auto-assigns) even while on duty', async () => {
    await setClock('main-hours');
    const res = await request(app).post('/api/requests').set('Authorization', `Bearer ${staffTok}`)
      .field('block', blockName).field('room_no', 'Pick 1').field('category_id', String(cat))
      .field('title', 'Pick me').field('description', 'A job a technician should choose').field('urgency', 'High');
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('Pending');
    rid = res.body.request.id;
  });
  test('every technician sees the request, with a per-technician claim verdict', async () => {
    const main = await request(app).get('/api/requests?scope=all').set('Authorization', `Bearer ${mainTok}`);
    const row = main.body.requests.find((r) => r.id === rid);
    expect(row).toBeTruthy();
    expect(row.can_claim).toBe(true);                 // Main, on duty, no specialisation needed
    const vol = await request(app).get('/api/requests?scope=all').set('Authorization', `Bearer ${volTok}`);
    const vrow = vol.body.requests.find((r) => r.id === rid);
    expect(vrow.can_claim).toBe(false);               // volunteer hours are 7–9 PM; the clock says 11 AM
    expect(vrow.claim_blocked_reason).toMatch(/volunteer hours/i);
  });
  test('a technician can open the detail of a request that is not theirs', async () => {
    expect((await request(app).get(`/api/requests/${rid}`).set('Authorization', `Bearer ${volTok}`)).status).toBe(200);
  });
  test('a volunteer cannot claim outside 7–9 PM', async () => {
    const res = await request(app).post(`/api/requests/${rid}/claim`).set('Authorization', `Bearer ${volTok}`);
    expect(res.status).toBe(403);
  });
  test('volunteer can claim during 7–9 PM; Main cannot at that time', async () => {
    await setClock('volunteer-hours');
    const main = await request(app).post(`/api/requests/${rid}/claim`).set('Authorization', `Bearer ${mainTok}`);
    expect(main.status).toBe(403);
    // …but not an escalated/other-gender job; this one is a plain job, so the volunteer may take it
    const vol = await request(app).post(`/api/requests/${rid}/claim`).set('Authorization', `Bearer ${volTok}`);
    expect(vol.status).toBe(200);
    expect(vol.body.request.technician.id).toBe(volId);
  });
  test('notification workflow: requester/technician/admin each got only their own notices', async () => {
    expect(await notifs('pick.staff.cst@rub.edu.bt', 'requester')).toEqual(['Request submitted']);
    expect(await notifs('pick.vol@cmms.local', 'technician')).toEqual(['Job accepted']);
    const admins = await notifs(admin.email, 'admin');
    expect(admins).toEqual(expect.arrayContaining(['New request uploaded', 'Request assigned']));
  });
  test('completing notifies requester + admin; equipment is mandatory', async () => {
    await request(app).post(`/api/requests/${rid}/start`).set('Authorization', `Bearer ${volTok}`);
    const noEquip = await request(app).post(`/api/requests/${rid}/complete`).set('Authorization', `Bearer ${volTok}`)
      .field('resolution_notes', 'Replaced the bulb').field('time_spent_minutes', '20');
    expect(noEquip.status).toBe(400);
    const ok = await request(app).post(`/api/requests/${rid}/complete`).set('Authorization', `Bearer ${volTok}`)
      .field('resolution_notes', 'Replaced the bulb').field('equipment_used', 'Ladder, LED bulb').field('time_spent_minutes', '20');
    expect(ok.status).toBe(200);
    expect(await notifs('pick.staff.cst@rub.edu.bt', 'requester')).toEqual(['Request submitted', 'Work completed']);
    expect(await notifs(admin.email, 'admin')).toEqual(expect.arrayContaining(['Work completed']));
  });
  test('maintenance log reports completed work, per-room counts, technicians, equipment and suspensions', async () => {
    const res = await request(app).get('/api/maintenance-log').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.completed).toBeGreaterThanOrEqual(1);
    expect(res.body.by_room.some((r) => r.room_no === 'Pick 1' && Number(r.jobs) === 1)).toBe(true);
    expect(res.body.by_technician.some((t) => t.name === 'Pick Vol')).toBe(true);
    expect(res.body.equipment.map((e) => e.item.toLowerCase())).toEqual(expect.arrayContaining(['ladder', 'led bulb']));
    expect(res.body.suspensions.history.length).toBeGreaterThan(0); // the earlier suspend/reinstate test
  });
  test('maintenance log is admin-only', async () => {
    expect((await request(app).get('/api/maintenance-log').set('Authorization', `Bearer ${staffTok}`)).status).toBe(403);
  });
  test('working hours: Main 8–17, Volunteer 19–21, every day', () => {
    const duty = require('../src/services/duty');
    const at = (iso) => new Date(iso); // Thimphu = UTC+6
    expect(duty.isWorkingHours('Main', at('2026-11-01T03:00:00Z'))).toBe(true);       // Sunday 09:00
    expect(duty.isWorkingHours('Main', at('2026-11-02T11:30:00Z'))).toBe(false);      // Monday 17:30
    expect(duty.isWorkingHours('Volunteer', at('2026-11-01T14:00:00Z'))).toBe(true);  // Sunday 20:00
    expect(duty.isWorkingHours('Volunteer', at('2026-11-02T04:00:00Z'))).toBe(false); // Monday 10:00
  });
  test('admin can switch assignment mode', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${adminToken}`).send({ assignment_mode: 'auto' });
    expect(res.body.settings.assignment_mode).toBe('auto');
    await request(app).put('/api/settings').set('Authorization', `Bearer ${adminToken}`).send({ assignment_mode: 'pick' });
  });
});
