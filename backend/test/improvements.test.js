/**
 * backend/test/improvements.test.js
 * Tests for: notification routes for every role, private resumes, one-offer policy, token invalidation after
 * a password change, forced password change, CSV exports, bulk import, bulk round update, T&P <-> company
 * messaging, withdraw notifications, activity-log filters, bulk batch deactivation, calendar export.
 * Uses mongodb-memory-server, or an existing MongoDB when TEST_MONGO_URI is set.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_devops_2026';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;
delete process.env.DREAM_OFFER_MULTIPLIER;

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('Improvements', function () {
  this.timeout(30000);
  let admin, tpo, company, companyId, companyUserId, driveId, lowDriveId;
  const st = {}; // st.s1 = { token, id (profile), userId, appId }

  const signup = async (key, n) => {
    const res = await request(app).post('/api/auth/register/student').send({
      name: `Student ${['Alpha', 'Beta', 'Gamma'][n - 1] || 'Member'}`, email: `imp${n}@student.edu`, phone: `98765432${10 + n}`, rollNumber: `2026IMP${100 + n}`,
      branch: 'CSE', batch: 2026, password: 'Strong@123', confirmPassword: 'Strong@123',
    });
    expect(res.status, JSON.stringify(res.body)).to.equal(201);
    st[key] = { token: res.body.token, userId: res.body.user.id, id: res.body.user.profileId };
    const prof = await request(app).put('/api/student/profile').set(auth(st[key].token))
      .send({ academics: { cgpa: 8, activeBacklogs: 0, tenthPercentage: 85, twelfthPercentage: 85 } });
    expect(prof.status, JSON.stringify(prof.body)).to.equal(200);
  };

  before(async () => {
    if (process.env.TEST_MONGO_URI) process.env.MONGO_URI = process.env.TEST_MONGO_URI;
    else {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create();
      process.env.MONGO_URI = mongoServer.getUri();
    }
    await mongoose.connect(process.env.MONGO_URI);
    await mongoose.connection.dropDatabase();
    app = require('../server');
    const User = require('../models/User');
    await User.create({ name: 'Admin', email: 'admin@placement.edu', password: 'Admin@123', role: 'admin', emailVerified: true });
    await User.create({ name: 'Tpo', email: 'tpo@placement.edu', password: 'Tpo@1234', role: 'tpo', emailVerified: true });
    await require('../models/Notification').init();
    await require('../models/Application').init();

    admin = (await request(app).post('/api/auth/login').send({ email: 'admin@placement.edu', password: 'Admin@123' })).body.token;
    tpo = (await request(app).post('/api/auth/login').send({ email: 'tpo@placement.edu', password: 'Tpo@1234' })).body.token;
    const c = await request(app).post('/api/auth/register/company').send({
      name: 'HR', email: 'hr@imp.com', password: 'Imp@12345', confirmPassword: 'Imp@12345', companyName: 'Imp Corp', hrPhone: '9123456789',
    });
    expect(c.status, JSON.stringify(c.body)).to.equal(201);
    company = c.body.token; companyId = c.body.user.profileId; companyUserId = c.body.user.id;
    await signup('s1', 1); await signup('s2', 2); await signup('s3', 3);

    // company requirement -> T&P approves + publishes (1 round, 1 opening)
    const req = await request(app).post('/api/company/requirements').set(auth(company))
      .send({ jobTitle: 'Dev', packageLPA: 10, openings: 1, applicationDeadline: future(10), rounds: [{ name: 'Aptitude' }] });
    expect(req.status, JSON.stringify(req.body)).to.equal(201);
    driveId = req.body.drive._id;
    const dec = await request(app).put(`/api/tpo/drives/${driveId}/decision`).set(auth(tpo))
      .send({ decision: 'approved', eligibility: { branches: 'CSE', batch: 2026, minCgpa: 6, maxBacklogs: 2 } });
    expect(dec.status, JSON.stringify(dec.body)).to.equal(200);
    for (const k of ['s1', 's2', 's3']) {
      const ap = await request(app).post(`/api/student/drives/${driveId}/apply`).set(auth(st[k].token)).send({});
      expect(ap.status, JSON.stringify(ap.body)).to.equal(201);
      st[k].appId = ap.body.application._id;
    }
  });
  after(async () => {
    if (process.env.TEST_MONGO_URI) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  it('notification inbox works for T&P and companies (and needs a login)', async () => {
    expect((await request(app).get('/api/notifications')).status).to.equal(401);
    const t = await request(app).get('/api/notifications').set(auth(tpo));
    expect(t.status).to.equal(200);
    expect(t.body.unread).to.be.a('number');
    expect(t.body.notifications.some((n) => /requirement/i.test(n.title))).to.equal(true);
    const c = await request(app).get('/api/notifications').set(auth(company));
    expect(c.status).to.equal(200);
    const all = await request(app).put('/api/notifications/read-all').set(auth(tpo));
    expect(all.status).to.equal(200);
    expect((await request(app).get('/api/notifications').set(auth(tpo))).body.unread).to.equal(0);
  });

  it('resumes are private: not served statically, owner / T&P / applied-to company only', async () => {
    const up = await request(app).post('/api/student/resume').set(auth(st.s1.token)).attach('resume', PDF, 'cv.pdf');
    expect(up.status, JSON.stringify(up.body)).to.equal(200);
    expect((await request(app).get(up.body.resume.filePath)).status).to.equal(404); // old public URL is gone
    expect((await request(app).get(`/api/files/resume/${st.s1.id}`)).status).to.equal(401);
    const own = await request(app).get(`/api/files/resume/${st.s1.id}`).set(auth(st.s1.token));
    expect(own.status).to.equal(200);
    expect(own.headers['content-type']).to.match(/pdf/);
    expect((await request(app).get(`/api/files/resume/${st.s1.id}`).set(auth(st.s2.token))).status).to.equal(403);
    expect((await request(app).get(`/api/files/resume/${st.s1.id}`).set(auth(tpo))).status).to.equal(200);
    expect((await request(app).get(`/api/files/resume/${st.s1.id}`).set(auth(company))).status).to.equal(200); // s1 applied to its drive
    expect((await request(app).get(`/api/files/resume/${st.s2.id}`).set(auth(tpo))).status).to.equal(404); // s2 has no resume
  });

  it('withdrawing an application notifies the T&P cell and the company', async () => {
    const w = await request(app).put(`/api/student/applications/${st.s3.appId}/withdraw`).set(auth(st.s3.token));
    expect(w.status, JSON.stringify(w.body)).to.equal(200);
    const tn = (await request(app).get('/api/notifications').set(auth(tpo))).body.notifications;
    expect(tn.some((n) => /withdr/i.test(n.title))).to.equal(true);
    const cn = (await request(app).get('/api/notifications').set(auth(company))).body.notifications;
    expect(cn.some((n) => /withdr/i.test(n.title))).to.equal(true);
  });

  it('T&P can bulk-clear a round; CSV export lists applicants; selecting one fills the opening', async () => {
    const bulk = await request(app).put('/api/tpo/applications/bulk-round').set(auth(tpo))
      .send({ ids: [st.s1.appId, st.s2.appId, st.s3.appId], status: 'Cleared', feedback: 'Good' });
    expect(bulk.status, JSON.stringify(bulk.body)).to.equal(200);
    expect(bulk.body.updated).to.equal(2); // s3 withdrew
    expect(bulk.body.failed).to.equal(1);
    expect((await request(app).put('/api/tpo/applications/bulk-round').set(auth(tpo)).send({ ids: ['nope'], status: 'Cleared' })).status).to.equal(400);

    const csv = await request(app).get(`/api/tpo/drives/${driveId}/export`).set(auth(tpo));
    expect(csv.status).to.equal(200);
    expect(csv.headers['content-type']).to.match(/text\/csv/);
    expect(csv.text).to.include('Roll Number');
    expect(csv.text).to.include('2026IMP101');
    expect((await request(app).get(`/api/tpo/drives/${driveId}/export`).set(auth(st.s1.token))).status).to.equal(403);

    const ccsv = await request(app).get(`/api/company/drives/${driveId}/export`).set(auth(company));
    expect(ccsv.status).to.equal(200);
    expect(ccsv.text).to.include('2026IMP102');

    const sel = await request(app).put(`/api/tpo/applications/${st.s1.appId}/decision`).set(auth(tpo)).send({ decision: 'Selected', packageLPA: 10 });
    expect(sel.status, JSON.stringify(sel.body)).to.equal(200);
    const full = await request(app).put(`/api/tpo/applications/${st.s2.appId}/decision`).set(auth(tpo)).send({ decision: 'Selected' });
    expect(full.status).to.equal(400);
  });

  it('one-offer policy: a placed student cannot apply to a lower-paying drive', async () => {
    const req = await request(app).post('/api/company/requirements').set(auth(company))
      .send({ jobTitle: 'Support Engineer', packageLPA: 5, applicationDeadline: future(10), rounds: [{ name: 'HR Interview' }] });
    expect(req.status, JSON.stringify(req.body)).to.equal(201);
    lowDriveId = req.body.drive._id;
    const dec = await request(app).put(`/api/tpo/drives/${lowDriveId}/decision`).set(auth(tpo))
      .send({ decision: 'approved', eligibility: { branches: 'CSE', batch: 2026 } });
    expect(dec.status, JSON.stringify(dec.body)).to.equal(200);

    const blocked = await request(app).post(`/api/student/drives/${lowDriveId}/apply`).set(auth(st.s1.token)).send({});
    expect(blocked.status).to.equal(403);
    expect(blocked.body.message).to.match(/already placed/i);
    const list = (await request(app).get('/api/student/drives').set(auth(st.s1.token))).body.drives;
    expect(list.find((d) => d._id === lowDriveId).eligible).to.equal(false);
    // a student who is not placed can still apply
    expect((await request(app).post(`/api/student/drives/${lowDriveId}/apply`).set(auth(st.s2.token)).send({})).status).to.equal(201);
  });

  it('T&P and company can message each other through the notification inbox', async () => {
    const m = await request(app).post('/api/tpo/message-company').set(auth(tpo)).send({ companyId, subject: 'Schedule', message: 'Please confirm the date' });
    expect(m.status, JSON.stringify(m.body)).to.equal(200);
    const cn = (await request(app).get('/api/notifications').set(auth(company))).body.notifications;
    expect(cn.some((n) => /Schedule/.test(n.title))).to.equal(true);
    expect((await request(app).post('/api/tpo/message-company').set(auth(tpo)).send({ companyId: 'bad', subject: 'x', message: 'y' })).status).to.equal(400);
  });

  it('tokens issued before a password change stop working; the new token works', async () => {
    const old = jwt.sign({ id: st.s2.userId, role: 'student', iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET);
    expect((await request(app).get('/api/student/profile').set(auth(old))).status).to.equal(200);
    const ch = await request(app).post('/api/auth/change-password').set(auth(st.s2.token))
      .send({ currentPassword: 'Strong@123', newPassword: 'Newer@1234', confirmPassword: 'Newer@1234' });
    expect(ch.status, JSON.stringify(ch.body)).to.equal(200);
    expect(ch.body.token).to.be.a('string');
    expect((await request(app).get('/api/student/profile').set(auth(old))).status).to.equal(401);
    expect((await request(app).get('/api/student/profile').set(auth(ch.body.token))).status).to.equal(200);
  });

  it('accounts with temporary passwords must change them (flag cleared after the change)', async () => {
    const mk = await request(app).post('/api/admin/users').set(auth(admin)).send({ name: 'New Tpo', email: 'newtpo@placement.edu', password: 'Temp@12345', role: 'tpo' });
    expect(mk.status, JSON.stringify(mk.body)).to.equal(201);
    const login = await request(app).post('/api/auth/login').send({ email: 'newtpo@placement.edu', password: 'Temp@12345' });
    expect(login.body.user.mustChangePassword).to.equal(true);
    const ch = await request(app).post('/api/auth/change-password').set(auth(login.body.token))
      .send({ currentPassword: 'Temp@12345', newPassword: 'Mine@12345', confirmPassword: 'Mine@12345' });
    expect(ch.status).to.equal(200);
    const me = await request(app).get('/api/auth/me').set(auth(ch.body.token));
    expect(me.body.user.mustChangePassword).to.equal(false);
  });

  it('T&P can export students and bulk-import them from CSV rows', async () => {
    const csv = await request(app).get('/api/tpo/export/students?branch=CSE').set(auth(tpo));
    expect(csv.status).to.equal(200);
    expect(csv.text).to.include('2026IMP101');
    expect((await request(app).get('/api/tpo/export/students?branch=XYZ').set(auth(tpo))).status).to.equal(400);

    const res = await request(app).post('/api/tpo/students/bulk').set(auth(tpo)).send({ rows: [
      { name: 'Bulk One', email: 'bulk1@student.edu', phone: '9876500001', rollNumber: '2026BLK001', branch: 'ECE', batch: '2026' },
      { name: 'Bulk Bad', email: 'not-an-email', rollNumber: '2026BLK002', branch: 'ECE', batch: 2026 },
      { name: 'Dup Mail', email: 'imp1@student.edu', rollNumber: '2026BLK003', branch: 'ECE', batch: 2026 },
    ] });
    expect(res.status, JSON.stringify(res.body)).to.equal(201);
    expect(res.body.created).to.equal(1);
    expect(res.body.skipped).to.equal(2);
    const cred = res.body.credentials[0];
    const login = await request(app).post('/api/auth/login').send({ email: 'bulk1@student.edu', password: cred.tempPassword });
    expect(login.status, JSON.stringify(login.body)).to.equal(200);
    expect(login.body.user.mustChangePassword).to.equal(true);
    expect((await request(app).post('/api/tpo/students/bulk').set(auth(tpo)).send({ rows: [] })).status).to.equal(400);
    expect((await request(app).post('/api/tpo/students/bulk').set(auth(st.s1.token)).send({ rows: [] })).status).to.equal(403);
  });

  it('student calendar (.ics) lists upcoming deadlines', async () => {
    const res = await request(app).get('/api/student/calendar').set(auth(st.s1.token));
    expect(res.status).to.equal(200);
    expect(res.headers['content-type']).to.match(/text\/calendar/);
    expect(res.text).to.include('BEGIN:VCALENDAR');
    expect(res.text).to.include('END:VCALENDAR');
  });

  it('activity logs can be filtered and paged; admin can export users', async () => {
    const all = await request(app).get('/api/admin/activity-logs').set(auth(admin));
    expect(all.status).to.equal(200);
    expect(all.body.actions).to.include('LOGIN');
    const f = await request(app).get('/api/admin/activity-logs?action=LOGIN&limit=5').set(auth(admin));
    expect(f.body.logs.length).to.be.at.least(1);
    expect(f.body.logs.every((l) => l.action === 'LOGIN')).to.equal(true);
    const q = await request(app).get('/api/admin/activity-logs?q=Imp%20Corp').set(auth(admin));
    expect(q.status).to.equal(200);
    const csv = await request(app).get('/api/admin/export/users').set(auth(admin));
    expect(csv.status).to.equal(200);
    expect(csv.text).to.include('admin@placement.edu');
  });

  it('admin can deactivate and re-activate a whole graduating batch', async () => {
    const off = await request(app).put('/api/admin/users/bulk-status').set(auth(admin)).send({ batch: 2026, isActive: false });
    expect(off.status, JSON.stringify(off.body)).to.equal(200);
    expect(off.body.changed).to.be.at.least(3);
    expect((await request(app).get('/api/student/profile').set(auth(st.s1.token))).status).to.equal(403);
    const on = await request(app).put('/api/admin/users/bulk-status').set(auth(admin)).send({ batch: 2026, isActive: true });
    expect(on.status).to.equal(200);
    expect((await request(app).get('/api/student/profile').set(auth(st.s1.token))).status).to.equal(200);
    expect((await request(app).put('/api/admin/users/bulk-status').set(auth(admin)).send({ batch: 'abc', isActive: true })).status).to.equal(400);
  });
});
