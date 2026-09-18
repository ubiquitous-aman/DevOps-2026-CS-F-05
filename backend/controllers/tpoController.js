const Company = require('../models/Company');
const Student = require('../models/Student');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logActivity = require('../utils/logActivity');
const { isEligible, placementBlock } = require('./studentController');
const crypto = require('crypto');
const { sendCsv } = require('../utils/csv');
const {
  Validator, validateEligibility, validateRounds, isValidObjectId, BRANCHES,
} = require('../utils/validators');
const { validateDriveInput, findDuplicateDrive } = require('../utils/driveRules');

const fmt = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const notifyUsers = async (userIds, payload) => {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return 0;
  await Notification.insertMany(ids.map((id) => ({ recipient: id, ...payload })));
  return ids.length;
};

const eligibleStudentsOf = async (drive) => {
  const students = await Student.find().populate('user', 'name isActive');
  return students.filter((s) => s.user && s.user.isActive && isEligible(s, drive).eligible);
};

/** students (user ids) that currently have an active application on the drive */
const activeApplicantUserIds = async (driveId) => {
  const apps = await Application.find({ drive: driveId, status: { $in: ['Applied', 'In Process'] } }).populate('student', 'user');
  return apps.map((a) => a.student && a.student.user);
};

const parseEligibilityBody = (v, raw) => {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    v._err('eligibility', 'Eligibility criteria are invalid');
    return undefined;
  }
  const ev = validateEligibility(raw, { partial: true });
  Object.entries(ev.errors).forEach(([k, m]) => v._err(`eligibility.${k}`, m));
  return ev.data;
};

/** publishes a drive and notifies eligible students + the company. Returns the number of students notified. */
const publishAndNotify = async (drive, company, actor) => {
  drive.status = 'published';
  await drive.save();
  const eligible = await eligibleStudentsOf(drive);
  await notifyUsers(eligible.map((s) => s.user._id), {
    title: `New Drive: ${company.companyName}`,
    message: `You are eligible for "${drive.jobTitle}" (${drive.packageLPA} LPA). Apply before ${fmt(drive.applicationDeadline)} IST.`,
    type: 'drive',
    relatedDrive: drive._id,
  });
  await notifyUsers([company.user], {
    title: 'Your drive is live',
    message: `"${drive.jobTitle}" has been approved and published. ${eligible.length} eligible student(s) were notified.`,
    type: 'company',
    relatedDrive: drive._id,
  });
  return eligible.length;
};

const requireFutureDeadline = (drive, res) => {
  if (new Date(drive.applicationDeadline).getTime() <= Date.now()) {
    res.status(400).json({
      success: false,
      message: 'The application deadline has already passed. Edit the drive and set a new deadline before approving/publishing.',
      errors: { applicationDeadline: 'Deadline has passed' },
    });
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Manage Companies
// ---------------------------------------------------------------------------

// GET /api/tpo/companies
const getCompanies = async (req, res) => {
  const companies = await Company.find().populate('user', 'name email isActive').sort('-createdAt');
  const companyIds = companies.map((c) => c._id);
  const drives = await Drive.find({ company: { $in: companyIds } }).sort('-createdAt').lean();
  const driveMap = {};
  drives.forEach((d) => { if (!driveMap[d.company.toString()]) driveMap[d.company.toString()] = d; });

  const enriched = companies.map((c) => {
    const obj = c.toObject();
    obj.pendingDrive = driveMap[c._id.toString()] || null;
    return obj;
  });
  res.json({ success: true, count: enriched.length, companies: enriched });
};

// PUT /api/tpo/companies/:id/approve   body: { decision, reason?, collegeRequirements?, eligibility? }
const decideCompanyRequirement = async (req, res) => {
  const v = new Validator(req.body)
    .oneOf('decision', ['approved', 'rejected'], { required: true, label: 'Decision' })
    .string('collegeRequirements', { label: 'College requirements', max: 1000, allowEmpty: true });
  if (req.body && req.body.decision === 'rejected') v.string('reason', { required: true, label: 'Reason for rejection', min: 5, max: 500 });
  const eligibility = parseEligibilityBody(v, req.body && req.body.eligibility);
  if (v.fail(res)) return;
  const { decision, collegeRequirements, reason } = v.data;

  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  let drive = null;
  let eligibleCount = 0;

  if (decision === 'approved') {
    drive = await Drive.findOne({ company: company._id, requirementStatus: 'pending' });
    if (!drive && company.placementRequirement && company.placementRequirement.jobTitle) {
      const dup = await findDuplicateDrive(company._id, company.placementRequirement.jobTitle);
      if (!dup) {
        drive = new Drive({
          company: company._id,
          createdBy: req.user._id,
          jobTitle: company.placementRequirement.jobTitle,
          jobDescription: company.placementRequirement.jobDescription || '',
          jobType: company.placementRequirement.jobType || 'Full-Time',
          packageLPA: company.placementRequirement.packageLPA || 0,
          location: company.placementRequirement.location || '',
          eligibility: company.placementRequirement.eligibility || {},
          rounds: company.placementRequirement.rounds || [],
          applicationDeadline: company.placementRequirement.applicationDeadline || new Date(Date.now() + 14 * 86400000),
        });
      }
    }
    if (drive && !requireFutureDeadline(drive, res)) return;
    if (drive && !(drive.packageLPA > 0)) {
      return res.status(400).json({ success: false, message: 'The requirement has no valid package/CTC. Edit the drive first.', errors: { packageLPA: 'Package required' } });
    }

    company.approvalStatus = 'approved';
    company.rejectionReason = undefined;
    await company.save();

    if (drive) {
      if (collegeRequirements) drive.collegeRequirements = collegeRequirements;
      if (eligibility) drive.eligibility = { ...(drive.eligibility?.toObject?.() || drive.eligibility || {}), ...eligibility };
      drive.requirementStatus = 'approved';
      eligibleCount = await publishAndNotify(drive, company, req.user);
    } else {
      await notifyUsers([company.user], { title: 'Company approved', message: 'The T&P cell approved your company. You can now submit placement requirements.', type: 'company' });
    }
  } else {
    company.approvalStatus = 'rejected';
    company.rejectionReason = reason;
    await company.save();
    drive = await Drive.findOne({ company: company._id, requirementStatus: 'pending' });
    if (drive) {
      drive.requirementStatus = 'rejected';
      drive.status = 'cancelled';
      drive.decisionReason = reason;
      await drive.save();
    }
    await notifyUsers([company.user], { title: 'Company registration rejected', message: `Reason: ${reason}`, type: 'company' });
  }

  await logActivity(req.user, 'COMPANY_APPROVAL_DECISION',
    `${company.companyName} -> ${decision}${reason ? ` (${reason})` : ''} (Drive: ${drive ? drive.jobTitle : 'None'}, ${eligibleCount} students notified)`);
  res.json({ success: true, company, drive, eligibleStudentsNotified: eligibleCount });
};

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------

// GET /api/tpo/drives
const getAllDrives = async (req, res) => {
  const drives = await Drive.find().populate('company', 'companyName').sort('-createdAt').lean();
  const counts = await Application.aggregate([{ $group: { _id: '$drive', n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  drives.forEach((d) => { d.applicationCount = map.get(String(d._id)) || 0; });
  res.json({ success: true, count: drives.length, drives });
};

// POST /api/tpo/drives
const createDrive = async (req, res) => {
  const dv = validateDriveInput(req.body, { role: 'tpo' });
  dv.v.objectId('company', { required: true, label: 'Company' });
  if (dv.v.fail(res)) return;
  const d = dv.data;

  const company = await Company.findById(d.company);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found', errors: { company: 'Company not found' } });
  if (company.approvalStatus === 'rejected') {
    return res.status(400).json({ success: false, message: 'This company was rejected. Approve the company before creating a drive for it.', errors: { company: 'Company is rejected' } });
  }
  if (await findDuplicateDrive(company._id, d.jobTitle)) {
    return res.status(409).json({ success: false, message: 'A drive with this job title already exists for this company', errors: { jobTitle: 'Duplicate drive' } });
  }

  const drive = await Drive.create({
    company: company._id,
    createdBy: req.user._id,
    jobTitle: d.jobTitle,
    jobDescription: d.jobDescription,
    jobType: d.jobType,
    packageLPA: d.packageLPA,
    openings: d.openings,
    location: d.location,
    requiredDocuments: d.requiredDocuments || [],
    eligibility: d.eligibility,
    rounds: d.rounds || [],
    applicationDeadline: d.applicationDeadline,
    driveDate: d.driveDate,
    collegeRequirements: d.collegeRequirements,
    status: 'draft',
    requirementStatus: 'approved',
  });
  await logActivity(req.user, 'DRIVE_CREATED', `${company.companyName}: ${drive.jobTitle}`);
  res.status(201).json({ success: true, drive });
};

// PUT /api/tpo/drives/:id — edit
const updateDrive = async (req, res) => {
  const existing = await Drive.findById(req.params.id);
  // Validation needs the existing drive for date comparisons, so it can only run after the lookup;
  // a malformed id was already rejected by router.param.
  if (!existing) return res.status(404).json({ success: false, message: 'Drive not found' });
  const drive = existing;

  const dv = validateDriveInput(req.body, { partial: true, role: 'tpo', existing: drive });
  if (dv.v.fail(res)) return;
  const d = dv.data;

  if (['closed', 'cancelled'].includes(drive.status)) {
    return res.status(400).json({ success: false, message: `A ${drive.status} drive cannot be edited` });
  }
  if (d.jobTitle && d.jobTitle.toLowerCase() !== drive.jobTitle.toLowerCase() && (await findDuplicateDrive(drive.company, d.jobTitle, drive._id))) {
    return res.status(409).json({ success: false, message: 'A drive with this job title already exists for this company', errors: { jobTitle: 'Duplicate drive' } });
  }

  const appCount = await Application.countDocuments({ drive: drive._id });
  if (d.openings !== undefined) {
    const selected = await Application.countDocuments({ drive: drive._id, status: 'Selected' });
    if (d.openings < selected) {
      return res.status(400).json({ success: false, message: `Openings cannot be lower than the ${selected} candidate(s) already selected`, errors: { openings: 'Too low' } });
    }
  }

  // Rounds: once students have applied the round structure is fixed (applications keep a snapshot);
  // only dates / venues can change (the dedicated schedule endpoint does the same).
  if (d.rounds) {
    if (appCount > 0) {
      const same = d.rounds.length === drive.rounds.length && d.rounds.every((r, i) => r.name === drive.rounds[i].name);
      if (!same) {
        return res.status(400).json({ success: false, message: 'Rounds cannot be added, removed or renamed after students have applied. You can still change their dates and venues.', errors: { rounds: 'Locked' } });
      }
      d.rounds.forEach((r, i) => {
        const target = drive.rounds[i];
        target.date = r.date; target.endDate = r.endDate; target.venue = r.venue;
      });
      delete d.rounds;
    } else {
      drive.rounds = d.rounds;
      delete d.rounds;
    }
  }

  ['jobTitle', 'jobDescription', 'jobType', 'packageLPA', 'openings', 'location', 'requiredDocuments',
    'applicationDeadline', 'driveDate', 'collegeRequirements'].forEach((f) => { if (d[f] !== undefined) drive[f] = d[f]; });
  if (d.eligibility) drive.eligibility = { ...(drive.eligibility?.toObject?.() || {}), ...d.eligibility };

  await drive.save();
  await logActivity(req.user, 'DRIVE_UPDATED', drive.jobTitle);
  res.json({ success: true, drive });
};

// PUT /api/tpo/drives/:id/schedule — the T&P cell sets interview / test dates and the drive date
const scheduleDrive = async (req, res) => {
  const body = req.body || {};
  const v = new Validator(body, { partial: true }).date('driveDate', { label: 'Drive date/time', future: true });
  const updates = [];
  if (body.rounds !== undefined) {
    if (!Array.isArray(body.rounds) || body.rounds.length === 0 || body.rounds.length > 10) {
      v._err('rounds', 'Provide between 1 and 10 round entries');
    } else {
      body.rounds.forEach((r, i) => {
        const n = i + 1;
        const rv = new Validator(r)
          .objectId('roundId', { required: true, label: `Round ${n} id` })
          .date('date', { label: `Round ${n} date/time`, future: true })
          .date('endDate', { label: `Round ${n} end time`, future: true })
          .string('venue', { label: `Round ${n} venue`, max: 120, allowEmpty: true });
        if (!rv.ok) v._err(`rounds.${i}`, Object.values(rv.errors)[0]);
        else updates.push({ src: r, data: rv.data });
      });
    }
  }
  if (body.rounds === undefined && body.driveDate === undefined) v._err('rounds', 'Provide round dates and/or a drive date');
  if (v.fail(res)) return;

  const drive = await Drive.findById(req.params.id).populate('company', 'companyName');
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  if (['closed', 'cancelled'].includes(drive.status)) {
    return res.status(400).json({ success: false, message: `A ${drive.status} drive cannot be rescheduled` });
  }

  const merged = drive.rounds.map((r) => ({ _id: String(r._id), name: r.name, description: r.description, date: r.date, endDate: r.endDate, venue: r.venue }));
  for (const u of updates) {
    const target = merged.find((r) => r._id === u.data.roundId);
    if (!target) return res.status(404).json({ success: false, message: 'Round not found in this drive' });
    if ('date' in u.src) target.date = u.data.date || undefined;
    if ('endDate' in u.src) target.endDate = u.data.endDate || undefined;
    if ('venue' in u.src) target.venue = u.data.venue || undefined;
    if (u.src.date && !u.src.endDate && target.endDate && target.endDate <= target.date) target.endDate = undefined;
  }
  const check = validateRounds(merged, { allowSchedule: true, deadline: new Date(drive.applicationDeadline) });
  if (check.errors.length) {
    const e = check.errors[0];
    return res.status(400).json({ success: false, message: e.message, errors: { [`rounds.${e.index}`]: e.message } });
  }
  const driveDate = v.data.driveDate;
  if (driveDate && driveDate.getTime() <= new Date(drive.applicationDeadline).getTime()) {
    return res.status(400).json({ success: false, message: 'Drive date must be after the application deadline', errors: { driveDate: 'Must be after the application deadline' } });
  }

  drive.rounds.forEach((r) => {
    const m = merged.find((x) => x._id === String(r._id));
    r.date = m.date; r.endDate = m.endDate; r.venue = m.venue;
  });
  if (driveDate) drive.driveDate = driveDate;
  await drive.save();

  // Tell everyone affected about the (new) timetable
  const lines = drive.rounds.filter((r) => r.date).map((r) => `${r.name}: ${fmt(r.date)}${r.venue ? ` @ ${r.venue}` : ''}`);
  const userIds = await activeApplicantUserIds(drive._id);
  if (lines.length && userIds.length) {
    await notifyUsers(userIds, {
      title: `📅 Schedule updated: ${drive.company?.companyName || ''}`,
      message: `"${drive.jobTitle}" — ${lines.join(' | ')} (IST)`,
      type: 'schedule',
      relatedDrive: drive._id,
    });
  }
  await logActivity(req.user, 'DRIVE_SCHEDULED', `${drive.jobTitle}: ${lines.length} round(s) scheduled`);
  res.json({ success: true, drive, notified: userIds.length });
};

// PUT /api/tpo/drives/:id/decision — approve / reject a company's requirement
const decideDrive = async (req, res) => {
  const v = new Validator(req.body)
    .oneOf('decision', ['approved', 'rejected'], { required: true, label: 'Decision' })
    .string('collegeRequirements', { label: 'College requirements', max: 1000, allowEmpty: true });
  if (req.body && req.body.decision === 'rejected') v.string('reason', { required: true, label: 'Reason for rejection', min: 5, max: 500 });
  const eligibility = parseEligibilityBody(v, req.body && req.body.eligibility);
  if (v.fail(res)) return;
  const { decision, reason, collegeRequirements } = v.data;

  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  if (drive.requirementStatus !== 'pending') {
    return res.status(409).json({ success: false, message: `This requirement was already ${drive.requirementStatus}` });
  }
  const company = await Company.findById(drive.company);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  let notified = 0;
  if (decision === 'approved') {
    if (!requireFutureDeadline(drive, res)) return;
    if (collegeRequirements) drive.collegeRequirements = collegeRequirements;
    if (eligibility) drive.eligibility = { ...(drive.eligibility?.toObject?.() || {}), ...eligibility };
    drive.requirementStatus = 'approved';
    drive.decisionReason = undefined;
    if (company.approvalStatus === 'pending') { company.approvalStatus = 'approved'; await company.save(); }
    notified = await publishAndNotify(drive, company, req.user);
  } else {
    drive.requirementStatus = 'rejected';
    drive.status = 'cancelled';
    drive.decisionReason = reason;
    await drive.save();
    await notifyUsers([company.user], {
      title: `Requirement rejected: ${drive.jobTitle}`,
      message: `The T&P cell rejected your requirement. Reason: ${reason}`,
      type: 'company',
      relatedDrive: drive._id,
    });
  }
  await logActivity(req.user, 'DRIVE_DECISION', `${drive.jobTitle} -> ${decision}${reason ? ` (${reason})` : ''}`);
  res.json({ success: true, drive, eligibleStudentsNotified: notified });
};

// PUT /api/tpo/drives/:id/status — close or cancel a drive
const setDriveStatus = async (req, res) => {
  const v = new Validator(req.body).oneOf('status', ['closed', 'cancelled'], { required: true, label: 'Status' });
  if (req.body && req.body.status === 'cancelled') v.string('reason', { required: true, label: 'Reason for cancelling', min: 5, max: 500 });
  if (v.fail(res)) return;
  const { status, reason } = v.data;

  const drive = await Drive.findById(req.params.id).populate('company', 'companyName user');
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  const allowed = { draft: ['cancelled'], published: ['closed', 'cancelled'], closed: ['cancelled'], cancelled: [] };
  if (!allowed[drive.status].includes(status)) {
    return res.status(400).json({ success: false, message: `A ${drive.status} drive cannot be ${status}` });
  }
  const applicants = await activeApplicantUserIds(drive._id);
  drive.status = status;
  if (status === 'cancelled') drive.decisionReason = reason;
  await drive.save();

  if (status === 'cancelled') {
    await notifyUsers([...applicants, drive.company?.user], {
      title: `Drive cancelled: ${drive.company?.companyName || ''}`,
      message: `"${drive.jobTitle}" has been cancelled. Reason: ${reason}`,
      type: 'drive',
      relatedDrive: drive._id,
    });
  }
  await logActivity(req.user, 'DRIVE_STATUS_CHANGED', `${drive.jobTitle} -> ${status}${reason ? ` (${reason})` : ''}`);
  res.json({ success: true, drive });
};

// PUT /api/tpo/drives/:id/publish
const publishDrive = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  if (drive.status !== 'draft') {
    return res.status(400).json({ success: false, message: `This drive is already ${drive.status}` });
  }
  if (drive.requirementStatus !== 'approved') {
    return res.status(400).json({ success: false, message: 'This requirement is not approved yet. Approve it first.' });
  }
  if (!requireFutureDeadline(drive, res)) return;
  const company = await Company.findById(drive.company);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  const n = await publishAndNotify(drive, company, req.user);
  await logActivity(req.user, 'DRIVE_PUBLISHED', `${drive.jobTitle} -> ${n} students notified`);
  res.json({ success: true, drive, eligibleStudentsNotified: n });
};

// GET /api/tpo/drives/:id/eligible-students
const getEligibleStudents = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  const students = await Student.find().populate('user', 'name email');
  const eligible = students.filter((s) => isEligible(s, drive).eligible);
  res.json({ success: true, count: eligible.length, students: eligible });
};

// GET /api/tpo/drives/:id/applicants
const getApplicants = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  const applications = await Application.find({ drive: drive._id })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .sort('-createdAt');
  res.json({ success: true, count: applications.length, applications });
};

// ---------------------------------------------------------------------------
// Recruitment rounds / candidate status
// ---------------------------------------------------------------------------

const notifyStudentOf = async (studentId, payload) => {
  const s = await Student.findById(studentId).select('user');
  if (s) await notifyUsers([s.user], payload);
};

/**
 * Core of "clear / reject the candidate's current round" — shared by the single and the bulk endpoint.
 * `application` must have `drive` populated. Returns an error message, or null on success.
 */
const processRound = async (application, status, feedback, actor) => {
  if (!['Applied', 'In Process'].includes(application.status)) return `This application is already ${application.status}`;
  if (application.drive && application.drive.status === 'cancelled') return 'This drive was cancelled';
  const idx = application.currentRoundIndex;
  if (idx >= application.roundResults.length) return 'No further rounds remain for this candidate';
  if (application.roundResults[idx].status !== 'Pending') return 'All rounds are complete. Make the final Select / Reject decision.';

  const round = application.roundResults[idx];
  round.status = status;
  round.feedback = feedback || '';
  round.updatedAt = new Date();

  if (status === 'Rejected') application.status = 'Rejected';
  else {
    application.status = 'In Process';
    if (idx < application.roundResults.length - 1) application.currentRoundIndex += 1;
  }
  await application.save();

  await notifyStudentOf(application.student, {
    title: status === 'Cleared' ? `Round cleared: ${round.roundName}` : `Application update: ${round.roundName}`,
    message: status === 'Cleared'
      ? `You cleared "${round.roundName}" for "${application.drive.jobTitle}".`
      : `You were not shortlisted after "${round.roundName}" for "${application.drive.jobTitle}".`,
    type: 'application',
    relatedDrive: application.drive._id,
  });
  await logActivity(actor, 'ROUND_STATUS_UPDATED', `App ${application._id} round '${round.roundName}' -> ${status}`);
  return null;
};

// PUT /api/tpo/applications/:id/round  body: { status, feedback }
const updateRoundStatus = async (req, res) => {
  const v = new Validator(req.body)
    .oneOf('status', ['Cleared', 'Rejected'], { required: true, label: 'Round result' })
    .string('feedback', { label: 'Feedback', max: 1000, allowEmpty: true });
  if (v.fail(res)) return;
  const { status, feedback } = v.data;

  const application = await Application.findById(req.params.id).populate('drive');
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
  const problem = await processRound(application, status, feedback, req.user);
  if (problem) return res.status(400).json({ success: false, message: problem });
  res.json({ success: true, application });
};

// PUT /api/tpo/applications/bulk-round  body: { ids: [applicationId...], status, feedback }
const bulkRoundStatus = async (req, res) => {
  const body = req.body || {};
  const v = new Validator(body)
    .oneOf('status', ['Cleared', 'Rejected'], { required: true, label: 'Round result' })
    .string('feedback', { label: 'Feedback', max: 1000, allowEmpty: true });
  if (!Array.isArray(body.ids) || body.ids.length === 0) v._err('ids', 'Select at least one application');
  else if (body.ids.length > 300) v._err('ids', 'You can update at most 300 applications at once');
  else if (!body.ids.every((i) => isValidObjectId(i))) v._err('ids', 'One or more application ids are invalid');
  if (v.fail(res)) return;

  const results = [];
  for (const id of [...new Set(body.ids.map(String))]) {
    const application = await Application.findById(id).populate('drive');
    if (!application) { results.push({ id, ok: false, message: 'Application not found' }); continue; }
    const problem = await processRound(application, v.data.status, v.data.feedback, req.user);
    results.push({ id, ok: !problem, message: problem || 'Updated' });
  }
  const updated = results.filter((r) => r.ok).length;
  await logActivity(req.user, 'BULK_ROUND_UPDATE', `${updated}/${results.length} application(s) -> ${v.data.status}`);
  res.json({ success: true, updated, failed: results.length - updated, results });
};

// PUT /api/tpo/applications/:id/decision  body: { decision, packageLPA?, joiningDate? }
const finalDecision = async (req, res) => {
  const v = new Validator(req.body)
    .oneOf('decision', ['Selected', 'Rejected'], { required: true, label: 'Decision' })
    .number('packageLPA', { label: 'Offered package (LPA)', exclusiveMin: 0, max: 500, decimals: 2 })
    .date('joiningDate', { label: 'Joining date', future: true, maxDaysAhead: 1095 });
  if (v.fail(res)) return;
  const { decision, packageLPA, joiningDate } = v.data;

  const application = await Application.findById(req.params.id).populate('drive');
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
  if (!['Applied', 'In Process'].includes(application.status)) {
    return res.status(400).json({ success: false, message: `This application is already ${application.status}` });
  }
  const drive = application.drive;

  if (decision === 'Selected') {
    if (application.roundResults.some((r) => r.status !== 'Cleared')) {
      return res.status(400).json({ success: false, message: 'The candidate must clear all rounds before being selected' });
    }
    if (drive.openings) {
      const taken = await Application.countDocuments({ drive: drive._id, status: 'Selected' });
      if (taken >= drive.openings) {
        return res.status(400).json({ success: false, message: `All ${drive.openings} opening(s) for this drive are already filled` });
      }
    }
  }

  application.status = decision;
  const student = await Student.findById(application.student).populate('user');
  const company = await Company.findById(drive.company);

  if (decision === 'Selected') {
    application.offeredPackageLPA = packageLPA || drive.packageLPA;
    if (joiningDate) application.joiningDate = joiningDate;
    await application.save();
    student.isPlaced = true;
    student.placedCompany = company ? company.companyName : null;
    student.placedPackage = application.offeredPackageLPA;
    await student.save();

    // One-offer policy: other active applications that the student could no longer apply to are withdrawn
    const others = await Application.find({ student: student._id, _id: { $ne: application._id }, status: { $in: ['Applied', 'In Process'] } })
      .populate('drive', 'jobTitle packageLPA');
    const withdrawn = [];
    for (const o of others) {
      if (o.drive && placementBlock(student, o.drive)) {
        o.status = 'Withdrawn';
        await o.save();
        withdrawn.push(o.drive.jobTitle);
      }
    }
    if (withdrawn.length) {
      await notifyUsers([student.user._id], {
        title: 'Other applications withdrawn',
        message: `Because you were selected, your other application(s) were withdrawn automatically: ${withdrawn.join(', ')}.`,
        type: 'application',
      });
    }
    await notifyUsers([student.user._id], {
      title: 'Congratulations! You have been Selected 🎉',
      message: `You have been selected for "${drive.jobTitle}" at ${company ? company.companyName : 'the company'}.${joiningDate ? ` Joining date: ${fmt(joiningDate)}.` : ''}`,
      type: 'result',
      relatedDrive: drive._id,
    });
  } else {
    await application.save();
    await notifyUsers([student.user._id], {
      title: 'Application Update',
      message: `You were not selected for "${drive.jobTitle}". Keep trying!`,
      type: 'result',
      relatedDrive: drive._id,
    });
  }
  await logActivity(req.user, 'FINAL_DECISION', `App ${application._id} -> ${decision}`);
  res.json({ success: true, application });
};

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

// GET /api/tpo/students
const getAllStudents = async (req, res) => {
  const students = await Student.find().populate('user', 'name email isActive').sort('rollNumber');
  res.json({ success: true, count: students.length, students });
};

// GET /api/tpo/students/:id  (also mounted for admin) — full student details
const getStudentDetails = async (req, res) => {
  const student = await Student.findById(req.params.id).populate('user', 'name email isActive lastLogin createdAt');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  const applications = await Application.find({ student: student._id })
    .populate({ path: 'drive', select: 'jobTitle packageLPA status applicationDeadline company', populate: { path: 'company', select: 'companyName' } })
    .sort('-createdAt');
  res.json({ success: true, student, applications });
};

// ---------------------------------------------------------------------------
// Statistics & notifications
// ---------------------------------------------------------------------------

// GET /api/tpo/statistics
const getStatistics = async (req, res) => {
  const totalStudents = await Student.countDocuments();
  const placedStudents = await Student.countDocuments({ isPlaced: true });
  const totalDrives = await Drive.countDocuments();
  const publishedDrives = await Drive.countDocuments({ status: 'published' });
  const totalApplications = await Application.countDocuments();
  const selected = await Application.countDocuments({ status: 'Selected' });
  const rejected = await Application.countDocuments({ status: 'Rejected' });
  const inProcess = await Application.countDocuments({ status: { $in: ['Applied', 'In Process'] } });

  const branchWise = await Student.aggregate([
    { $group: { _id: '$branch', total: { $sum: 1 }, placed: { $sum: { $cond: ['$isPlaced', 1, 0] } } } },
  ]);
  const packages = await Student.find({ isPlaced: true }).select('placedPackage');
  const avgPackage = packages.length ? (packages.reduce((s, p) => s + (p.placedPackage || 0), 0) / packages.length).toFixed(2) : 0;
  const highestPackage = packages.length ? Math.max(...packages.map((p) => p.placedPackage || 0)) : 0;

  res.json({
    success: true,
    stats: {
      totalStudents, placedStudents,
      placementPercentage: totalStudents ? ((placedStudents / totalStudents) * 100).toFixed(1) : 0,
      totalDrives, publishedDrives, totalApplications, selected, rejected, inProcess,
      avgPackage, highestPackage, branchWise,
    },
  });
};

// POST /api/tpo/notify
//   { title, message, audience?: 'students'|'all'|'branch'|'drive', studentIds?, branch?, driveId? }
const notifyStudents = async (req, res) => {
  const body = req.body || {};
  const v = new Validator(body)
    .string('title', { required: true, label: 'Title', min: 3, max: 100 })
    .string('message', { required: true, label: 'Message', min: 5, max: 500 });
  const audience = body.audience === undefined ? 'students' : body.audience;
  if (!['students', 'all', 'branch', 'drive'].includes(audience)) v._err('audience', 'Audience must be students, all, branch or drive');
  if (audience === 'students') {
    const ids = body.studentIds;
    if (!Array.isArray(ids) || ids.length === 0) v._err('studentIds', 'Select at least one student');
    else if (ids.length > 1000) v._err('studentIds', 'You can notify at most 1000 students at once');
    else if (!ids.every((i) => isValidObjectId(i))) v._err('studentIds', 'One or more student ids are invalid');
  }
  if (audience === 'branch') v.oneOf('branch', BRANCHES, { required: true, label: 'Branch' });
  if (audience === 'drive') v.objectId('driveId', { required: true, label: 'Drive' });
  if (v.fail(res)) return;

  let filter = {};
  if (audience === 'students') filter = { _id: { $in: body.studentIds } };
  else if (audience === 'branch') filter = { branch: v.data.branch };
  else if (audience === 'drive') {
    const apps = await Application.find({ drive: v.data.driveId }).select('student');
    filter = { _id: { $in: apps.map((a) => a.student) } };
  }
  const students = await Student.find(filter).populate('user', 'isActive');
  const recipients = students.filter((s) => s.user && s.user.isActive).map((s) => s.user._id);
  if (!recipients.length) return res.status(404).json({ success: false, message: 'No matching students to notify' });

  await notifyUsers(recipients, { title: v.data.title, message: v.data.message, type: 'system' });
  await logActivity(req.user, 'NOTIFY_STUDENTS', `${recipients.length} students notified: ${v.data.title}`);
  res.json({ success: true, notified: recipients.length });
};


// ---------------------------------------------------------------------------
// Two-way messaging with companies
// ---------------------------------------------------------------------------

// POST /api/tpo/message-company  { companyId, subject, message }
const messageCompany = async (req, res) => {
  const v = new Validator(req.body)
    .objectId('companyId', { required: true, label: 'Company' })
    .string('subject', { required: true, label: 'Subject', min: 3, max: 100 })
    .string('message', { required: true, label: 'Message', min: 5, max: 1000 });
  if (v.fail(res)) return;
  const company = await Company.findById(v.data.companyId);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
  await notifyUsers([company.user], {
    title: `[T&P Cell] ${v.data.subject}`,
    message: v.data.message,
    type: 'company',
  });
  await logActivity(req.user, 'TPO_MESSAGED_COMPANY', `${company.companyName}: ${v.data.subject}`);
  res.json({ success: true, message: `Message sent to ${company.companyName}` });
};

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------
const studentColumns = [
  { header: 'Roll Number', value: (s) => s.rollNumber },
  { header: 'Name', value: (s) => s.user && s.user.name },
  { header: 'Email', value: (s) => s.user && s.user.email },
  { header: 'Phone', value: (s) => s.phone },
  { header: 'Branch', value: (s) => s.branch },
  { header: 'Batch', value: (s) => s.batch },
  { header: 'CGPA', value: (s) => s.academics && s.academics.cgpa },
  { header: '10th %', value: (s) => s.academics && s.academics.tenthPercentage },
  { header: '12th %', value: (s) => s.academics && s.academics.twelfthPercentage },
  { header: 'Active Backlogs', value: (s) => (s.academics && s.academics.activeBacklogs) || 0 },
  { header: 'Placed', value: (s) => (s.isPlaced ? 'Yes' : 'No') },
  { header: 'Placed Company', value: (s) => s.placedCompany },
  { header: 'Package (LPA)', value: (s) => s.placedPackage },
];

// GET /api/tpo/export/students?branch=&placed=placed|unplaced
const exportStudents = async (req, res) => {
  const v = new Validator(req.query).oneOf('branch', BRANCHES, { label: 'Branch' }).oneOf('placed', ['placed', 'unplaced'], { label: 'Placed' });
  if (v.fail(res)) return;
  const filter = {};
  if (v.data.branch) filter.branch = v.data.branch;
  if (v.data.placed) filter.isPlaced = v.data.placed === 'placed';
  const students = await Student.find(filter).populate('user', 'name email').sort('rollNumber');
  await logActivity(req.user, 'EXPORT_STUDENTS', `${students.length} row(s)`);
  sendCsv(res, 'students.csv', studentColumns, students);
};

const applicantColumns = [
  { header: 'Roll Number', value: (a) => a.student && a.student.rollNumber },
  { header: 'Name', value: (a) => a.student && a.student.user && a.student.user.name },
  { header: 'Email', value: (a) => a.student && a.student.user && a.student.user.email },
  { header: 'Branch', value: (a) => a.student && a.student.branch },
  { header: 'CGPA', value: (a) => a.student && a.student.academics && a.student.academics.cgpa },
  { header: 'Status', value: (a) => a.status },
  { header: 'Current Round', value: (a) => (a.roundResults[a.currentRoundIndex] ? a.roundResults[a.currentRoundIndex].roundName : '') },
  { header: 'Offered Package (LPA)', value: (a) => a.offeredPackageLPA },
  { header: 'Joining Date', value: (a) => (a.joiningDate ? new Date(a.joiningDate).toISOString().slice(0, 10) : '') },
  { header: 'Applied On', value: (a) => (a.appliedAt ? new Date(a.appliedAt).toISOString().slice(0, 10) : '') },
];

// GET /api/tpo/drives/:id/export?selected=1  — applicants (or only the selected candidates) of a drive
const exportApplicants = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  const filter = { drive: drive._id };
  if (req.query.selected === '1') filter.status = 'Selected';
  const apps = await Application.find(filter)
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .sort('createdAt');
  await logActivity(req.user, 'EXPORT_APPLICANTS', `${drive.jobTitle}: ${apps.length} row(s)`);
  sendCsv(res, `applicants-${drive.jobTitle.replace(/[^\w]+/g, '_').slice(0, 40)}.csv`, applicantColumns, apps);
};

// GET /api/tpo/drives/:id/export-eligible
const exportEligible = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
  const students = (await Student.find().populate('user', 'name email')).filter((s) => isEligible(s, drive).eligible);
  sendCsv(res, 'eligible-students.csv', studentColumns, students);
};

// ---------------------------------------------------------------------------
// Bulk student import (the browser parses the CSV and sends the rows as JSON)
// ---------------------------------------------------------------------------
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{3,19}$/;
const tempPassword = () => `Pc@${crypto.randomBytes(5).toString('hex')}X7`; // satisfies the password policy

// POST /api/tpo/students/bulk  { rows: [{ name, email, phone?, rollNumber, branch, batch }] }
const bulkImportStudents = async (req, res) => {
  const rows = req.body && req.body.rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: 'Provide at least one student row', errors: { rows: 'No rows' } });
  if (rows.length > 500) return res.status(400).json({ success: false, message: 'You can import at most 500 students at once', errors: { rows: 'Too many rows' } });

  const created = [];
  const errors = [];
  const seenEmail = new Set();
  const seenRoll = new Set();
  for (let i = 0; i < rows.length; i++) {
    const line = i + 2; // +1 for the header row, +1 for 1-based numbering
    const v = new Validator(rows[i])
      .name('name', { required: true })
      .email('email', { required: true })
      .phone('phone')
      .string('rollNumber', { required: true, label: 'Roll number', upper: true, pattern: ROLL_RE, patternMsg: 'Roll number must be 4-20 letters/digits (/ and - allowed)' })
      .oneOf('branch', BRANCHES, { required: true, label: 'Branch' })
      .integer('batch', { required: true, label: 'Batch (graduation year)', min: 2000, max: new Date().getFullYear() + 6 });
    if (!v.ok) { errors.push({ line, message: Object.values(v.errors)[0] }); continue; }
    const { name, email, phone, rollNumber, branch, batch } = v.data;
    if (seenEmail.has(email) || seenRoll.has(rollNumber)) { errors.push({ line, message: 'Duplicate email or roll number inside the file' }); continue; }
    seenEmail.add(email); seenRoll.add(rollNumber);
    if (await User.findOne({ email })) { errors.push({ line, message: `Email ${email} is already registered` }); continue; }
    if (await Student.findOne({ rollNumber })) { errors.push({ line, message: `Roll number ${rollNumber} is already registered` }); continue; }

    const password = tempPassword();
    const user = await User.create({ name, email, password, role: 'student', emailVerified: true, mustChangePassword: true });
    try {
      await Student.create({ user: user._id, rollNumber, branch, batch, phone });
    } catch (err) {
      await user.deleteOne();
      errors.push({ line, message: err.message });
      continue;
    }
    created.push({ name, email, rollNumber, tempPassword: password });
  }
  await logActivity(req.user, 'BULK_IMPORT_STUDENTS', `${created.length} created, ${errors.length} skipped`);
  res.status(created.length ? 201 : 400).json({
    success: created.length > 0,
    message: `${created.length} student(s) created, ${errors.length} row(s) skipped`,
    created: created.length, skipped: errors.length, errors, credentials: created,
  });
};

module.exports = {
  bulkRoundStatus, messageCompany, exportStudents, exportApplicants, exportEligible, bulkImportStudents,
  getCompanies, decideCompanyRequirement, getAllDrives, createDrive, updateDrive, scheduleDrive,
  decideDrive, setDriveStatus, publishDrive, getEligibleStudents, getApplicants, updateRoundStatus,
  finalDecision, getStatistics, notifyStudents, getAllStudents, getStudentDetails,
};
