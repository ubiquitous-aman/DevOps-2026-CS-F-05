const Company = require('../models/Company');
const Student = require('../models/Student');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logActivity = require('../utils/logActivity');
const { isEligible } = require('./studentController');

// ---------- Manage Companies ----------

// ---------- Manage Companies ----------

// GET /api/tpo/companies
const getCompanies = async (req, res) => {
  const companies = await Company.find().populate('user', 'name email isActive').sort('-createdAt');

  // Attach pending drive details if any exists for the company
  const companyIds = companies.map((c) => c._id);
  const drives = await Drive.find({ company: { $in: companyIds } }).sort('-createdAt').lean();
  const driveMap = {};
  drives.forEach((d) => {
    if (!driveMap[d.company.toString()]) {
      driveMap[d.company.toString()] = d;
    }
  });

  const enrichedCompanies = companies.map((c) => {
    const obj = c.toObject();
    obj.pendingDrive = driveMap[c._id.toString()] || null;
    return obj;
  });

  res.json({ success: true, count: enrichedCompanies.length, companies: enrichedCompanies });
};

// PUT /api/tpo/companies/:id/approve   body: { decision: 'approved' | 'rejected', collegeRequirements, eligibility }
const decideCompanyRequirement = async (req, res) => {
  const { decision, collegeRequirements, eligibility } = req.body;
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

  company.approvalStatus = decision;
  await company.save();

  let drive = null;
  let eligibleCount = 0;

  if (decision === 'approved') {
    // Check if there is an existing pending drive or company placement requirement
    drive = await Drive.findOne({ company: company._id, requirementStatus: 'pending' });

    if (!drive && company.placementRequirement && company.placementRequirement.jobTitle) {
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

    if (drive) {
      if (collegeRequirements) drive.collegeRequirements = collegeRequirements;
      if (eligibility) {
        drive.eligibility = {
          ...drive.eligibility,
          ...eligibility,
          branches: Array.isArray(eligibility.branches)
            ? eligibility.branches
            : eligibility.branches
              ? String(eligibility.branches).split(',').map((b) => b.trim()).filter(Boolean)
              : drive.eligibility?.branches || [],
        };
      }
      drive.requirementStatus = 'approved';
      drive.status = 'published';
      await drive.save();

      // Find all eligible students and pop notification on their dashboard
      const students = await Student.find().populate('user', 'name');
      const eligibleStudents = students.filter((s) => isEligible(s, drive).eligible);
      eligibleCount = eligibleStudents.length;

      const notifications = eligibleStudents.map((s) => ({
        recipient: s.user._id,
        title: `New Company Approved: ${company.companyName}`,
        message: `Campus recruitment drive for "${drive.jobTitle}" (${drive.packageLPA} LPA) by ${company.companyName} is now open for eligible students. Check Placement Drives to apply!`,
        type: 'company',
        relatedDrive: drive._id,
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }
  } else if (decision === 'rejected') {
    drive = await Drive.findOne({ company: company._id, requirementStatus: 'pending' });
    if (drive) {
      drive.requirementStatus = 'rejected';
      await drive.save();
    }
  }

  await logActivity(
    req.user,
    'COMPANY_APPROVAL_DECISION',
    `${company.companyName} -> ${decision} (Drive: ${drive ? drive.jobTitle : 'None'}, ${eligibleCount} students notified)`
  );

  res.json({ success: true, company, drive, eligibleStudentsNotified: eligibleCount });
};

// ---------- Drives (Placement Requirements -> Drives) ----------

// GET /api/tpo/drives  (includes pending requirements submitted by companies)
const getAllDrives = async (req, res) => {
  const drives = await Drive.find().populate('company', 'companyName').sort('-createdAt');
  res.json({ success: true, count: drives.length, drives });
};

// POST /api/tpo/drives — TPO creates a drive directly (or converts an approved requirement)
const createDrive = async (req, res) => {
  const { company, jobTitle, jobDescription, jobType, packageLPA, location, eligibility, rounds, applicationDeadline } = req.body;

  if (!company || !jobTitle || !packageLPA || !applicationDeadline) {
    return res.status(400).json({ success: false, message: 'Missing required drive fields' });
  }

  const drive = await Drive.create({
    company,
    createdBy: req.user._id,
    jobTitle,
    jobDescription,
    jobType,
    packageLPA,
    location,
    eligibility,
    rounds: (rounds || []).map((r, idx) => ({ ...r, order: r.order ?? idx + 1 })),
    applicationDeadline,
    status: 'draft',
    requirementStatus: 'approved',
  });

  await logActivity(req.user, 'DRIVE_CREATED', jobTitle);
  res.status(201).json({ success: true, drive });
};

// PUT /api/tpo/drives/:id — edit drive (eligibility, rounds, deadline, etc.)
const updateDrive = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  const fields = ['jobTitle', 'jobDescription', 'jobType', 'packageLPA', 'location', 'eligibility', 'applicationDeadline'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) drive[f] = req.body[f];
  });
  if (req.body.rounds) {
    drive.rounds = req.body.rounds.map((r, idx) => ({ ...r, order: r.order ?? idx + 1 }));
  }
  await drive.save();
  await logActivity(req.user, 'DRIVE_UPDATED', drive.jobTitle);
  res.json({ success: true, drive });
};

// PUT /api/tpo/drives/:id/publish — publishes drive & notifies eligible students
const publishDrive = async (req, res) => {
  const drive = await Drive.findById(req.params.id).populate('company', 'companyName');
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  drive.status = 'published';
  await drive.save();

  // Filter eligible students and notify them
  const students = await Student.find().populate('user', 'name');
  const eligibleStudents = students.filter((s) => isEligible(s, drive).eligible);

  const notifications = eligibleStudents.map((s) => ({
    recipient: s.user._id,
    title: `New Drive: ${drive.company.companyName}`,
    message: `You are eligible for "${drive.jobTitle}" (${drive.packageLPA} LPA). Apply before ${new Date(drive.applicationDeadline).toDateString()}.`,
    type: 'drive',
    relatedDrive: drive._id,
  }));
  if (notifications.length) await Notification.insertMany(notifications);

  await logActivity(req.user, 'DRIVE_PUBLISHED', `${drive.jobTitle} -> ${eligibleStudents.length} students notified`);
  res.json({ success: true, drive, eligibleStudentsNotified: eligibleStudents.length });
};

// GET /api/tpo/drives/:id/eligible-students
const getEligibleStudents = async (req, res) => {
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

  const students = await Student.find().populate('user', 'name email');
  const eligible = students
    .map((s) => ({ student: s, ...isEligible(s, drive) }))
    .filter((r) => r.eligible);

  res.json({ success: true, count: eligible.length, students: eligible.map((r) => r.student) });
};

// GET /api/tpo/drives/:id/applicants
const getApplicants = async (req, res) => {
  const applications = await Application.find({ drive: req.params.id })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .sort('-createdAt');
  res.json({ success: true, count: applications.length, applications });
};

// ---------- Recruitment Rounds / Candidate Status ----------

// PUT /api/tpo/applications/:id/round  body: { roundIndex, status, feedback }
const updateRoundStatus = async (req, res) => {
  const { status, feedback } = req.body;
  const application = await Application.findById(req.params.id).populate('drive');
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

  const idx = application.currentRoundIndex;
  if (idx >= application.roundResults.length) {
    return res.status(400).json({ success: false, message: 'No further rounds remain for this candidate' });
  }
  if (!['Cleared', 'Rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: "status must be 'Cleared' or 'Rejected'" });
  }

  application.roundResults[idx].status = status;
  application.roundResults[idx].feedback = feedback || '';
  application.roundResults[idx].updatedAt = new Date();

  if (status === 'Rejected') {
    application.status = 'Rejected';
  } else {
    const isLastRound = idx === application.roundResults.length - 1;
    if (isLastRound) {
      application.status = 'In Process'; // awaits final select/reject decision
    } else {
      application.currentRoundIndex += 1;
      application.status = 'In Process';
    }
  }

  await application.save();
  await logActivity(req.user, 'ROUND_STATUS_UPDATED', `App ${application._id} round '${application.roundResults[idx].roundName}' -> ${status}`);
  res.json({ success: true, application });
};

// PUT /api/tpo/applications/:id/decision  body: { decision: 'Selected' | 'Rejected', packageLPA }
const finalDecision = async (req, res) => {
  const { decision, packageLPA } = req.body;
  if (!['Selected', 'Rejected'].includes(decision)) {
    return res.status(400).json({ success: false, message: "decision must be 'Selected' or 'Rejected'" });
  }

  const application = await Application.findById(req.params.id).populate('drive');
  if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

  application.status = decision;
  await application.save();

  if (decision === 'Selected') {
    const student = await Student.findById(application.student).populate('user');
    const company = await require('../models/Company').findById(application.drive.company);
    student.isPlaced = true;
    student.placedCompany = company.companyName;
    student.placedPackage = packageLPA || application.drive.packageLPA;
    await student.save();

    await Notification.create({
      recipient: student.user._id,
      title: 'Congratulations! You have been Selected 🎉',
      message: `You have been selected for "${application.drive.jobTitle}" at ${company.companyName}.`,
      type: 'result',
      relatedDrive: application.drive._id,
    });
  } else {
    const student = await Student.findById(application.student).populate('user');
    await Notification.create({
      recipient: student.user._id,
      title: 'Application Update',
      message: `You were not selected for "${application.drive.jobTitle}". Keep trying!`,
      type: 'result',
      relatedDrive: application.drive._id,
    });
  }

  await logActivity(req.user, 'FINAL_DECISION', `App ${application._id} -> ${decision}`);
  res.json({ success: true, application });
};

// GET /api/tpo/students — full student list (used e.g. for the "notify" screen)
const getAllStudents = async (req, res) => {
  const students = await Student.find().populate('user', 'name email isActive').sort('rollNumber');
  res.json({ success: true, count: students.length, students });
};

// ---------- Statistics ----------

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
  const avgPackage =
    packages.length > 0 ? (packages.reduce((s, p) => s + (p.placedPackage || 0), 0) / packages.length).toFixed(2) : 0;
  const highestPackage = packages.length > 0 ? Math.max(...packages.map((p) => p.placedPackage || 0)) : 0;

  res.json({
    success: true,
    stats: {
      totalStudents,
      placedStudents,
      placementPercentage: totalStudents ? ((placedStudents / totalStudents) * 100).toFixed(1) : 0,
      totalDrives,
      publishedDrives,
      totalApplications,
      selected,
      rejected,
      inProcess,
      avgPackage,
      highestPackage,
      branchWise,
    },
  });
};

// ---------- Notify Students ----------

// POST /api/tpo/notify  body: { studentIds: [], title, message }  OR { driveId, title, message } for all applicants
const notifyStudents = async (req, res) => {
  const { studentIds, title, message } = req.body;
  if (!title || !message) return res.status(400).json({ success: false, message: 'title and message required' });

  const students = await Student.find({ _id: { $in: studentIds } }).populate('user');
  const notifications = students.map((s) => ({
    recipient: s.user._id,
    title,
    message,
    type: 'system',
  }));
  await Notification.insertMany(notifications);
  await logActivity(req.user, 'NOTIFY_STUDENTS', `${notifications.length} students notified: ${title}`);
  res.json({ success: true, notified: notifications.length });
};

module.exports = {
  getCompanies,
  decideCompanyRequirement,
  getAllDrives,
  createDrive,
  updateDrive,
  publishDrive,
  getEligibleStudents,
  getApplicants,
  updateRoundStatus,
  finalDecision,
  getStatistics,
  notifyStudents,
  getAllStudents,
};
