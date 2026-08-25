const User = require('../models/User');
const Student = require('../models/Student');
const Company = require('../models/Company');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const logActivity = require('../utils/logActivity');
const generateToken = require('../utils/generateToken');

// GET /api/admin/users
const getUsers = async (req, res) => {
  const { role } = req.query;
  const filter = role ? { role } : {};
  const users = await User.find(filter).sort('-createdAt');

  if (role === 'student') {
    // Enrich student records with profile (branch, CGPA, batch, roll) + placement status
    const userIds = users.map((u) => u._id);
    const profiles = await Student.find({ user: { $in: userIds } }).lean();
    const profileMap = {};
    profiles.forEach((p) => { profileMap[p.user.toString()] = p; });

    // Find placed students (have a final 'Selected' application)
    const applications = await Application.find({
      student: { $in: profiles.map((p) => p._id) },
      status: 'Selected',
    }).lean();
    const placedStudentIds = new Set(applications.map((a) => a.student.toString()));

    // Also fetch pending/in-process status for not-yet-placed
    const activeApps = await Application.find({
      student: { $in: profiles.map((p) => p._id) },
      status: { $in: ['Applied', 'In Process'] },
    }).lean();
    const activeStudentIds = new Set(activeApps.map((a) => a.student.toString()));

    const enriched = users.map((u) => {
      const profile = profileMap[u._id.toString()];
      let placementStatus = 'Not Applied';
      if (profile) {
        if (placedStudentIds.has(profile._id.toString())) placementStatus = 'Placed';
        else if (activeStudentIds.has(profile._id.toString())) placementStatus = 'Applied / In Process';
      }
      return {
        ...u.toObject(),
        profile: profile || null,
        placementStatus,
      };
    });
    return res.json({ success: true, count: enriched.length, users: enriched });
  }

  res.json({ success: true, count: users.length, users });
};

// POST /api/admin/users  — create TPO or COMPANY accounts (student self-registers; no new admin creation)
const createUser = async (req, res) => {
  const { name, email, password, role, companyName, industry } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'name, email, password, role are required' });
  }
  if (!['tpo', 'company'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Admin can only create TPO or Company accounts here' });
  }
  if (role === 'company' && !companyName) {
    return res.status(400).json({ success: false, message: 'companyName is required when creating a company account' });
  }

  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

  const user = await User.create({ name, email, password, role, emailVerified: true });

  if (role === 'company') {
    await Company.create({ user: user._id, companyName, industry: industry || '' });
  }

  await logActivity(req.user, 'USER_CREATED', `${role}: ${email}`);
  res.status(201).json({ success: true, user: { id: user._id, name, email, role } });
};

// PUT /api/admin/users/:id/role  body: { role }
const updateUserRole = async (req, res) => {
  const { role } = req.body;
  if (!['student', 'tpo', 'admin', 'company'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const oldRole = user.role;
  user.role = role;
  await user.save();
  await logActivity(req.user, 'USER_ROLE_CHANGED', `${user.email}: ${oldRole} -> ${role}`);
  res.json({ success: true, user });
};

// PUT /api/admin/users/:id/status  body: { isActive }
const toggleUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.isActive = req.body.isActive;
  await user.save();
  await logActivity(req.user, user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', user.email);
  res.json({ success: true, user });
};

// DELETE /api/admin/users/:id — permanently delete user + cascade to profile, applications, notifications
const deleteUser = async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  // Prevent self-deletion
  if (req.user._id.toString() === targetUser._id.toString()) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
  }

  const email = targetUser.email;
  const role = targetUser.role;

  // Cascade: delete role-specific profile + related records
  if (role === 'student') {
    const profile = await Student.findOne({ user: targetUser._id });
    if (profile) {
      await Application.deleteMany({ student: profile._id });
      await profile.deleteOne();
    }
    await Notification.deleteMany({ recipient: targetUser._id });
  } else if (role === 'company') {
    const profile = await Company.findOne({ user: targetUser._id });
    if (profile) {
      await Drive.deleteMany({ company: profile._id });
      await profile.deleteOne();
    }
  }

  await targetUser.deleteOne();
  await logActivity(req.user, 'USER_DELETED', `${role}: ${email}`);
  res.json({ success: true, message: `User ${email} has been permanently deleted.` });
};

// GET /api/admin/system-info
const getSystemInfo = async (req, res) => {
  const [studentCount, companyCount, tpoCount, adminCount, driveCount, applicationCount] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'company' }),
    User.countDocuments({ role: 'tpo' }),
    User.countDocuments({ role: 'admin' }),
    Drive.countDocuments(),
    Application.countDocuments(),
  ]);

  const activeUsers = await User.countDocuments({ isActive: true });
  const inactiveUsers = await User.countDocuments({ isActive: false });

  res.json({
    success: true,
    systemInfo: {
      counts: { studentCount, companyCount, tpoCount, adminCount, driveCount, applicationCount },
      activeUsers,
      inactiveUsers,
      serverTime: new Date(),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  });
};

// GET /api/admin/activity-logs
const getActivityLogs = async (req, res) => {
  const logs = await ActivityLog.find().populate('actor', 'name email role').sort('-createdAt').limit(200);
  res.json({ success: true, count: logs.length, logs });
};

module.exports = { getUsers, createUser, updateUserRole, toggleUserStatus, deleteUser, getSystemInfo, getActivityLogs };

