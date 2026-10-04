const Student = require('../models/Student');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { buildIcs } = require('../utils/ics');
const logActivity = require('../utils/logActivity');
const fs = require('fs');
const path = require('path');
const { Validator, BRANCHES, MIN_BATCH_YEAR, maxBatchYear } = require('../utils/validators');
const { resumeProblem } = require('../middleware/upload');

const removeFile = (webPath) => {
  try {
    if (webPath) fs.unlinkSync(path.join(__dirname, '..', webPath.replace(/^\//, '')));
  } catch (e) { /* already gone */ }
};

// Shared eligibility-check logic — used by both "check eligibility" and "apply"
const isEligible = (student, drive) => {
  const reasons = [];
  const e = drive.eligibility || {};

  if (e.branches?.length && !e.branches.includes(student.branch)) {
    reasons.push(`Branch '${student.branch}' not eligible (allowed: ${e.branches.join(', ')})`);
  }
  if (e.batch && student.batch !== e.batch) {
    reasons.push(`Batch mismatch (drive is for ${e.batch} pass-outs)`);
  }
  if (e.minCgpa && (student.academics?.cgpa ?? 0) < e.minCgpa) {
    reasons.push(`CGPA ${student.academics?.cgpa ?? 0} below required ${e.minCgpa}`);
  }
  if (e.maxBacklogs !== undefined && (student.academics?.activeBacklogs ?? 0) > e.maxBacklogs) {
    reasons.push(`Active backlogs exceed allowed limit (${e.maxBacklogs})`);
  }
  if (e.min10th && (student.academics?.tenthPercentage ?? 0) < e.min10th) {
    reasons.push(`10th % below required ${e.min10th}`);
  }
  if (e.min12th && (student.academics?.twelfthPercentage ?? 0) < e.min12th) {
    reasons.push(`12th % below required ${e.min12th}`);
  }
  return { eligible: reasons.length === 0, reasons };
};

/**
 * One-offer policy. A student who is already placed may only apply to a "dream" drive paying at least
 * DREAM_OFFER_MULTIPLIER x the current offer (default 1.5). Set DREAM_OFFER_MULTIPLIER=0 to switch the rule off.
 * Returns a message when the student is blocked, otherwise null.
 */
const placementBlock = (student, drive) => {
  if (!student.isPlaced) return null;
  const raw = process.env.DREAM_OFFER_MULTIPLIER;
  const mult = raw === undefined || raw === '' ? 1.5 : Number(raw);
  if (!Number.isFinite(mult) || mult <= 0) return null; // policy disabled
  const current = student.placedPackage || 0;
  const need = Math.round(current * mult * 100) / 100;
  if ((drive.packageLPA || 0) >= need) return null;
  return `You are already placed${current ? ` (₹${current} LPA)` : ''}. Placed students can only apply to drives paying at least ₹${need} LPA (${mult}× the current offer).`;
};

// GET /api/student/profile
const getProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id }).populate('user', 'name email isActive');
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  res.json({ success: true, student });
};

// PUT /api/student/profile
const updateProfile = async (req, res) => {
  const body = req.body || {};
  const v = new Validator(body, { partial: true })
    .oneOf('branch', BRANCHES, { label: 'Branch' })
    .integer('batch', { label: 'Batch (graduation year)', min: MIN_BATCH_YEAR, max: maxBatchYear() })
    .phone('phone')
    .stringArray('skills', { label: 'Skills', itemMax: 30, max: 30 });

  // Academic details
  const acBody = body.academics;
  let ac = { data: {}, errors: {} };
  if (acBody !== undefined) {
    if (!acBody || typeof acBody !== 'object' || Array.isArray(acBody)) v._err('academics', 'Academic details are invalid');
    else {
      ac = new Validator(acBody, { partial: true })
        .number('cgpa', { label: 'CGPA', min: 0, max: 10, decimals: 2 })
        .number('tenthPercentage', { label: '10th percentage', min: 0, max: 100, decimals: 2 })
        .number('twelfthPercentage', { label: '12th percentage', min: 0, max: 100, decimals: 2 })
        .integer('activeBacklogs', { label: 'Active backlogs', min: 0, max: 50 });
      Object.entries(ac.errors).forEach(([k, m]) => v._err(`academics.${k}`, m));
    }
  }
  // Profile links
  const lkBody = body.links;
  let lk = { data: {}, errors: {} };
  if (lkBody !== undefined) {
    if (!lkBody || typeof lkBody !== 'object' || Array.isArray(lkBody)) v._err('links', 'Links are invalid');
    else {
      lk = new Validator(lkBody, { partial: true })
        .url('github', { label: 'GitHub link', allowEmpty: true })
        .url('linkedin', { label: 'LinkedIn link', allowEmpty: true })
        .url('portfolio', { label: 'Portfolio link', allowEmpty: true });
      Object.entries(lk.errors).forEach(([k, m]) => v._err(`links.${k}`, m));
    }
  }
  if (v.fail(res)) return;

  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

  const d = v.data;
  if (d.branch) student.branch = d.branch;
  if (d.batch) student.batch = d.batch;
  if (d.phone) student.phone = d.phone;
  if (d.skills) student.skills = d.skills;
  if (Object.keys(ac.data).length) student.academics = { ...student.academics.toObject(), ...ac.data };
  if (Object.keys(lk.data).length) student.links = { ...(student.links?.toObject?.() || {}), ...lk.data };

  await student.save();
  await logActivity(req.user, 'PROFILE_UPDATED', student.rollNumber);
  res.json({ success: true, student });
};

// POST /api/student/resume  (multipart/form-data, field name "resume")
const uploadResume = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded. Choose a PDF, DOC or DOCX file (max 5 MB).' });
  const problem = resumeProblem(req.file.path, req.file.originalname);
  if (problem) {
    removeFile(`/uploads/resumes/${req.file.filename}`);
    return res.status(400).json({ success: false, message: problem });
  }
  const student = await Student.findOne({ user: req.user._id });
  if (!student) {
    removeFile(`/uploads/resumes/${req.file.filename}`);
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }
  const old = student.resume?.filePath;
  student.resume = {
    fileName: req.file.originalname.slice(0, 150),
    filePath: `/uploads/resumes/${req.file.filename}`,
    uploadedAt: new Date(),
  };
  await student.save();
  if (old && old !== student.resume.filePath) removeFile(old);
  res.json({ success: true, resume: student.resume });
};

// GET /api/student/drives  — all published drives, flagged with eligibility for this student
const getDrives = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const drives = await Drive.find({ status: 'published' })
    .populate({ path: 'company', select: 'companyName industry website' })
    .sort('-createdAt');

  const applied = await Application.find({ student: student._id }).select('drive status');
  const appliedMap = new Map(applied.map((a) => [a.drive.toString(), a.status]));

  const result = drives.map((d) => {
    const base = isEligible(student, d);
    const blocked = placementBlock(student, d);
    const eligible = base.eligible && !blocked;
    const reasons = blocked ? [...base.reasons, blocked] : base.reasons;
    return {
      ...d.toObject(),
      eligible,
      reasons,
      applicationStatus: appliedMap.get(d._id.toString()) || null,
    };
  });

  res.json({ success: true, count: result.length, drives: result });
};

// GET /api/student/drives/:id/eligibility
const checkEligibility = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  const result = isEligible(student, drive);
  res.json({ success: true, ...result });
};

// POST /api/student/drives/:id/apply
const applyToDrive = async (req, res) => {
  // 1) validate input
  const v = new Validator(req.body)
    .string('coverNote', { label: 'Cover note', max: 500, allowEmpty: true })
    .stringArray('documentLinks', { label: 'Document links', itemUrl: true, max: 5 });
  if (v.fail(res)) return;

  // 2) load + business rules
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  if (drive.status !== 'published') {
    return res.status(400).json({ success: false, message: 'This drive is not open for applications' });
  }
  if (new Date() > new Date(drive.applicationDeadline)) {
    return res.status(400).json({ success: false, message: 'Application deadline has passed' });
  }
  const existing = await Application.findOne({ student: student._id, drive: drive._id });
  if (existing) {
    return res.status(400).json({ success: false, message: `You have already applied to this drive (status: ${existing.status})` });
  }
  const { eligible, reasons } = isEligible(student, drive);
  if (!eligible) return res.status(403).json({ success: false, message: 'You are not eligible for this drive', reasons });
  const blocked = placementBlock(student, drive);
  if (blocked) return res.status(403).json({ success: false, message: blocked, reasons: [blocked] });

  const required = drive.requiredDocuments || [];
  const links = v.data.documentLinks || [];
  if (required.includes('Resume') && !student.resume?.filePath) {
    return res.status(400).json({ success: false, message: 'This drive requires a resume. Upload your resume in My Profile first.', errors: { resume: 'Resume required' } });
  }
  const others = required.filter((d) => d !== 'Resume');
  if (others.length && links.length === 0) {
    return res.status(400).json({ success: false, message: `Please add link(s) to: ${others.join(', ')}`, errors: { documentLinks: `Required: ${others.join(', ')}` } });
  }

  let application;
  try {
    application = await Application.create({
      student: student._id,
      drive: drive._id,
      status: 'Applied',
      coverNote: v.data.coverNote || '',
      documentLinks: links,
      roundResults: [...drive.rounds]
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ round: r._id, roundName: r.name, status: 'Pending' })),
    });
  } catch (err) {
    // unique index (student, drive) — protects against double-click / parallel submissions
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'You have already applied to this drive' });
    throw err;
  }
  await logActivity(req.user, 'APPLIED_TO_DRIVE', `${student.rollNumber} -> ${drive.jobTitle}`);
  res.status(201).json({ success: true, application });
};

// GET /api/student/applications  — Track Application / Track Recruitment Stage
const getMyApplications = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const applications = await Application.find({ student: student._id })
    .populate({ path: 'drive', populate: { path: 'company', select: 'companyName' } })
    .sort('-createdAt');
  res.json({ success: true, count: applications.length, applications });
};

// PUT /api/student/applications/:id/withdraw
const withdrawApplication = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const application = await Application.findOne({ _id: req.params.id, student: student._id })
    .populate({ path: 'drive', select: 'jobTitle company', populate: { path: 'company', select: 'companyName user' } });
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

  if (!['Applied', 'In Process'].includes(application.status)) {
    return res.status(400).json({ success: false, message: `Cannot withdraw an application with status '${application.status}'` });
  }
  application.status = 'Withdrawn';
  await application.save();

  // Tell the T&P cell and the company (best effort — never fails the withdrawal itself)
  try {
    const drive = application.drive;
    if (drive) {
      const tpos = await User.find({ role: 'tpo', isActive: true }).select('_id');
      const recipients = [...tpos.map((t) => t._id), drive.company && drive.company.user].filter(Boolean);
      const docs = recipients.map((r) => ({
        recipient: r,
        title: `Application withdrawn: ${drive.jobTitle}`,
        message: `${req.user.name} (${student.rollNumber}) withdrew their application for "${drive.jobTitle}".`,
        type: 'application',
        relatedDrive: drive._id,
      }));
      if (docs.length) await Notification.insertMany(docs);
    }
    await logActivity(req.user, 'APPLICATION_WITHDRAWN', `${student.rollNumber} -> ${drive ? drive.jobTitle : application._id}`);
  } catch (e) { console.error('[withdraw notify]', e.message); }
  res.json({ success: true, application });
};

// GET /api/student/results — final placement results across all applications
const getResults = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const results = await Application.find({
    student: student._id,
    status: { $in: ['Selected', 'Rejected'] },
  }).populate({ path: 'drive', populate: { path: 'company', select: 'companyName' } });

  res.json({ success: true, isPlaced: student.isPlaced, placedCompany: student.placedCompany, placedPackage: student.placedPackage, results });
};

// GET /api/student/notifications
const getNotifications = async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    require('../utils/reminders').runReminderSweep().catch(() => {});
  }
  const notifications = await Notification.find({ recipient: req.user._id }).sort('-createdAt').limit(50);
  res.json({ success: true, count: notifications.length, notifications });
};

// PUT /api/student/notifications/:id/read
const markNotificationRead = async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true },
    { new: true }
  );
  if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, notification: n });
};

// GET /api/student/calendar — .ics file: application deadlines of open drives + upcoming rounds of active applications
const getCalendar = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  const now = new Date();
  const events = [];

  const apps = await Application.find({ student: student._id, status: { $in: ['Applied', 'In Process'] } })
    .populate({ path: 'drive', populate: { path: 'company', select: 'companyName' } });
  const appliedDriveIds = new Set(apps.map((a) => String(a.drive && a.drive._id)));
  apps.forEach((a) => {
    const d = a.drive;
    if (!d || d.status === 'cancelled') return;
    const cur = a.roundResults[a.currentRoundIndex];
    (d.rounds || []).forEach((r) => {
      if (!r.date || new Date(r.date) < now) return;
      if (cur && String(cur.round) !== String(r._id)) return; // only the round the student is at
      events.push({
        uid: `round-${a._id}-${r._id}`, start: r.date, end: r.endDate,
        summary: `${r.name}: ${d.company ? d.company.companyName : ''} — ${d.jobTitle}`,
        description: r.description || '', location: r.venue || '',
      });
    });
  });

  const drives = await Drive.find({ status: 'published', applicationDeadline: { $gt: now } }).populate('company', 'companyName');
  drives.forEach((d) => {
    if (appliedDriveIds.has(String(d._id)) || !isEligible(student, d).eligible || placementBlock(student, d)) return;
    const end = new Date(d.applicationDeadline);
    events.push({
      uid: `deadline-${d._id}`, start: new Date(end.getTime() - 30 * 60 * 1000), end,
      summary: `Apply by deadline: ${d.company ? d.company.companyName : ''} — ${d.jobTitle}`,
      description: `${d.packageLPA} LPA. Application closes at this time.`,
    });
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="placement-calendar.ics"');
  res.send(buildIcs(events));
};

module.exports = {
  placementBlock,
  getCalendar,
  isEligible,
  getProfile,
  updateProfile,
  uploadResume,
  getDrives,
  checkEligibility,
  applyToDrive,
  getMyApplications,
  withdrawApplication,
  getResults,
  getNotifications,
  markNotificationRead,
};
