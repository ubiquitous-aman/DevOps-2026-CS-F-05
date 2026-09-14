const Company = require('../models/Company');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logActivity = require('../utils/logActivity');
const { Validator } = require('../utils/validators');
const { validateDriveInput, findDuplicateDrive } = require('../utils/driveRules');
const { sendCsv } = require('../utils/csv');

/** Loads the company profile for the logged-in user. Sends 404 and returns null if it does not exist. */
const loadCompany = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  if (!company) res.status(404).json({ success: false, message: 'Company profile not found' });
  return company;
};
/** Applicant data is only available once T&P has approved the company. */
const needApproved = (company, res) => {
  if (company.approvalStatus !== 'approved') {
    res.status(403).json({ success: false, message: 'Your company has not been approved by the T&P cell yet' });
    return false;
  }
  return true;
};

// GET /api/company/profile
const getProfile = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id }).populate('user', 'name email isActive');
  if (!company) return res.status(404).json({ success: false, message: 'Company profile not found' });
  res.json({ success: true, company });
};

// PUT /api/company/profile
const updateProfile = async (req, res) => {
  const body = req.body || {};
  const v = new Validator(body, { partial: true })
    .string('companyName', { label: 'Company name', min: 2, max: 100 })
    .url('website', { label: 'Website', allowEmpty: true })
    .string('industry', { label: 'Industry', max: 60, allowEmpty: true })
    .string('description', { label: 'Description', max: 1000, allowEmpty: true });
  let hr = { data: {} };
  if (body.hrContact !== undefined) {
    if (!body.hrContact || typeof body.hrContact !== 'object' || Array.isArray(body.hrContact)) v._err('hrContact', 'HR contact details are invalid');
    else {
      hr = new Validator(body.hrContact, { partial: true })
        .name('name', { label: 'HR contact name' })
        .phone('phone', { label: 'HR phone' })
        .email('email', { label: 'HR email' });
      Object.entries(hr.errors).forEach(([k, m]) => v._err(`hrContact.${k}`, m));
    }
  }
  if (v.fail(res)) return;

  const company = await loadCompany(req, res);
  if (!company) return;
  const d = v.data;

  if (d.companyName && d.companyName.toLowerCase() !== company.companyName.toLowerCase()) {
    const dup = await Company.findOne({ _id: { $ne: company._id }, companyName: new RegExp(`^${d.companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (dup) return res.status(409).json({ success: false, message: 'A company with this name is already registered', errors: { companyName: 'A company with this name is already registered' } });
  }
  ['companyName', 'website', 'industry', 'description'].forEach((f) => { if (d[f] !== undefined) company[f] = d[f]; });
  if (Object.keys(hr.data).length) company.hrContact = { ...(company.hrContact?.toObject?.() || {}), ...hr.data };

  await company.save();
  await logActivity(req.user, 'COMPANY_PROFILE_UPDATED', company.companyName);
  res.json({ success: true, company });
};

// POST /api/company/requirements — becomes a draft Drive pending T&P approval
const submitRequirement = async (req, res) => {
  const dv = validateDriveInput(req.body, { role: 'company' });
  if (dv.v.fail(res)) return;

  const company = await loadCompany(req, res);
  if (!company) return;
  if (company.approvalStatus === 'rejected') {
    return res.status(403).json({ success: false, message: 'Your company registration was rejected by the T&P cell. Contact the T&P cell.' });
  }
  if (await findDuplicateDrive(company._id, dv.data.jobTitle)) {
    return res.status(409).json({ success: false, message: 'You already have an open requirement/drive with this job title', errors: { jobTitle: 'Duplicate job title' } });
  }
  const pending = await Drive.countDocuments({ company: company._id, requirementStatus: 'pending' });
  if (pending >= 5) {
    return res.status(400).json({ success: false, message: 'You already have 5 requirements awaiting review. Please wait for the T&P cell to process them.' });
  }

  const d = dv.data;
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
    eligibility: d.eligibility || {}, // company-proposed academic criteria; T&P may override on approval
    rounds: d.rounds || [], // names only — the T&P cell sets dates / venues
    applicationDeadline: d.applicationDeadline,
    status: 'draft',
    requirementStatus: 'pending',
  });

  // Let the T&P cell know a new requirement is waiting
  const tpos = await User.find({ role: 'tpo', isActive: true }).select('_id');
  if (tpos.length) {
    await Notification.insertMany(tpos.map((t) => ({
      recipient: t._id,
      title: `New requirement: ${company.companyName}`,
      message: `${company.companyName} submitted "${drive.jobTitle}" (${drive.packageLPA} LPA). Review it in Drives & Requirements.`,
      type: 'company',
      relatedDrive: drive._id,
    })));
  }
  await logActivity(req.user, 'REQUIREMENT_SUBMITTED', `${company.companyName}: ${drive.jobTitle}`);
  res.status(201).json({ success: true, drive });
};

// GET /api/company/requirements
const getMyRequirements = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  const drives = await Drive.find({ company: company._id }).sort('-createdAt');
  res.json({ success: true, count: drives.length, drives });
};

// GET /api/company/drives/approved
const getApprovedDrives = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company) return;
  const drives = await Drive.find({ company: company._id, status: { $in: ['published', 'closed'] } }).sort('-createdAt');
  res.json({ success: true, count: drives.length, drives });
};

// GET /api/company/drives/:id/applicants
const getApplicants = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company || !needApproved(company, res)) return;
  const drive = await Drive.findOne({ _id: req.params.id, company: company._id });
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found for this company' });

  const applications = await Application.find({ drive: drive._id, status: { $ne: 'Withdrawn' } })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .sort('-createdAt');
  res.json({ success: true, count: applications.length, applications });
};

// GET /api/company/applications/:id
const getApplicationById = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company || !needApproved(company, res)) return;
  const application = await Application.findById(req.params.id)
    .populate('drive')
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } });
  if (!application || !application.drive || application.drive.company.toString() !== company._id.toString()) {
    return res.status(404).json({ success: false, message: 'Application not found for this company' });
  }
  res.json({ success: true, application });
};

// PUT /api/company/applications/:id/feedback — feedback for the candidate's current round
const updateFeedback = async (req, res) => {
  const v = new Validator(req.body).string('feedback', { required: true, label: 'Feedback', min: 3, max: 1000 });
  if (v.fail(res)) return;

  const company = await loadCompany(req, res);
  if (!company || !needApproved(company, res)) return;
  const application = await Application.findById(req.params.id).populate('drive');
  if (!application || !application.drive || application.drive.company.toString() !== company._id.toString()) {
    return res.status(404).json({ success: false, message: 'Application not found for this company' });
  }
  if (!['Applied', 'In Process'].includes(application.status)) {
    return res.status(400).json({ success: false, message: `Feedback cannot be changed once an application is ${application.status}` });
  }
  const idx = application.currentRoundIndex;
  if (idx >= application.roundResults.length) {
    return res.status(400).json({ success: false, message: 'This drive has no recruitment round to attach feedback to' });
  }
  application.roundResults[idx].feedback = v.data.feedback;
  application.roundResults[idx].updatedAt = new Date();
  await application.save();
  await logActivity(req.user, 'COMPANY_FEEDBACK_UPDATED', `App ${application._id}`);
  res.json({ success: true, application });
};

// GET /api/company/drives/:id/selected
const getSelectedCandidates = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company || !needApproved(company, res)) return;
  const drive = await Drive.findOne({ _id: req.params.id, company: company._id });
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found for this company' });
  const applications = await Application.find({ drive: drive._id, status: 'Selected' }).populate({
    path: 'student',
    populate: { path: 'user', select: 'name email' },
  });
  res.json({ success: true, count: applications.length, selected: applications });
};

// GET /api/company/drives/:id/export?selected=1 — CSV of applicants (or only the selected candidates)
const exportApplicants = async (req, res) => {
  const company = await loadCompany(req, res);
  if (!company || !needApproved(company, res)) return;
  const drive = await Drive.findOne({ _id: req.params.id, company: company._id });
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found for this company' });
  const filter = { drive: drive._id, status: req.query.selected === '1' ? 'Selected' : { $ne: 'Withdrawn' } };
  const apps = await Application.find(filter).populate({ path: 'student', populate: { path: 'user', select: 'name email' } }).sort('createdAt');
  sendCsv(res, 'candidates.csv', [
    { header: 'Roll Number', value: (a) => a.student && a.student.rollNumber },
    { header: 'Name', value: (a) => a.student && a.student.user && a.student.user.name },
    { header: 'Email', value: (a) => a.student && a.student.user && a.student.user.email },
    { header: 'Phone', value: (a) => a.student && a.student.phone },
    { header: 'Branch', value: (a) => a.student && a.student.branch },
    { header: 'CGPA', value: (a) => a.student && a.student.academics && a.student.academics.cgpa },
    { header: 'Status', value: (a) => a.status },
    { header: 'Current Round', value: (a) => (a.roundResults[a.currentRoundIndex] ? a.roundResults[a.currentRoundIndex].roundName : '') },
  ], apps);
};

// POST /api/company/message-tpo
const messageTPO = async (req, res) => {
  const v = new Validator(req.body)
    .string('subject', { required: true, label: 'Subject', min: 3, max: 100 })
    .string('message', { required: true, label: 'Message', min: 5, max: 1000 });
  if (v.fail(res)) return;

  const company = await loadCompany(req, res);
  if (!company) return;
  const tpos = await User.find({ role: 'tpo', isActive: true });
  if (!tpos.length) return res.status(503).json({ success: false, message: 'No T&P officer is available right now' });

  await Notification.insertMany(tpos.map((t) => ({
    recipient: t._id,
    title: `[Company Message] ${v.data.subject}`,
    message: `From ${company.companyName}: ${v.data.message}`,
    type: 'company',
  })));
  await logActivity(req.user, 'COMPANY_MESSAGED_TPO', v.data.subject);
  res.json({ success: true, message: 'Message sent to TPO Cell' });
};

module.exports = {
  getProfile, updateProfile, submitRequirement, getMyRequirements, getApprovedDrives,
  getApplicants, getApplicationById, updateFeedback, getSelectedCandidates, messageTPO, exportApplicants,
};
