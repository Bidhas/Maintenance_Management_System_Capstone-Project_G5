process.env.NODE_ENV = 'test';
const request = require('supertest');
const { execSync } = require('child_process');
const path = require('path');
const { pool } = require('../src/db');

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
  await pool.query('DELETE FROM building');
  await pool.query('DELETE FROM block');
  const bcrypt = require('bcryptjs');
  await pool.query('INSERT INTO admin (name, email, password_hash) VALUES ($1,$2,$3)',
    [admin.name, admin.email, bcrypt.hashSync(admin.password, 4)]);
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

test('student registers and logs in', async () => {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Test Student', email: 'test-student@cmms.local', password: 'Student@1234', role: 'Student', college_id: 'T-001' });
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login')
    .send({ role: 'requester', identifier: 'T-001', password: 'Student@1234' });
  expect(login.status).toBe(200);
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
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Other Student', email: 'other-student@cmms.local', password: 'Student@1234', role: 'Student' });
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login')
    .send({ role: 'requester', identifier: 'other-student@cmms.local', password: 'Student@1234' });
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
    .field('resolution_notes', 'Fixed it').field('time_spent_minutes', '30');
  expect(res.status).toBe(409);
});

test('technician starts then completes the work order', async () => {
  const start = await request(app).post(`/api/requests/${requestId}/start`).set('Authorization', `Bearer ${techToken}`);
  expect(start.status).toBe(200);
  expect(start.body.request.status).toBe('In Progress');

  const complete = await request(app).post(`/api/requests/${requestId}/complete`).set('Authorization', `Bearer ${techToken}`)
    .field('resolution_notes', 'Replaced the part and tested it').field('time_spent_minutes', '45');
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
  duty.setSimClock('weekend');
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

describe('volunteer routing, duty windows, escalation, reopen, suspension', () => {
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
    await setClock('weekend');
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
    const student = users.body.users.find((u) => u.email === 'test-student@cmms.local');
    expect(Number(student.request_count)).toBeGreaterThan(0);

    // the request list carries the duty-clock info that the dashboard banner shows
    const list = await request(app).get('/api/requests').set('Authorization', `Bearer ${studentToken}`);
    expect(list.body.duty).toEqual(expect.objectContaining({ in_window: expect.any(Boolean), tz: expect.any(String) }));
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
