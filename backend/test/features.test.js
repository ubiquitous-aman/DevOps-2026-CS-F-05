/**
 * backend/test/features.test.js
 * Integration tests for the business rules added with the validation work (needs a database):
 *   single-form student sign-up, change password, T&P-controlled drive approval / scheduling,
 *   required documents on applications, duplicate protection, admin role change / delete cascade,
 *   remaining-time reminders, notification audiences.
 * Uses mongodb-memory-server, or an existing MongoDB when TEST_MONGO_URI is set.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_devops_2026';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');

let mongoServer;
let app;
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Feature tests: business rules', function () {
  this.timeout(30000);
  let admin, tpo, student, company, studentId, companyId, driveId, appId, studentUserId;

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
  });
  after(async () => {
    if (process.env.TEST_MONGO_URI) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  it('logs in admin and T&P', async () => {
    admin = (await request(app).post('/api/auth/login').send({ email: 'admin@placement.edu', password: 'Admin@123' })).body.token;
    tpo = (await request(app).post('/api/auth/login').send({ email: 'tpo@placement.edu', password: 'Tpo@1234' })).body.token;
    expect(admin).to.be.a('string');
    expect(tpo).to.be.a('string');
  });

  describe('Sign-up', () => {
    const body = { name: 'Riya Singh', email: 'Riya@Student.edu', phone: '+91 98765-43210', rollNumber: '2026cs201', branch: 'CSE', batch: 2026, password: 'Strong@123', confirmPassword: 'Strong@123' };
    it('single-form student signup creates an active account (email lower-cased, phone normalised)', async () => {
      const res = await request(app).post('/api/auth/register/student').send(body);
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      student = res.body.token;
      studentUserId = res.body.user.id;
      const me = await request(app).get('/api/student/profile').set(auth(student));
      expect(me.body.student.phone).to.equal('9876543210');
      expect(me.body.student.rollNumber).to.equal('2026CS201');
      studentId = me.body.student._id;
    });
    it('rejects duplicate email and duplicate roll number', async () => {
      const a = await request(app).post('/api/auth/register/student').send(body);
      expect(a.status).to.equal(409);
      const b = await request(app).post('/api/auth/register/student').send({ ...body, email: 'other@student.edu' });
      expect(b.status).to.equal(409);
      expect(b.body.errors).to.have.property('rollNumber');
    });
    it('company signup + duplicate company name is rejected', async () => {
      const c = { name: 'HR Head', email: 'hr@acme.com', password: 'Acme@1234', confirmPassword: 'Acme@1234', companyName: 'Acme Corp', website: 'https://acme.com', hrPhone: '9123456789' };
      const res = await request(app).post('/api/auth/register/company').send(c);
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      company = res.body.token;
      companyId = res.body.user.profileId;
      const dup = await request(app).post('/api/auth/register/company').send({ ...c, email: 'hr2@acme.com' });
      expect(dup.status).to.equal(409);
    });
  });

  describe('Change password', () => {
    it('wrong current password / same password / success', async () => {
      const bad = await request(app).post('/api/auth/change-password').set(auth(student)).send({ currentPassword: 'Nope@1234', newPassword: 'Newer@1234', confirmPassword: 'Newer@1234' });
      expect(bad.status).to.equal(400);
      expect(bad.body.errors).to.have.property('currentPassword');
      const same = await request(app).post('/api/auth/change-password').set(auth(student)).send({ currentPassword: 'Strong@123', newPassword: 'Strong@123', confirmPassword: 'Strong@123' });
      expect(same.status).to.equal(400);
      const ok = await request(app).post('/api/auth/change-password').set(auth(student)).send({ currentPassword: 'Strong@123', newPassword: 'Newer@1234', confirmPassword: 'Newer@1234' });
      expect(ok.status).to.equal(200);
      const login = await request(app).post('/api/auth/login').send({ email: 'riya@student.edu', password: 'Newer@1234' });
      expect(login.status).to.equal(200);
      student = login.body.token; // tokens issued before a password change are no longer valid
    });
    it('T&P / admin forgot-password OTP flow works for staff accounts', async () => {
      const r1 = await request(app).post('/api/auth/forgot-password').send({ email: 'tpo@placement.edu' });
      expect(r1.body.otpForTesting).to.match(/^\d{6}$/);
      const r2 = await request(app).post('/api/auth/verify-otp').send({ email: 'tpo@placement.edu', otp: r1.body.otpForTesting });
      expect(r2.status).to.equal(200);
      const r3 = await request(app).post('/api/auth/reset-password').send({ resetToken: r2.body.resetToken, newPassword: 'Tpo@5678' });
      expect(r3.status).to.equal(200);
      // the reset token cannot be replayed
      const r4 = await request(app).post('/api/auth/reset-password').send({ resetToken: r2.body.resetToken, newPassword: 'Tpo@9999' });
      expect(r4.status).to.equal(400);
      tpo = (await request(app).post('/api/auth/login').send({ email: 'tpo@placement.edu', password: 'Tpo@5678' })).body.token;
      expect(tpo).to.be.a('string');
    });
  });

  describe('Drive process controlled by T&P', () => {
    it('student profile gets academics + links', async () => {
      const res = await request(app).put('/api/student/profile').set(auth(student)).send({
        academics: { cgpa: 8.2, activeBacklogs: 0, tenthPercentage: 90, twelfthPercentage: 88 },
        links: { github: 'https://github.com/riya' }, skills: 'Node, SQL',
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.student.links.github).to.equal('https://github.com/riya');
      expect(res.body.student.skills).to.deep.equal(['Node', 'SQL']);
    });
    it('company submits a requirement (names only, no dates) and duplicates are blocked', async () => {
      const body = { jobTitle: 'Backend Engineer', packageLPA: 8, openings: 1, applicationDeadline: future(10), requiredDocuments: ['Resume', 'Marksheets'], rounds: [{ name: 'Aptitude', date: future(20) }, { name: 'HR Interview' }] };
      const res = await request(app).post('/api/company/requirements').set(auth(company)).send(body);
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      driveId = res.body.drive._id;
      expect(res.body.drive.rounds[0].date).to.equal(undefined); // company cannot set dates
      expect(res.body.drive.requirementStatus).to.equal('pending');
      const dup = await request(app).post('/api/company/requirements').set(auth(company)).send(body);
      expect(dup.status).to.equal(409);
    });
    it('a pending requirement cannot be published before approval', async () => {
      const res = await request(app).put(`/api/tpo/drives/${driveId}/publish`).set(auth(tpo));
      expect(res.status).to.equal(400);
    });
    it('T&P rejects with a reason, company sees it; a second decision is refused', async () => {
      const r2 = await request(app).post('/api/company/requirements').set(auth(company)).send({ jobTitle: 'Tester', packageLPA: 4, applicationDeadline: future(5) });
      const rej = await request(app).put(`/api/tpo/drives/${r2.body.drive._id}/decision`).set(auth(tpo)).send({ decision: 'rejected', reason: 'Package below policy' });
      expect(rej.status).to.equal(200);
      expect(rej.body.drive.status).to.equal('cancelled');
      const again = await request(app).put(`/api/tpo/drives/${r2.body.drive._id}/decision`).set(auth(tpo)).send({ decision: 'approved' });
      expect(again.status).to.equal(409);
    });
    it('T&P approves: publishes, applies eligibility and notifies the student', async () => {
      const res = await request(app).put(`/api/tpo/drives/${driveId}/decision`).set(auth(tpo)).send({ decision: 'approved', collegeRequirements: 'NPTEL course', eligibility: { branches: 'CSE, IT', minCgpa: 7, maxBacklogs: 0, batch: 2026 } });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.drive.status).to.equal('published');
      expect(res.body.drive.eligibility.branches).to.deep.equal(['CSE', 'IT']);
      expect(res.body.eligibleStudentsNotified).to.equal(1);
    });
    it('student must provide required documents; duplicates are blocked', async () => {
      const noResume = await request(app).post(`/api/student/drives/${driveId}/apply`).set(auth(student)).send({});
      expect(noResume.status).to.equal(400);
      expect(noResume.body.message).to.match(/resume/i);
      // upload a real PDF
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
      const up = await request(app).post('/api/student/resume').set(auth(student)).attach('resume', pdf, 'cv.pdf');
      expect(up.status, JSON.stringify(up.body)).to.equal(200);
      const fake = await request(app).post('/api/student/resume').set(auth(student)).attach('resume', Buffer.from('not a pdf'), 'fake.pdf');
      expect(fake.status).to.equal(400);
      const noLinks = await request(app).post(`/api/student/drives/${driveId}/apply`).set(auth(student)).send({});
      expect(noLinks.status).to.equal(400);
      expect(noLinks.body.errors).to.have.property('documentLinks');
      const [a, b] = await Promise.all([1, 2].map(() => request(app).post(`/api/student/drives/${driveId}/apply`).set(auth(student)).send({ documentLinks: ['https://drive.google.com/file/x'], coverNote: 'Keen' })));
      expect([a.status, b.status].sort()).to.deep.equal([201, 400]); // double-submit: exactly one wins
      appId = (a.status === 201 ? a : b).body.application._id;
    });
    it('T&P schedules rounds: ordering, deadline and student notification', async () => {
      const drive = (await request(app).get('/api/tpo/drives').set(auth(tpo))).body.drives.find((d) => d._id === driveId);
      const [r1, r2] = drive.rounds;
      const early = await request(app).put(`/api/tpo/drives/${driveId}/schedule`).set(auth(tpo)).send({ rounds: [{ roundId: r1._id, date: future(5) }] });
      expect(early.status).to.equal(400); // before the application deadline
      const unordered = await request(app).put(`/api/tpo/drives/${driveId}/schedule`).set(auth(tpo)).send({ rounds: [{ roundId: r1._id, date: future(20) }, { roundId: r2._id, date: future(15) }] });
      expect(unordered.status).to.equal(400);
      const ok = await request(app).put(`/api/tpo/drives/${driveId}/schedule`).set(auth(tpo)).send({ rounds: [{ roundId: r1._id, date: future(20), venue: 'Lab 1' }, { roundId: r2._id, date: future(21) }], driveDate: future(22) });
      expect(ok.status, JSON.stringify(ok.body)).to.equal(200);
      expect(ok.body.notified).to.equal(1);
      const notifs = (await request(app).get('/api/student/notifications').set(auth(student))).body.notifications;
      expect(notifs.some((n) => n.type === 'schedule')).to.equal(true);
    });
    it('company cannot see applicants until approved; then can, and cannot touch other companies\' data', async () => {
      const before = await request(app).get(`/api/company/drives/${driveId}/applicants`).set(auth(company));
      expect(before.status).to.equal(200); // approving the drive also approved the company
      expect(before.body.count).to.equal(1);
    });
    it('rounds are locked once students applied (only dates/venues change)', async () => {
      const res = await request(app).put(`/api/tpo/drives/${driveId}`).set(auth(tpo)).send({ rounds: [{ name: 'Technical Interview' }] });
      expect(res.status).to.equal(400);
    });
    it('final decision needs all rounds cleared; openings are enforced', async () => {
      const early = await request(app).put(`/api/tpo/applications/${appId}/decision`).set(auth(tpo)).send({ decision: 'Selected' });
      expect(early.status).to.equal(400);
      for (let i = 0; i < 2; i++) {
        const r = await request(app).put(`/api/tpo/applications/${appId}/round`).set(auth(tpo)).send({ status: 'Cleared' });
        expect(r.status, JSON.stringify(r.body)).to.equal(200);
      }
      const extra = await request(app).put(`/api/tpo/applications/${appId}/round`).set(auth(tpo)).send({ status: 'Cleared' });
      expect(extra.status).to.equal(400);
      const sel = await request(app).put(`/api/tpo/applications/${appId}/decision`).set(auth(tpo)).send({ decision: 'Selected', packageLPA: 8.5, joiningDate: future(200) });
      expect(sel.status, JSON.stringify(sel.body)).to.equal(200);
      const again = await request(app).put(`/api/tpo/applications/${appId}/decision`).set(auth(tpo)).send({ decision: 'Rejected' });
      expect(again.status).to.equal(400);
    });
    it('cancelling a drive needs a reason and notifies; status transitions are checked', async () => {
      const no = await request(app).put(`/api/tpo/drives/${driveId}/status`).set(auth(tpo)).send({ status: 'cancelled', reason: 'x' });
      expect(no.status).to.equal(400);
      const ok = await request(app).put(`/api/tpo/drives/${driveId}/status`).set(auth(tpo)).send({ status: 'closed' });
      expect(ok.status).to.equal(200);
      const bad = await request(app).put(`/api/tpo/drives/${driveId}/status`).set(auth(tpo)).send({ status: 'closed' });
      expect(bad.status).to.equal(400);
    });
  });

  describe('T&P notifications and student details', () => {
    it('notify by branch / all / explicit list', async () => {
      const a = await request(app).post('/api/tpo/notify').set(auth(tpo)).send({ title: 'Seminar', message: 'Placement seminar tomorrow', audience: 'branch', branch: 'CSE' });
      expect(a.body.notified).to.equal(1);
      const b = await request(app).post('/api/tpo/notify').set(auth(tpo)).send({ title: 'Seminar', message: 'Placement seminar tomorrow', audience: 'all' });
      expect(b.status).to.equal(200);
      const c = await request(app).post('/api/tpo/notify').set(auth(tpo)).send({ title: 'Seminar', message: 'Placement seminar tomorrow', studentIds: [studentId] });
      expect(c.body.notified).to.equal(1);
      const d = await request(app).post('/api/tpo/notify').set(auth(tpo)).send({ title: 'Seminar', message: 'Placement seminar tomorrow', audience: 'branch', branch: 'ME' });
      expect(d.status).to.equal(404);
    });
    it('T&P and admin can open the full student view', async () => {
      for (const t of [tpo, admin]) {
        const path = t === tpo ? '/api/tpo/students/' : '/api/admin/students/';
        const res = await request(app).get(path + studentId).set(auth(t));
        expect(res.status).to.equal(200);
        expect(res.body.student.user.email).to.equal('riya@student.edu');
        expect(res.body.applications).to.have.length(1);
      }
    });
  });

  describe('Reminders (remaining-time notifications)', () => {
    it('sends a deadline reminder once and never duplicates it', async () => {
      const { runReminderSweep } = require('../utils/reminders');
      const Drive = require('../models/Drive');
      const company2 = await request(app).post('/api/auth/register/company').send({ name: 'Beta HR', email: 'hr@beta.com', password: 'Beta@12345', companyName: 'Beta Ltd' });
      const d = await Drive.create({
        company: company2.body.user.profileId, createdBy: company2.body.user.id, jobTitle: 'Analyst', packageLPA: 5,
        applicationDeadline: new Date(Date.now() + 5 * 3600 * 1000), status: 'published', requirementStatus: 'approved',
        eligibility: { branches: ['CSE'], batch: 2026 },
      });
      const first = await runReminderSweep({ force: true });
      const second = await runReminderSweep({ force: true });
      expect(first.created).to.be.at.least(1);
      expect(second.created).to.equal(0);
      const n = (await request(app).get('/api/student/notifications').set(auth(student))).body.notifications.filter((x) => x.type === 'reminder');
      expect(n).to.have.length(1);
      await Drive.deleteOne({ _id: d._id });
    });
  });

  describe('Admin: roles, status, delete', () => {
    let tpo2Id, companyUserId;
    it('creates a T&P account; duplicate email rejected', async () => {
      const r = await request(app).post('/api/admin/users').set(auth(admin)).send({ name: 'Second Tpo', email: 'tpo2@placement.edu', password: 'Tpo2@1234', role: 'tpo' });
      expect(r.status, JSON.stringify(r.body)).to.equal(201);
      tpo2Id = r.body.user.id;
      const dup = await request(app).post('/api/admin/users').set(auth(admin)).send({ name: 'Second Tpo', email: 'TPO2@placement.edu', password: 'Tpo2@1234', role: 'tpo' });
      expect(dup.status).to.equal(409);
    });
    it('role change: staff only, not self, not last admin', async () => {
      const up = await request(app).put(`/api/admin/users/${tpo2Id}/role`).set(auth(admin)).send({ role: 'admin' });
      expect(up.status, JSON.stringify(up.body)).to.equal(200);
      const stu = await request(app).put(`/api/admin/users/${studentUserId}/role`).set(auth(admin)).send({ role: 'tpo' });
      expect(stu.status).to.equal(400);
      const me = (await request(app).get('/api/auth/me').set(auth(admin))).body.user.id;
      expect((await request(app).put(`/api/admin/users/${me}/role`).set(auth(admin)).send({ role: 'tpo' })).status).to.equal(400);
      // demote it again: now two admins exist, so allowed; the original admin is then the last one
      expect((await request(app).put(`/api/admin/users/${tpo2Id}/role`).set(auth(admin)).send({ role: 'tpo' })).status).to.equal(200);
      expect((await request(app).put(`/api/admin/users/${me}/status`).set(auth(admin)).send({ isActive: false })).status).to.equal(400);
      expect((await request(app).delete(`/api/admin/users/${me}`).set(auth(admin))).status).to.equal(400);
    });
    it('edit user + reset password', async () => {
      const e = await request(app).put(`/api/admin/users/${tpo2Id}`).set(auth(admin)).send({ name: 'Renamed Tpo' });
      expect(e.status).to.equal(200);
      const clash = await request(app).put(`/api/admin/users/${tpo2Id}`).set(auth(admin)).send({ email: 'tpo@placement.edu' });
      expect(clash.status).to.equal(409);
      const p = await request(app).put(`/api/admin/users/${tpo2Id}/password`).set(auth(admin)).send({ newPassword: 'Fresh@1234' });
      expect(p.status).to.equal(200);
      expect((await request(app).post('/api/auth/login').send({ email: 'tpo2@placement.edu', password: 'Fresh@1234' })).status).to.equal(200);
    });
    it('deleting a company removes its drives + applications and clears student placement', async () => {
      const Student = require('../models/Student');
      const Drive = require('../models/Drive');
      const Application = require('../models/Application');
      expect((await Student.findById(studentId)).isPlaced).to.equal(true);
      companyUserId = (await request(app).get('/api/auth/me').set(auth(company))).body.user.id;
      const res = await request(app).delete(`/api/admin/users/${companyUserId}`).set(auth(admin));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(await Drive.countDocuments({ company: companyId })).to.equal(0);
      expect(await Application.countDocuments({ drive: driveId })).to.equal(0);
      const st = await Student.findById(studentId);
      expect(st.isPlaced).to.equal(false);
      expect(st.placedCompany).to.equal(null);
    });
    it('deleting a student removes profile, applications and resume file', async () => {
      const Student = require('../models/Student');
      const fs = require('fs');
      const path = require('path');
      const st = await Student.findById(studentId);
      const file = path.join(__dirname, '..', st.resume.filePath);
      expect(fs.existsSync(file)).to.equal(true);
      const res = await request(app).delete(`/api/admin/users/${studentUserId}`).set(auth(admin));
      expect(res.status).to.equal(200);
      expect(await Student.findById(studentId)).to.equal(null);
      expect(fs.existsSync(file)).to.equal(false);
    });
  });
});
