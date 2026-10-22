/**
 * backend/test/test.js
 * Comprehensive automated test suite for College Placement Portal Backend API.
 * Uses mongodb-memory-server for full in-memory database isolation.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_devops_2026';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer, app;

describe('College Placement Management Portal - Backend API', function () {
    this.timeout(20000);

    let studentToken, companyToken, adminToken, tpoToken;
    let driveId, applicationId;

    before(async () => {
        // Set TEST_MONGO_URI to run against an existing MongoDB instead of downloading mongodb-memory-server
        if (process.env.TEST_MONGO_URI) {
            process.env.MONGO_URI = process.env.TEST_MONGO_URI;
        } else {
            mongoServer = await MongoMemoryServer.create();
            process.env.MONGO_URI = mongoServer.getUri();
        }
        await mongoose.connect(process.env.MONGO_URI);

        app = require('../server');

        const User = require('../models/User');
        await User.create({ name: 'System Admin', email: 'admin@placement.edu', password: 'Admin@123', role: 'admin' });
        await User.create({ name: 'Placement Officer', email: 'tpo@placement.edu', password: 'Tpo@1234', role: 'tpo' });
    });

    after(async () => {
        if (process.env.TEST_MONGO_URI) await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // =========================================================================
    // SECTION 1: Health & Server Initialization
    // =========================================================================
    describe('Health Check & Server Initialization', () => {
        it('GET /api/health should return 200 with active status', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
        });
    });

    // =========================================================================
    // SECTION 2: Authentication & Student Registration (3-Step OTP)
    // =========================================================================
    describe('Authentication & Student Registration (3-Step OTP)', () => {
        let setupToken;

        it('Step 1: initiates student registration and returns test OTP', async () => {
            const res = await request(app).post('/api/auth/register/student/initiate').send({
                name: 'Aman Sharma',
                email: 'aman@student.edu',
                rollNumber: '2026CS101',
                branch: 'CSE',
                batch: 2026,
                phone: '9876543210'
            });
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.otpForTesting).to.be.a('string');
        });

        it('Step 1: rejects student registration with duplicate email', async () => {
            const User = require('../models/User');
            await User.create({ name: 'Existing Student', email: 'existing@student.edu', password: 'Password@123', role: 'student', emailVerified: true });

            const res = await request(app).post('/api/auth/register/student/initiate').send({
                name: 'Duplicate Student',
                email: 'existing@student.edu',
                rollNumber: '2026CS102',
                branch: 'CSE',
                batch: 2026
            });
            expect(res.status).to.equal(400);
            expect(res.body.message).to.match(/already registered/i);
        });

        it('Step 2: verifies email OTP and generates setup token', async () => {
            const s1 = await request(app).post('/api/auth/register/student/initiate').send({
                name: 'Kavita Verma', email: 'kavita@student.edu', rollNumber: '2026CS103', branch: 'IT', batch: 2026
            });
            const res = await request(app).post('/api/auth/register/verify-email').send({
                email: 'kavita@student.edu',
                otp: s1.body.otpForTesting
            });
            expect(res.status).to.equal(200);
            expect(res.body.setupToken).to.be.a('string');
            setupToken = res.body.setupToken;
        });

        it('Step 2: rejects invalid OTP', async () => {
            const res = await request(app).post('/api/auth/register/verify-email').send({
                email: 'kavita@student.edu',
                otp: '000000'
            });
            expect(res.status).to.equal(400);
        });

        it('Step 3: sets student password and returns active JWT token', async () => {
            const res = await request(app).post('/api/auth/register/set-password').send({
                setupToken: setupToken,
                password: 'Password@123'
            });
            expect(res.status).to.equal(201);
            expect(res.body.token).to.be.a('string');
            expect(res.body.user.role).to.equal('student');
            studentToken = res.body.token;
        });

        it('Step 3: rejects setting weak password (< 6 chars)', async () => {
            const s1 = await request(app).post('/api/auth/register/student/initiate').send({
                name: 'Weak Pass', email: 'weak@student.edu', rollNumber: '2026CS104', branch: 'ECE', batch: 2026
            });
            const s2 = await request(app).post('/api/auth/register/verify-email').send({
                email: 'weak@student.edu', otp: s1.body.otpForTesting
            });
            const res = await request(app).post('/api/auth/register/set-password').send({
                setupToken: s2.body.setupToken,
                password: '123'
            });
            expect(res.status).to.equal(400);
        });
    });

    // =========================================================================
    // SECTION 3: Company Registration & Multi-Role Login
    // =========================================================================
    describe('Company Registration & Multi-Role Login', () => {
        it('registers a new recruiting company account', async () => {
            const res = await request(app).post('/api/auth/register/company').send({
                name: 'TCS Campus HR',
                email: 'campus@tcs.com',
                password: 'Company@123',
                companyName: 'Tata Consultancy Services',
                industry: 'Information Technology'
            });
            expect(res.status).to.equal(201);
            expect(res.body.token).to.be.a('string');
            companyToken = res.body.token;
        });

        it('authenticates Admin with valid credentials', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'admin@placement.edu',
                password: 'Admin@123'
            });
            expect(res.status).to.equal(200);
            expect(res.body.token).to.be.a('string');
            adminToken = res.body.token;
        });

        it('authenticates TPO with valid credentials', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'tpo@placement.edu',
                password: 'Tpo@1234'
            });
            expect(res.status).to.equal(200);
            tpoToken = res.body.token;
        });

        it('rejects login attempt with incorrect password', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'admin@placement.edu',
                password: 'WrongPassword'
            });
            expect(res.status).to.equal(401);
        });

        it('enforces JWT protection on private endpoints', async () => {
            const res = await request(app).get('/api/admin/users');
            expect(res.status).to.equal(401);
        });
    });

    // =========================================================================
    // SECTION 4: TPO Management (Drives & Companies)
    // =========================================================================
    describe('TPO Management (Drives & Companies)', () => {
        it('TPO fetches registered companies list', async () => {
            const res = await request(app).get('/api/tpo/companies').set('Authorization', `Bearer ${tpoToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.companies).to.be.an('array');
        });

        it('TPO creates placement drive with eligibility rules and rounds timetable', async () => {
            const compRes = await request(app).get('/api/tpo/companies').set('Authorization', `Bearer ${tpoToken}`);
            const companyId = compRes.body.companies[0]._id;
            const res = await request(app).post('/api/tpo/drives').set('Authorization', `Bearer ${tpoToken}`).send({
                company: companyId,
                jobTitle: 'Systems Engineer',
                jobDescription: 'Full stack development role',
                jobType: 'Full-Time',
                packageLPA: 6.5,
                eligibility: { minCgpa: 7.0, maxBacklogs: 0, branches: ['CSE', 'IT'] },
                rounds: [{ name: 'Aptitude', order: 1 }, { name: 'Technical Interview', order: 2 }, { name: 'HR Interview', order: 3 }],
                applicationDeadline: new Date(Date.now() + 14 * 86400000)
            });
            expect(res.status).to.equal(201);
            driveId = res.body.drive._id;
        });

        it('TPO publishes placement drive to notify eligible students', async () => {
            const res = await request(app).put(`/api/tpo/drives/${driveId}/publish`).set('Authorization', `Bearer ${tpoToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.drive.status).to.equal('published');
        });
    });
    // =========================================================================
    // SECTION 5: Student: Eligibility, Application & Tracking
    // =========================================================================
    describe('Student: Eligibility, Application & Tracking', () => {
        it('student updates profile with academic info matching eligibility', async () => {
            const res = await request(app).put('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
                branch: 'CSE',
                batch: 2026,
                academics: { cgpa: 8.5, activeBacklogs: 0, tenthPercentage: 92, twelfthPercentage: 88 },
                skills: ['Node.js', 'MongoDB']
            });
            expect(res.status).to.equal(200);
            expect(res.body.student.academics.cgpa).to.equal(8.5);
        });
        it('student checks eligibility explicitly and confirms eligible status', async () => {
            const elig = await request(app).get(`/api/student/drives/${driveId}/eligibility`).set('Authorization', `Bearer ${studentToken}`);
            expect(elig.status).to.equal(200);
            expect(elig.body.eligible).to.equal(true);
        });
        it('student applies to published drive and receives confirmation', async () => {
            const apply = await request(app).post(`/api/student/drives/${driveId}/apply`).set('Authorization', `Bearer ${studentToken}`);
            expect(apply.status).to.equal(201);
            expect(apply.body.application).to.be.an('object');
            applicationId = apply.body.application._id;
        });
        it('student cannot apply twice to the same drive', async () => {
            const res = await request(app).post(`/api/student/drives/${driveId}/apply`).set('Authorization', `Bearer ${studentToken}`);
            expect(res.status).to.equal(400);
            expect(res.body.message).to.match(/already applied/i);
        });
        it('student tracks application history and current round status', async () => {
            const res = await request(app).get('/api/student/applications').set('Authorization', `Bearer ${studentToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.applications).to.be.an('array');
            expect(res.body.applications.length).to.be.at.least(1);
        });
    });
    // =========================================================================
    // SECTION 6: Recruitment Workflow State Machine
    // =========================================================================
    describe('Recruitment Workflow State Machine', () => {
        it('TPO advances candidate round by round (Aptitude -> Technical -> HR)', async () => {
            const r1 = await request(app).put(`/api/tpo/applications/${applicationId}/round`).set('Authorization', `Bearer ${tpoToken}`).send({
                status: 'Cleared', feedback: 'Top percentile in aptitude'
            });
            expect(r1.status).to.equal(200);
            expect(r1.body.application.roundResults[0].status).to.equal('Cleared');
            const r2 = await request(app).put(`/api/tpo/applications/${applicationId}/round`).set('Authorization', `Bearer ${tpoToken}`).send({
                status: 'Cleared', feedback: 'Strong data structures & problem solving'
            });
            expect(r2.status).to.equal(200);
            expect(r2.body.application.roundResults[1].status).to.equal('Cleared');
            const r3 = await request(app).put(`/api/tpo/applications/${applicationId}/round`).set('Authorization', `Bearer ${tpoToken}`).send({
                status: 'Cleared', feedback: 'Excellent culture fit'
            });
            expect(r3.status).to.equal(200);
            expect(r3.body.application.roundResults[2].status).to.equal('Cleared');
        });
        it('TPO issues final selection decision and student placement status updates', async () => {
            const decision = await request(app).put(`/api/tpo/applications/${applicationId}/decision`).set('Authorization', `Bearer ${tpoToken}`).send({
                decision: 'Selected', packageLPA: 6.5
            });
            expect(decision.status).to.equal(200);
            expect(decision.body.application.status).to.equal('Selected');
            const profile = await request(app).get('/api/student/profile').set('Authorization', `Bearer ${studentToken}`);
            expect(profile.body.student.isPlaced).to.equal(true);
        });
        it('student receives final selection notification in notification feed', async () => {
            const notifs = await request(app).get('/api/student/notifications').set('Authorization', `Bearer ${studentToken}`);
            expect(notifs.status).to.equal(200);
            expect(notifs.body.notifications).to.be.an('array');
            expect(notifs.body.notifications.some(n => n.type === 'result')).to.equal(true);
        });
    });
    // =========================================================================
    // SECTION 7: Admin: Governance, User Provisioning & Audit Trail
    // =========================================================================
    describe('Admin: Governance, User Provisioning & Audit Trail', () => {
        it('admin fetches user accounts and filters by role', async () => {
            const res = await request(app).get('/api/admin/users?role=student').set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.users).to.be.an('array');
        });
        it('admin provisions a new TPO user account', async () => {
            const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({
                name: 'Assistant TPO',
                email: 'assistant.tpo@placement.edu',
                password: 'Tpo@Password123',
                role: 'tpo'
            });
            expect(res.status).to.equal(201);
            expect(res.body.user.role).to.equal('tpo');
        });
        it('admin views server system health and database statistics', async () => {
            const res = await request(app).get('/api/admin/system-info').set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.systemInfo).to.be.an('object');
        });
        it('admin reviews audit trail activity logs', async () => {
            const res = await request(app).get('/api/admin/activity-logs').set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).to.equal(200);
            expect(res.body.logs).to.be.an('array');
            expect(res.body.logs.length).to.be.at.least(1);
        });
    });
});
