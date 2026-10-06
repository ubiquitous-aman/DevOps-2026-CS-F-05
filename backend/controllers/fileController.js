const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Company = require('../models/Company');
const Application = require('../models/Application');
const Drive = require('../models/Drive');

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');

// GET /api/files/resume/:id  (id = student profile id)
// Resumes are private: the owner, T&P, admin, and a company that has an application from this student.
const getResume = async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student || !student.resume || !student.resume.filePath) {
    return res.status(404).json({ success: false, message: 'No resume uploaded' });
  }

  const role = req.user.role;
  let allowed = false;
  if (role === 'tpo' || role === 'admin') allowed = true;
  else if (role === 'student') allowed = String(student.user) === String(req.user._id);
  else if (role === 'company') {
    const company = await Company.findOne({ user: req.user._id });
    if (company) {
      const driveIds = (await Drive.find({ company: company._id }).select('_id')).map((d) => d._id);
      allowed = !!(await Application.exists({ student: student._id, drive: { $in: driveIds }, status: { $ne: 'Withdrawn' } }));
    }
  }
  if (!allowed) return res.status(403).json({ success: false, message: 'You are not allowed to view this resume' });

  const abs = path.resolve(__dirname, '..', student.resume.filePath.replace(/^\/+/, ''));
  if (!abs.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(abs)) {
    return res.status(404).json({ success: false, message: 'Resume file not found' });
  }
  const safeName = (student.resume.fileName || `resume${path.extname(abs)}`).replace(/[^\w.\- ]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(abs);
};

module.exports = { getResume };
