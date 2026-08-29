const Company = require('../models/Company');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logActivity = require('../utils/logActivity');

// GET /api/company/profile
const getProfile = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id }).populate('user', 'name email isActive');
  if (!company) return res.status(404).json({ success: false, message: 'Company profile not found' });
  res.json({ success: true, company });
};

// PUT /api/company/profile
const updateProfile = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  if (!company) return res.status(404).json({ success: false, message: 'Company profile not found' });

  const { companyName, website, industry, description, hrContact } = req.body;
  if (companyName) company.companyName = companyName;
  if (website) company.website = website;
  if (industry) company.industry = industry;
  if (description) company.description = description;
  if (hrContact) company.hrContact = { ...company.hrContact.toObject(), ...hrContact };

  await company.save();
  res.json({ success: true, company });
};

// POST /api/company/requirements — Submit Placement Requirement (becomes a draft Drive pending TPO approval)
const submitRequirement = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  if (!company) return res.status(404).json({ success: false, message: 'Company profile not found' });

  const { jobTitle, jobDescription, jobType, packageLPA, location, applicationDeadline, rounds } = req.body;
  if (!jobTitle || !packageLPA || !applicationDeadline) {
    return res.status(400).json({ success: false, message: 'jobTitle, packageLPA, applicationDeadline are required' });
  }

  const drive = await Drive.create({
    company: company._id,
    createdBy: req.user._id,
    jobTitle,
    jobDescription,
    jobType,
    packageLPA,
    location,
    rounds: (rounds || []).map((r, idx) => ({ ...r, order: r.order ?? idx + 1 })),
    applicationDeadline,
    status: 'draft',
    requirementStatus: 'pending', // awaits TPO's eligibility criteria + approval
  });

  await logActivity(req.user, 'REQUIREMENT_SUBMITTED', `${company.companyName}: ${jobTitle}`);
  res.status(201).json({ success: true, drive });
};

// GET /api/company/requirements — View Requirement Status
const getMyRequirements = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  const drives = await Drive.find({ company: company._id }).sort('-createdAt');
  res.json({ success: true, count: drives.length, drives });
};

// GET /api/company/drives/approved — View Approved / Published Drives
const getApprovedDrives = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  const drives = await Drive.find({ company: company._id, status: 'published' }).sort('-createdAt');
  res.json({ success: true, count: drives.length, drives });
};

// GET /api/company/drives/:id/applicants — View Applicants / Shortlisted Candidates
const getApplicants = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  const drive = await Drive.findOne({ _id: req.params.id, company: company._id });
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found for this company' });

  const applications = await Application.find({ drive: drive._id })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .sort('-createdAt');

  res.json({ success: true, count: applications.length, applications });
};

// GET /api/company/applications/:id — single application detail (for feedback page)
const getApplicationById = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  const application = await Application.findById(req.params.id)
    .populate('drive')
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } });

  if (!application || application.drive.company.toString() !== company._id.toString()) {
    return res.status(404).json({ success: false, message: 'Application not found for this company' });
  }
  res.json({ success: true, application });
};

// PUT /api/company/applications/:id/feedback — Update Recruitment Feedback for current round
const updateFeedback = async (req, res) => {
  const { feedback } = req.body;
  const company = await Company.findOne({ user: req.user._id });

  const application = await Application.findById(req.params.id).populate('drive');
  if (!application || application.drive.company.toString() !== company._id.toString()) {
    return res.status(404).json({ success: false, message: 'Application not found for this company' });
  }

  const idx = application.currentRoundIndex;
  if (idx < application.roundResults.length) {
    application.roundResults[idx].feedback = feedback;
    application.roundResults[idx].updatedAt = new Date();
    await application.save();
  }

  await logActivity(req.user, 'COMPANY_FEEDBACK_UPDATED', `App ${application._id}`);
  res.json({ success: true, application });
};

// GET /api/company/drives/:id/selected — View Final Selected Candidates
const getSelectedCandidates = async (req, res) => {
  const company = await Company.findOne({ user: req.user._id });
  const drive = await Drive.findOne({ _id: req.params.id, company: company._id });
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found for this company' });

  const applications = await Application.find({ drive: drive._id, status: 'Selected' }).populate({
    path: 'student',
    populate: { path: 'user', select: 'name email' },
  });

  res.json({ success: true, count: applications.length, selected: applications });
};

// POST /api/company/message-tpo — Communicate with TPO
const messageTPO = async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ success: false, message: 'subject and message required' });

  const company = await Company.findOne({ user: req.user._id });
  const tpos = await User.find({ role: 'tpo', isActive: true });

  const notifications = tpos.map((t) => ({
    recipient: t._id,
    title: `[Company Message] ${subject}`,
    message: `From ${company.companyName}: ${message}`,
    type: 'company',
  }));
  await Notification.insertMany(notifications);

  await logActivity(req.user, 'COMPANY_MESSAGED_TPO', subject);
  res.json({ success: true, message: 'Message sent to TPO Cell' });
};

module.exports = {
  getProfile,
  updateProfile,
  submitRequirement,
  getMyRequirements,
  getApprovedDrives,
  getApplicants,
  getApplicationById,
  updateFeedback,
  getSelectedCandidates,
  messageTPO,
};
