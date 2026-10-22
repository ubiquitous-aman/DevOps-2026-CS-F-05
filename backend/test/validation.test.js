/**
 * backend/test/validation.test.js
 * Validation-layer tests that need NO database: the API validates input BEFORE it touches the DB, so every
 * "bad input -> 400" case can be verified with the User lookup of the auth middleware stubbed out.
 * Run with:  npm run test:validation
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_devops_2026';

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../server');
const User = require('../models/User');
const {
  Validator, passwordProblem, parseUrl, validateRounds, isValidObjectId,
} = require('../utils/validators');

const ID = () => new mongoose.Types.ObjectId().toString();
const tokenFor = (role) => {
  const id = ID();
  User.findById = async () => ({ _id: id, id, role, isActive: true, name: 'T', email: 't@t.com' });
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
};
const as = (role) => `Bearer ${tokenFor(role)}`;
const future = (days = 10) => new Date(Date.now() + days * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();

describe('Validator unit tests', () => {
  it('password policy', () => {
    expect(passwordProblem('short1!A')).to.equal(null);
    expect(passwordProblem('abc')).to.match(/8 characters/);
    expect(passwordProblem('alllowercase1!')).to.match(/uppercase/);
    expect(passwordProblem('ALLUPPERCASE1!')).to.match(/lowercase/);
    expect(passwordProblem('NoDigits!!')).to.match(/number/);
    expect(passwordProblem('NoSpecial123')).to.match(/special/);
  });
  it('url / objectId / phone / email helpers', () => {
    expect(parseUrl('https://drive.google.com/x')).to.be.a('string');
    expect(parseUrl('javascript:alert(1)')).to.equal(null);
    expect(parseUrl('ftp://a.com')).to.equal(null);
    expect(parseUrl('not a url')).to.equal(null);
    expect(isValidObjectId(ID())).to.equal(true);
    expect(isValidObjectId('123')).to.equal(false);
    const v = new Validator({ p: '+91 98765-43210', bad: '12345', e: ' A@B.com ', badE: 'a@b' })
      .phone('p').phone('bad').email('e').email('badE');
    expect(v.data.p).to.equal('9876543210');
    expect(v.data.e).to.equal('a@b.com');
    expect(v.errors).to.have.keys('bad', 'badE');
  });
  it('numbers: range, integer, decimals, type confusion', () => {
    const v = new Validator({ a: '11', b: 2.5, c: '', d: true, e: '8.555', f: '8.5' })
      .number('a', { max: 10 }).integer('b').number('c', { required: true }).number('d').number('e', { decimals: 2 }).number('f', { max: 10 });
    expect(Object.keys(v.errors)).to.have.members(['a', 'b', 'c', 'd', 'e']);
    expect(v.data.f).to.equal(8.5);
  });
  it('dates: future / after / garbage', () => {
    const v = new Validator({ a: past(), b: 'garbage', c: future(), d: future(1) })
      .date('a', { future: true }).date('b').date('c', { future: true }).date('d', { after: new Date(future(5)) });
    expect(Object.keys(v.errors)).to.have.members(['a', 'b', 'd']);
  });
  it('rounds: company cannot set dates; T&P dates must be ordered and after the deadline', () => {
    const company = validateRounds([{ name: 'Aptitude', date: future(), venue: 'Hall' }], { allowSchedule: false });
    expect(company.rounds[0]).to.not.have.property('date');
    expect(company.rounds[0]).to.not.have.property('venue');
    const bad = validateRounds([{ name: 'Aptitude', date: future(20) }, { name: 'HR Interview', date: future(10) }], { allowSchedule: true });
    expect(bad.errors[0].message).to.match(/before Round 1/);
    const early = validateRounds([{ name: 'Aptitude', date: future(2) }], { allowSchedule: true, deadline: new Date(future(5)) });
    expect(early.errors[0].message).to.match(/after the application deadline/);
    expect(validateRounds([{ name: 'Nope' }], { allowSchedule: true }).errors).to.have.length(1);
  });
});

describe('API input validation (no database needed)', function () {
  this.timeout(10000);
  const expect400 = (res, field) => {
    expect(res.status, JSON.stringify(res.body)).to.equal(400);
    expect(res.body.success).to.equal(false);
    if (field) expect(res.body.errors || {}, JSON.stringify(res.body)).to.have.property(field);
  };

  describe('Auth', () => {
    it('login: missing / malformed fields', async () => {
      expect400(await request(app).post('/api/auth/login').send({}), 'email');
      expect400(await request(app).post('/api/auth/login').send({ email: 'nope', password: 'x' }), 'email');
      expect400(await request(app).post('/api/auth/login').send({ email: 'a@b.com' }), 'password');
    });
    it('login: NoSQL operator injection is rejected', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } });
      expect(res.status).to.equal(400);
    });
    it('student signup: every field validated', async () => {
      const res = await request(app).post('/api/auth/register/student').send({
        name: '1', email: 'bad', phone: '123', rollNumber: '!', branch: 'XYZ', batch: 1990, password: 'weak', confirmPassword: 'other',
      });
      expect400(res);
      ['name', 'email', 'phone', 'rollNumber', 'branch', 'batch', 'password'].forEach((f) => expect(res.body.errors).to.have.property(f));
    });
    it('student signup: password confirmation mismatch', async () => {
      const res = await request(app).post('/api/auth/register/student').send({
        name: 'Aman Sharma', email: 'a@b.com', phone: '9876543210', rollNumber: '2026CS1', branch: 'CSE', batch: 2026, password: 'Strong@123', confirmPassword: 'Strong@124',
      });
      expect400(res, 'confirmPassword');
    });
    it('company signup: required + url + phone + password', async () => {
      const res = await request(app).post('/api/auth/register/company').send({
        name: 'HR', email: 'x', password: 'abc', companyName: '', website: 'javascript:alert(1)', hrPhone: '1',
      });
      expect400(res);
      ['email', 'password', 'companyName', 'website', 'hrPhone'].forEach((f) => expect(res.body.errors).to.have.property(f));
    });
    it('forgot / verify / reset password validate input', async () => {
      expect400(await request(app).post('/api/auth/forgot-password').send({ email: 'nope' }), 'email');
      expect400(await request(app).post('/api/auth/verify-otp').send({ email: 'a@b.com', otp: '12' }), 'otp');
      expect400(await request(app).post('/api/auth/reset-password').send({ resetToken: 'x', newPassword: 'weak' }), 'newPassword');
    });
    it('change password: all roles, strong password + confirmation required', async () => {
      for (const role of ['student', 'company', 'tpo', 'admin']) {
        const h = as(role);
        expect400(await request(app).post('/api/auth/change-password').set('Authorization', h).send({}), 'currentPassword');
        expect400(await request(app).post('/api/auth/change-password').set('Authorization', h)
          .send({ currentPassword: 'x', newPassword: 'weak', confirmPassword: 'weak' }), 'newPassword');
        expect400(await request(app).post('/api/auth/change-password').set('Authorization', h)
          .send({ currentPassword: 'x', newPassword: 'Strong@123', confirmPassword: 'Different@1' }), 'confirmPassword');
      }
    });
  });

  describe('Student', () => {
    it('profile update rejects out-of-range academics, bad phone, bad branch, bad links', async () => {
      const res = await request(app).put('/api/student/profile').set('Authorization', as('student')).send({
        branch: 'XYZ', batch: 1800, phone: '123',
        academics: { cgpa: 11, tenthPercentage: 101, twelfthPercentage: -1, activeBacklogs: 2.5 },
        links: { github: 'not-a-url' }, skills: 'a'.repeat(50),
      });
      expect400(res);
      ['branch', 'batch', 'phone', 'academics.cgpa', 'academics.tenthPercentage', 'academics.twelfthPercentage', 'academics.activeBacklogs', 'links.github', 'skills']
        .forEach((f) => expect(res.body.errors, f).to.have.property(f));
    });
    it('application form validates note length and document links', async () => {
      const res = await request(app).post(`/api/student/drives/${ID()}/apply`).set('Authorization', as('student'))
        .send({ coverNote: 'x'.repeat(501), documentLinks: ['javascript:alert(1)'] });
      expect400(res);
      expect(res.body.errors).to.have.keys('coverNote', 'documentLinks');
    });
    it('malformed ids in the URL are rejected before any DB access', async () => {
      const res = await request(app).post('/api/student/drives/123/apply').set('Authorization', as('student')).send({});
      expect400(res);
    });
    it('resume upload with no file / wrong type', async () => {
      const h = as('student');
      expect400(await request(app).post('/api/student/resume').set('Authorization', h));
      const res = await request(app).post('/api/student/resume').set('Authorization', h).attach('resume', Buffer.from('MZ binary'), 'virus.exe');
      expect400(res);
    });
  });

  describe('Company', () => {
    it('requirement: required fields, CTC, openings, deadline, documents', async () => {
      const res = await request(app).post('/api/company/requirements').set('Authorization', as('company')).send({
        jobTitle: 'x', packageLPA: -3, openings: 0, applicationDeadline: past(), requiredDocuments: ['Passport'], jobType: 'Gig',
      });
      expect400(res);
      ['jobTitle', 'packageLPA', 'openings', 'applicationDeadline', 'requiredDocuments', 'jobType'].forEach((f) => expect(res.body.errors, f).to.have.property(f));
    });
    it('requirement: empty body', async () => {
      const res = await request(app).post('/api/company/requirements').set('Authorization', as('company')).send({});
      expect400(res);
      expect(res.body.errors).to.include.keys('jobTitle', 'packageLPA', 'applicationDeadline');
    });
    it('requirement: deadline too far ahead / garbage', async () => {
      expect400(await request(app).post('/api/company/requirements').set('Authorization', as('company'))
        .send({ jobTitle: 'Engineer', packageLPA: 5, applicationDeadline: future(900) }), 'applicationDeadline');
      expect400(await request(app).post('/api/company/requirements').set('Authorization', as('company'))
        .send({ jobTitle: 'Engineer', packageLPA: 5, applicationDeadline: 'tomorrow-ish' }), 'applicationDeadline');
    });
    it('profile + feedback + message validated', async () => {
      const h = as('company');
      expect400(await request(app).put('/api/company/profile').set('Authorization', h)
        .send({ website: 'ftp://x', hrContact: { phone: '1', email: 'bad' } }));
      expect400(await request(app).put(`/api/company/applications/${ID()}/feedback`).set('Authorization', h).send({ feedback: '' }), 'feedback');
      expect400(await request(app).post('/api/company/message-tpo').set('Authorization', h).send({ subject: '', message: '' }));
    });
  });

  describe('T&P', () => {
    const goodDrive = () => ({ company: ID(), jobTitle: 'Systems Engineer', packageLPA: 6, applicationDeadline: future(10) });
    it('create drive: bad company id, CTC, eligibility, rounds, drive date', async () => {
      const res = await request(app).post('/api/tpo/drives').set('Authorization', as('tpo')).send({
        company: 'zzz', jobTitle: 'ab', packageLPA: 0, applicationDeadline: past(), openings: 1.5,
        eligibility: { minCgpa: 12, maxBacklogs: -1, min10th: 120, branches: ['XYZ'], batch: 1900 },
        rounds: [{ name: 'Nope' }], driveDate: past(),
      });
      expect400(res);
      ['company', 'jobTitle', 'packageLPA', 'applicationDeadline', 'openings', 'eligibility.minCgpa', 'eligibility.maxBacklogs', 'eligibility.min10th', 'eligibility.branches', 'eligibility.batch', 'rounds.0']
        .forEach((f) => expect(res.body.errors, f).to.have.property(f));
    });
    it('create drive: interview before the deadline / out of order is rejected', async () => {
      const dl = future(10);
      expect400(await request(app).post('/api/tpo/drives').set('Authorization', as('tpo'))
        .send({ ...goodDrive(), applicationDeadline: dl, rounds: [{ name: 'Aptitude', date: future(5) }] }), 'rounds.0');
      expect400(await request(app).post('/api/tpo/drives').set('Authorization', as('tpo'))
        .send({ ...goodDrive(), applicationDeadline: dl, rounds: [{ name: 'Aptitude', date: future(30) }, { name: 'HR Interview', date: future(20) }] }), 'rounds.1');
    });
    it('create drive: drive date must be after the deadline', async () => {
      expect400(await request(app).post('/api/tpo/drives').set('Authorization', as('tpo'))
        .send({ ...goodDrive(), driveDate: future(3) }), 'driveDate');
    });
    it('decision endpoints validate enum + reason', async () => {
      const h = as('tpo');
      expect400(await request(app).put(`/api/tpo/companies/${ID()}/approve`).set('Authorization', h).send({ decision: 'maybe' }), 'decision');
      expect400(await request(app).put(`/api/tpo/companies/${ID()}/approve`).set('Authorization', h).send({ decision: 'rejected' }), 'reason');
      expect400(await request(app).put(`/api/tpo/drives/${ID()}/decision`).set('Authorization', h).send({ decision: 'rejected', reason: 'no' }), 'reason');
      expect400(await request(app).put(`/api/tpo/drives/${ID()}/status`).set('Authorization', h).send({ status: 'published' }), 'status');
      expect400(await request(app).put(`/api/tpo/drives/${ID()}/status`).set('Authorization', h).send({ status: 'cancelled' }), 'reason');
    });
    it('application status changes validated', async () => {
      const h = as('tpo');
      expect400(await request(app).put(`/api/tpo/applications/${ID()}/round`).set('Authorization', h).send({ status: 'Pending' }), 'status');
      expect400(await request(app).put(`/api/tpo/applications/${ID()}/decision`).set('Authorization', h).send({ decision: 'Selected', packageLPA: -1, joiningDate: past() }));
    });
    it('notifications validated', async () => {
      const h = as('tpo');
      expect400(await request(app).post('/api/tpo/notify').set('Authorization', h).send({ title: '', message: '' }));
      expect400(await request(app).post('/api/tpo/notify').set('Authorization', h).send({ title: 'Hello', message: 'World', studentIds: [] }), 'studentIds');
      expect400(await request(app).post('/api/tpo/notify').set('Authorization', h).send({ title: 'Hello', message: 'World', audience: 'branch', branch: 'XYZ' }), 'branch');
    });
    it('schedule validates round entries and dates', async () => {
      expect400(await request(app).put(`/api/tpo/drives/${ID()}/schedule`).set('Authorization', as('tpo')).send({}));
    });
  });

  describe('Admin', () => {
    it('create user: name / email / password / role / company name', async () => {
      const res = await request(app).post('/api/admin/users').set('Authorization', as('admin'))
        .send({ name: '', email: 'x', password: 'weak', role: 'admin' });
      expect400(res);
      ['name', 'email', 'password', 'role'].forEach((f) => expect(res.body.errors).to.have.property(f));
      expect400(await request(app).post('/api/admin/users').set('Authorization', as('admin'))
        .send({ name: 'Co Admin', email: 'c@c.com', password: 'Strong@123', role: 'company' }), 'companyName');
    });
    it('role / status / password-reset / edit validated', async () => {
      const h = as('admin');
      expect400(await request(app).put(`/api/admin/users/${ID()}/role`).set('Authorization', h).send({ role: 'superuser' }), 'role');
      expect400(await request(app).put(`/api/admin/users/${ID()}/status`).set('Authorization', h).send({}), 'isActive');
      expect400(await request(app).put(`/api/admin/users/${ID()}/status`).set('Authorization', h).send({ isActive: 'maybe' }), 'isActive');
      expect400(await request(app).put(`/api/admin/users/${ID()}/password`).set('Authorization', h).send({ newPassword: 'weak' }), 'newPassword');
      expect400(await request(app).put(`/api/admin/users/${ID()}`).set('Authorization', h).send({ email: 'bad' }), 'email');
      expect400(await request(app).delete('/api/admin/users/not-an-id').set('Authorization', h));
      expect400(await request(app).get('/api/admin/users?role=hacker').set('Authorization', h), 'role');
    });
  });

  describe('Authorization is enforced by role', () => {
    it('a student cannot call T&P / admin / company endpoints', async () => {
      const h = as('student');
      expect((await request(app).post('/api/tpo/drives').set('Authorization', h).send({})).status).to.equal(403);
      expect((await request(app).get('/api/admin/users').set('Authorization', h)).status).to.equal(403);
      expect((await request(app).post('/api/company/requirements').set('Authorization', h).send({})).status).to.equal(403);
    });
    it('a company cannot approve drives, schedule interviews or touch users', async () => {
      const h = as('company');
      expect((await request(app).put(`/api/tpo/drives/${ID()}/schedule`).set('Authorization', h).send({})).status).to.equal(403);
      expect((await request(app).put(`/api/tpo/drives/${ID()}/decision`).set('Authorization', h).send({})).status).to.equal(403);
      expect((await request(app).delete(`/api/admin/users/${ID()}`).set('Authorization', h)).status).to.equal(403);
    });
    it('a T&P user cannot use admin endpoints', async () => {
      expect((await request(app).put(`/api/admin/users/${ID()}/role`).set('Authorization', as('tpo')).send({ role: 'admin' })).status).to.equal(403);
    });
  });
});
