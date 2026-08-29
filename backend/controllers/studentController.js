const Student = require('../models/Student');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const logActivity = require('../utils/logActivity');

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

// GET /api/student/profile
const getProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id }).populate('user', 'name email isActive');
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  res.json({ success: true, student });
};

// PUT /api/student/profile
const updateProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

  const { branch, batch, phone, academics, skills } = req.body;
  if (branch) student.branch = branch;
  if (batch) student.batch = batch;
  if (phone) student.phone = phone;
  if (academics) student.academics = { ...student.academics.toObject(), ...academics };
  if (skills) student.skills = skills;

  await student.save();
  res.json({ success: true, student });
};

// POST /api/student/resume  (multipart/form-data, field name "resume")
const uploadResume = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const student = await Student.findOne({ user: req.user._id });
  student.resume = {
    fileName: req.file.originalname,
    filePath: `/uploads/resumes/${req.file.filename}`,
    uploadedAt: new Date(),
  };
  await student.save();
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
    const { eligible, reasons } = isEligible(student, d);
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
  const student = await Student.findOne({ user: req.user._id });
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  if (drive.status !== 'published') {
    return res.status(400).json({ success: false, message: 'This drive is not open for applications' });
  }
  if (new Date() > new Date(drive.applicationDeadline)) {
    return res.status(400).json({ success: false, message: 'Application deadline has passed' });
  }

  const { eligible, reasons } = isEligible(student, drive);
  if (!eligible) {
    return res.status(403).json({ success: false, message: 'You are not eligible for this drive', reasons });
  }

  const alreadyApplied = await Application.findOne({ student: student._id, drive: drive._id });
  if (alreadyApplied) {
    return res.status(400).json({ success: false, message: 'You have already applied to this drive' });
  }

  const application = await Application.create({
    student: student._id,
    drive: drive._id,
    status: 'Applied',
    roundResults: drive.rounds
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ round: r._id, roundName: r.name, status: 'Pending' })),
  });

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
  const application = await Application.findOne({ _id: req.params.id, student: student._id });
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

  if (!['Applied', 'In Process'].includes(application.status)) {
    return res.status(400).json({ success: false, message: `Cannot withdraw an application with status '${application.status}'` });
  }
  application.status = 'Withdrawn';
  await application.save();
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

module.exports = {
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
