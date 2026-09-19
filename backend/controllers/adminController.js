const User = require('../models/User');
const Student = require('../models/Student');
const Company = require('../models/Company');
const Drive = require('../models/Drive');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const logActivity = require('../utils/logActivity');
const fs = require('fs');
const path = require('path');
const { Validator, ROLES } = require('../utils/validators');
const { sendCsv } = require('../utils/csv');

const removeUpload = (webPath) => {
  try { if (webPath) fs.unlinkSync(path.join(__dirname, '..', webPath.replace(/^\//, ''))); } catch (e) { /* ignore */ }
};
const STAFF = ['tpo', 'admin'];

/** true when `user` is the only remaining active admin */
const isLastActiveAdmin = async (user) => {
  if (user.role !== 'admin' || !user.isActive) return false;
  return (await User.countDocuments({ role: 'admin', isActive: true, _id: { $ne: user._id } })) === 0;
};


// GET /api/admin/users?role=
const getUsers = async (req, res) => {
  const v = new Validator(req.query).oneOf('role', ROLES, { label: 'Role' });
  if (v.fail(res)) return;
  const { role } = v.data;
  const filter = role ? { role } : {};
  const users = await User.find(filter).sort('-createdAt');

  if (role === 'student') {
    const userIds = users.map((u) => u._id);
    const profiles = await Student.find({ user: { $in: userIds } }).lean();
    const profileMap = {};
    profiles.forEach((p) => { profileMap[p.user.toString()] = p; });
    const ids = profiles.map((p) => p._id);
    const placedStudentIds = new Set((await Application.find({ student: { $in: ids }, status: 'Selected' }).lean()).map((a) => a.student.toString()));
    const activeStudentIds = new Set((await Application.find({ student: { $in: ids }, status: { $in: ['Applied', 'In Process'] } }).lean()).map((a) => a.student.toString()));

    const enriched = users.map((u) => {
      const profile = profileMap[u._id.toString()];
      let placementStatus = 'Not Applied';
      if (profile) {
        if (placedStudentIds.has(profile._id.toString())) placementStatus = 'Placed';
        else if (activeStudentIds.has(profile._id.toString())) placementStatus = 'Applied / In Process';
      }
      return {
        ...u.toObject(),
        profile: profile
          ? { ...profile, roll: profile.rollNumber, cgpa: profile.academics?.cgpa }
          : null,
        placementStatus,
      };
    });
    return res.json({ success: true, count: enriched.length, users: enriched });
  }
  res.json({ success: true, count: users.length, users });
};

// POST /api/admin/users — create TPO or COMPANY accounts
const createUser = async (req, res) => {
  const v = new Validator(req.body)
    .name('name', { required: true })
    .email('email', { required: true })
    .password('password', { required: true })
    .oneOf('role', ['tpo', 'company'], { required: true, label: 'Role' });
  if (req.body && req.body.role === 'company') {
    v.string('companyName', { required: true, label: 'Company name', min: 2, max: 100 });
    v.string('industry', { label: 'Industry', max: 60 });
  }
  if (v.fail(res)) return;
  const { name, email, password, role, companyName, industry } = v.data;

  if (await User.findOne({ email })) {
    return res.status(409).json({ success: false, message: 'Email already in use', errors: { email: 'Email already in use' } });
  }
  if (role === 'company' && (await Company.findOne({ companyName: new RegExp(`^${companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))) {
    return res.status(409).json({ success: false, message: 'A company with this name already exists', errors: { companyName: 'Already exists' } });
  }

  const user = await User.create({ name, email, password, role, emailVerified: true, mustChangePassword: true });
  if (role === 'company') {
    try {
      await Company.create({ user: user._id, companyName, industry: industry || '', approvalStatus: 'approved', hrContact: { name, email } });
    } catch (err) {
      await user.deleteOne();
      throw err;
    }
  }
  await logActivity(req.user, 'USER_CREATED', `${role}: ${email}`);
  res.status(201).json({ success: true, user: { id: user._id, name, email, role } });
};

// PUT /api/admin/users/:id — edit name / email
const updateUser = async (req, res) => {
  const v = new Validator(req.body, { partial: true }).name('name').email('email');
  if (!Object.keys(v.data).length && v.ok) v._err('name', 'Nothing to update');
  if (v.fail(res)) return;

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (v.data.email && v.data.email !== user.email && (await User.findOne({ email: v.data.email }))) {
    return res.status(409).json({ success: false, message: 'Email already in use', errors: { email: 'Email already in use' } });
  }
  const before = `${user.name} <${user.email}>`;
  if (v.data.name) user.name = v.data.name;
  if (v.data.email) user.email = v.data.email;
  await user.save();
  await logActivity(req.user, 'USER_UPDATED', `${before} -> ${user.name} <${user.email}>`);
  res.json({ success: true, user });
};

// PUT /api/admin/users/:id/role  body: { role }
//   Only staff accounts (T&P <-> Admin) can change role. Student / Company accounts own a profile
//   (roll number, academics, company data...) that has no equivalent in another role, so converting
//   them would leave orphaned data — delete and re-create the account instead.
const updateUserRole = async (req, res) => {
  const v = new Validator(req.body).oneOf('role', ROLES, { required: true, label: 'Role' });
  if (v.fail(res)) return;
  const { role } = v.data;

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === role) return res.status(400).json({ success: false, message: `User already has the role '${role}'`, errors: { role: 'No change' } });
  if (req.user._id.toString() === user._id.toString()) {
    return res.status(400).json({ success: false, message: 'You cannot change your own role' });
  }
  if (!STAFF.includes(user.role) || !STAFF.includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Only T&P and Admin accounts can switch roles. Student and Company accounts are tied to their own profile — create a new account instead.',
      errors: { role: 'Not allowed for this account type' },
    });
  }
  if (await isLastActiveAdmin(user)) {
    return res.status(400).json({ success: false, message: 'You cannot change the role of the last active admin' });
  }
  const oldRole = user.role;
  user.role = role;
  await user.save();
  await Notification.create({ recipient: user._id, title: 'Your role was changed', message: `An administrator changed your role from ${oldRole} to ${role}. Please sign in again.`, type: 'system' });
  await logActivity(req.user, 'USER_ROLE_CHANGED', `${user.email}: ${oldRole} -> ${role}`);
  res.json({ success: true, user });
};

// PUT /api/admin/users/:id/status  body: { isActive }
const toggleUserStatus = async (req, res) => {
  const v = new Validator(req.body).boolean('isActive', { required: true, label: 'isActive' });
  if (v.fail(res)) return;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!v.data.isActive) {
    if (req.user._id.toString() === user._id.toString()) return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    if (await isLastActiveAdmin(user)) return res.status(400).json({ success: false, message: 'You cannot deactivate the last active admin' });
  }
  user.isActive = v.data.isActive;
  await user.save();
  await logActivity(req.user, user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', user.email);
  res.json({ success: true, user });
};

// PUT /api/admin/users/:id/password  body: { newPassword } — admin resets someone else's password
const resetUserPassword = async (req, res) => {
  const v = new Validator(req.body).password('newPassword', { required: true, label: 'New password' });
  if (v.fail(res)) return;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (req.user._id.toString() === user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Use "Change password" for your own account' });
  }
  user.password = v.data.newPassword;
  user.mustChangePassword = true;
  user.passwordResetOTPHash = undefined;
  user.passwordResetOTPExpires = undefined;
  await user.save();
  await Notification.create({ recipient: user._id, title: 'Password reset', message: 'An administrator reset your password. Please change it after signing in.', type: 'system' });
  await logActivity(req.user, 'USER_PASSWORD_RESET', user.email);
  res.json({ success: true, message: `Password for ${user.email} has been reset.` });
};

// DELETE /api/admin/users/:id — permanently delete a user and everything that belongs to them
const deleteUser = async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });
  if (req.user._id.toString() === target._id.toString()) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
  }
  if (await isLastActiveAdmin(target)) {
    return res.status(400).json({ success: false, message: 'You cannot delete the last active admin' });
  }

  const { email, role } = target;
  const summary = {};

  if (role === 'student') {
    const profile = await Student.findOne({ user: target._id });
    if (profile) {
      summary.applications = (await Application.deleteMany({ student: profile._id })).deletedCount;
      removeUpload(profile.resume && profile.resume.filePath);
      await profile.deleteOne();
    }
  } else if (role === 'company') {
    const profile = await Company.findOne({ user: target._id });
    if (profile) {
      const drives = await Drive.find({ company: profile._id }).select('_id');
      const driveIds = drives.map((d) => d._id);
      // students who were placed through this company must lose that placement
      const selected = await Application.find({ drive: { $in: driveIds }, status: 'Selected' }).select('student');
      const affected = [...new Set(selected.map((a) => String(a.student)))];
      summary.applications = (await Application.deleteMany({ drive: { $in: driveIds } })).deletedCount;
      await Notification.deleteMany({ relatedDrive: { $in: driveIds } });
      summary.drives = (await Drive.deleteMany({ company: profile._id })).deletedCount;
      for (const sid of affected) {
        const other = await Application.findOne({ student: sid, status: 'Selected' }).populate({ path: 'drive', populate: { path: 'company', select: 'companyName' } });
        const st = await Student.findById(sid);
        if (!st) continue;
        st.isPlaced = !!other;
        st.placedCompany = other ? other.drive.company.companyName : null;
        st.placedPackage = other ? other.offeredPackageLPA || other.drive.packageLPA : null;
        await st.save();
      }
      await profile.deleteOne();
    }
  }
  await Notification.deleteMany({ recipient: target._id });
  await target.deleteOne();
  await logActivity(req.user, 'USER_DELETED', `${role}: ${email}`);
  res.json({ success: true, message: `User ${email} has been permanently deleted.`, deleted: summary });
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

// GET /api/admin/activity-logs?action=&q=&page=1&limit=50
const getActivityLogs = async (req, res) => {
  const q = req.query || {};
  const filter = {};
  if (typeof q.action === 'string' && /^[A-Z_]{2,60}$/.test(q.action)) filter.action = q.action;
  if (typeof q.q === 'string' && q.q.trim()) {
    const rx = new RegExp(q.q.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const actors = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id');
    filter.$or = [{ details: rx }, { actor: { $in: actors.map((a) => a._id) } }];
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const total = await ActivityLog.countDocuments(filter);
  const logs = await ActivityLog.find(filter).populate('actor', 'name email role').sort('-createdAt').skip((page - 1) * limit).limit(limit);
  const actions = await ActivityLog.distinct('action');
  res.json({ success: true, count: logs.length, total, page, pages: Math.max(Math.ceil(total / limit), 1), actions: actions.sort(), logs });
};

// PUT /api/admin/users/bulk-status  body: { batch, isActive } — (de)activate every student of a graduation year
const bulkStudentStatus = async (req, res) => {
  const v = new Validator(req.body)
    .integer('batch', { required: true, label: 'Batch (graduation year)', min: 2000, max: new Date().getFullYear() + 6 })
    .boolean('isActive', { required: true, label: 'isActive' });
  if (v.fail(res)) return;
  const students = await Student.find({ batch: v.data.batch }).select('user');
  const ids = students.map((st) => st.user);
  const result = await User.updateMany({ _id: { $in: ids }, role: 'student' }, { isActive: v.data.isActive });
  await logActivity(req.user, v.data.isActive ? 'BULK_USERS_ACTIVATED' : 'BULK_USERS_DEACTIVATED', `Batch ${v.data.batch}: ${result.modifiedCount} account(s)`);
  res.json({ success: true, matched: ids.length, changed: result.modifiedCount, message: `${result.modifiedCount} student account(s) of batch ${v.data.batch} ${v.data.isActive ? 'activated' : 'deactivated'}.` });
};

// GET /api/admin/export/users?role=  — CSV of accounts (a simple data backup of who has access)
const exportUsers = async (req, res) => {
  const v = new Validator(req.query).oneOf('role', ROLES, { label: 'Role' });
  if (v.fail(res)) return;
  const users = await User.find(v.data.role ? { role: v.data.role } : {}).sort('role email');
  await logActivity(req.user, 'EXPORT_USERS', `${users.length} row(s)`);
  sendCsv(res, 'users.csv', [
    { header: 'Name', value: (u) => u.name },
    { header: 'Email', value: (u) => u.email },
    { header: 'Role', value: (u) => u.role },
    { header: 'Active', value: (u) => (u.isActive ? 'Yes' : 'No') },
    { header: 'Created', value: (u) => u.createdAt },
    { header: 'Last Login', value: (u) => u.lastLogin },
  ], users);
};

module.exports = { getUsers, createUser, updateUser, updateUserRole, toggleUserStatus, resetUserPassword, deleteUser, getSystemInfo, getActivityLogs, bulkStudentStatus, exportUsers };
