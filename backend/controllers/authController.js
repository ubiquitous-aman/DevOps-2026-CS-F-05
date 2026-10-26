const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const Student = require('../models/Student');
const Company = require('../models/Company');
const jwt = require('jsonwebtoken');
const generateToken = require('../utils/generateToken');
const logActivity = require('../utils/logActivity');
const sendEmail = require('../utils/email');
const { generateOTP, hashOTP, compareOTP, getExpiry, MAX_OTP_ATTEMPTS } = require('../utils/otp');
const { Validator, passwordProblem, validateEligibility, BRANCHES } = require('../utils/validators');
const { validateDriveInput } = require('../utils/driveRules');

const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{3,19}$/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const studentDetails = (v, { phoneRequired }) =>
  v
    .name('name', { required: true })
    .email('email', { required: true })
    .phone('phone', { required: phoneRequired })
    .string('rollNumber', {
      required: true, label: 'Roll number', upper: true, pattern: ROLL_RE,
      patternMsg: 'Roll number must be 4-20 letters/digits (/ and - allowed)',
    })
    .oneOf('branch', BRANCHES, { required: true, label: 'Branch' })
    .integer('batch', { required: true, label: 'Batch (graduation year)', min: 2000, max: new Date().getFullYear() + 6 });

// @route POST /api/auth/register/student
const registerStudent = async (req, res) => {
  const v = studentDetails(new Validator(req.body), { phoneRequired: true }).password('password', { required: true });
  const conf = req.body.confirmPassword;
  if (conf === undefined || conf === '') v._err('confirmPassword', 'Please confirm your password');
  else if (conf !== req.body.password) v._err('confirmPassword', 'Passwords do not match');
  if (v.fail(res)) return;
  const { name, email, phone, rollNumber, branch, batch, password } = v.data;

  if (await User.findOne({ email })) return res.status(409).json({ success: false, message: 'Email already registered', errors: { email: 'Email already registered' } });
  if (await Student.findOne({ rollNumber })) return res.status(409).json({ success: false, message: 'Roll number already registered', errors: { rollNumber: 'Roll number already registered' } });

  await PendingRegistration.deleteMany({ $or: [{ email }, { rollNumber }] });

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const otpExpires = getExpiry();

  await PendingRegistration.create({
    name, email, password, rollNumber, branch, batch, phone, otpHash, otpExpires
  });
  
  await sendEmail({
    to: email,
    subject: 'Verify your Placement Portal account',
    text: `Your verification code is ${otp}. It expires in 10 minutes.`
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email for the verification code.',
    email: email
  });
};

// @route POST /api/auth/register/student/initiate
const initiateStudentRegistration = async (req, res) => {
  // kept for API compatibility
};

// @route POST /api/auth/register/verify-email
const verifyRegistrationOTP = async (req, res) => {
  const v = new Validator(req.body)
    .email('email', { required: true })
    .string('otp', { required: true, label: 'Verification code', pattern: /^\d{6}$/, patternMsg: 'Verification code must be 6 digits' });
  if (v.fail(res)) return;
  const { email, otp } = v.data;

  const pending = await PendingRegistration.findOne({ email });
  if (!pending) {
    return res.status(400).json({ success: false, message: 'Invalid or expired code. Please register again.' });
  }
  if (pending.otpAttempts >= MAX_OTP_ATTEMPTS) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    return res.status(429).json({ success: false, message: 'Too many attempts. Please register again to get a new code.' });
  }
  if (new Date() > new Date(pending.otpExpires)) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    return res.status(400).json({ success: false, message: 'This code has expired. Please register again to get a new code.' });
  }
  if (!(await compareOTP(otp, pending.otpHash))) {
    pending.otpAttempts += 1;
    await pending.save();
    const remaining = MAX_OTP_ATTEMPTS - pending.otpAttempts;
    return res.status(400).json({ success: false, message: `Incorrect code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Please register again.'}` });
  }

  const user = await User.create({ 
    name: pending.name, 
    email: pending.email, 
    password: pending.password, 
    role: 'student', 
    emailVerified: true 
  });
  
  const student = await Student.create({ 
    user: user._id, 
    rollNumber: pending.rollNumber, 
    branch: pending.branch, 
    batch: pending.batch, 
    phone: pending.phone 
  });

  await logActivity(user, 'STUDENT_REGISTERED', `${user.name} (${student.rollNumber})`);
  await PendingRegistration.deleteOne({ _id: pending._id });

  res.json({ 
    success: true, 
    message: 'Email verified successfully.',
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: student._id }
  });
};

// @route POST /api/auth/register/set-password
const setRegistrationPassword = async (req, res) => {
  // kept for API compatibility
};

// @route POST /api/auth/register/company
const registerCompany = async (req, res) => {
  const v = new Validator(req.body)
    .name('name', { required: true, label: 'Contact person name' })
    .email('email', { required: true })
    .password('password', { required: true })
    .string('companyName', { required: true, label: 'Company name', min: 2, max: 100 })
    .url('website', { label: 'Website' })
    .string('industry', { label: 'Industry', max: 60 })
    .string('description', { label: 'Description', max: 1000 })
    .phone('hrPhone', { label: 'HR phone' })
    .email('hrEmail', { label: 'HR email' });
  if (req.body.confirmPassword !== undefined && req.body.confirmPassword !== req.body.password) {
    v._err('confirmPassword', 'Passwords do not match');
  }
  if (v.fail(res)) return;
  const d = v.data;

  if (await User.findOne({ email: d.email })) {
    return res.status(409).json({ success: false, message: 'Email already registered', errors: { email: 'Email already registered' } });
  }
  if (await Company.findOne({ companyName: new RegExp(`^${escapeRegex(d.companyName)}$`, 'i') })) {
    return res.status(409).json({ success: false, message: 'A company with this name is already registered', errors: { companyName: 'A company with this name is already registered' } });
  }

  const user = await User.create({ name: d.name, email: d.email, password: d.password, role: 'company', emailVerified: true });
  const company = await Company.create({
    user: user._id,
    companyName: d.companyName,
    website: d.website,
    industry: d.industry,
    description: d.description,
    hrContact: { name: d.name, phone: d.hrPhone, email: d.hrEmail || d.email },
  });
  await logActivity(user, 'COMPANY_REGISTERED', d.companyName);
  res.status(201).json({
    success: true,
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: company._id },
  });
};

// @route POST /api/auth/login
const login = async (req, res) => {
  const v = new Validator(req.body)
    .email('email', { required: true })
    .string('password', { required: true, label: 'Password', max: 200 });
  if (v.fail(res)) return;
  const { email, password } = v.data;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
  }
  if (user.role === 'student' && !user.emailVerified) {
    return res.status(403).json({ success: false, message: 'Email not verified. Please complete registration by verifying your email.' });
  }

  user.lastLogin = new Date();
  await user.save();

  let profileId = null;
  if (user.role === 'student') profileId = (await Student.findOne({ user: user._id }))?._id;
  else if (user.role === 'company') profileId = (await Company.findOne({ user: user._id }))?._id;

  await logActivity(user, 'LOGIN', `${user.role} logged in`);
  res.json({
    success: true,
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId, mustChangePassword: !!user.mustChangePassword },
  });
};

// @route GET /api/auth/me
const getMe = async (req, res) => {
  const user = req.user;
  let profile = null;
  if (user.role === 'student') profile = await Student.findOne({ user: user._id });
  if (user.role === 'company') profile = await Company.findOne({ user: user._id });
  res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role, mustChangePassword: !!user.mustChangePassword }, profile });
};

// @route POST /api/auth/logout
const logout = async (req, res) => {
  await logActivity(req.user, 'LOGOUT', `${req.user.role} logged out`);
  res.json({ success: true, message: 'Logged out successfully' });
};

// @route POST /api/auth/change-password
const changePassword = async (req, res) => {
  const v = new Validator(req.body)
    .string('currentPassword', { required: true, label: 'Current password', max: 200 })
    .password('newPassword', { required: true, label: 'New password' })
    .string('confirmPassword', { required: true, label: 'Confirm password', max: 200 });
  if (!v.errors.newPassword && !v.errors.confirmPassword && req.body.confirmPassword !== req.body.newPassword) {
    v._err('confirmPassword', 'Passwords do not match');
  }
  if (!v.errors.newPassword && !v.errors.currentPassword && req.body.currentPassword === req.body.newPassword) {
    v._err('newPassword', 'New password must be different from your current password');
  }
  if (v.fail(res)) return;

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(v.data.currentPassword))) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect', errors: { currentPassword: 'Current password is incorrect' } });
  }
  user.password = v.data.newPassword;
  user.mustChangePassword = false;
  await user.save();
  await logActivity(user, 'PASSWORD_CHANGED', user.email);
  res.json({ success: true, message: 'Password changed successfully.', token: generateToken(user) });
};

// @route POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  const v = new Validator(req.body).email('email', { required: true });
  if (v.fail(res)) return;

  const user = await User.findOne({ email: v.data.email });
  const genericResponse = { success: true, message: 'If that email is registered, a verification code has been sent.' };
  if (!user || !user.isActive) return res.json(genericResponse);

  const otp = generateOTP();
  user.passwordResetOTPHash = await hashOTP(otp);
  user.passwordResetOTPExpires = getExpiry();
  user.passwordResetAttempts = 0;
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Your Placement Portal password reset code',
    html: `<p>Hi ${user.name},</p><p>Your one-time password reset code is:</p><h2 style="letter-spacing:4px;">${otp}</h2><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    text: `Your Placement Portal password reset code is ${otp}. It expires in 10 minutes.`,
  });
  await logActivity(user, 'PASSWORD_RESET_OTP_SENT', user.email);
  if (process.env.NODE_ENV === 'test') genericResponse.otpForTesting = otp;
  res.json(genericResponse);
};

// @route POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
  const v = new Validator(req.body)
    .email('email', { required: true })
    .string('otp', { required: true, label: 'Verification code', pattern: /^\d{6}$/, patternMsg: 'Verification code must be 6 digits' });
  if (v.fail(res)) return;

  const user = await User.findOne({ email: v.data.email }).select('+passwordResetOTPHash +passwordResetOTPExpires +passwordResetAttempts');
  if (!user || !user.passwordResetOTPHash) {
    return res.status(400).json({ success: false, message: 'Invalid or expired code. Please request a new one.' });
  }
  if (user.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new code.' });
  }
  if (new Date() > new Date(user.passwordResetOTPExpires)) {
    return res.status(400).json({ success: false, message: 'This code has expired. Please request a new one.' });
  }
  if (!(await compareOTP(v.data.otp, user.passwordResetOTPHash))) {
    user.passwordResetAttempts += 1;
    await user.save();
    return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
  }
  const resetToken = jwt.sign({ id: user._id, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.json({ success: true, message: 'Code verified.', resetToken });
};

// @route POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  const v = new Validator(req.body)
    .string('resetToken', { required: true, label: 'Reset token' })
    .password('newPassword', { required: true, label: 'New password' });
  if (req.body.confirmPassword !== undefined && req.body.confirmPassword !== req.body.newPassword) {
    v._err('confirmPassword', 'Passwords do not match');
  }
  if (v.fail(res)) return;
  const { resetToken, newPassword } = v.data;

  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ success: false, message: 'Reset session expired. Please start again.' });
  }
  if (decoded.purpose !== 'password_reset') return res.status(400).json({ success: false, message: 'Invalid reset token' });

  const user = await User.findById(decoded.id).select('+password +passwordResetOTPHash');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.passwordResetOTPHash) {
    return res.status(400).json({ success: false, message: 'This reset link has already been used. Please start again.' });
  }
  if (user.password && (await user.matchPassword(newPassword))) {
    return res.status(400).json({ success: false, message: 'New password cannot be the same as your old password. Please choose a different password.' });
  }
  user.password = newPassword;
  user.mustChangePassword = false;
  user.passwordResetOTPHash = undefined;
  user.passwordResetOTPExpires = undefined;
  user.passwordResetAttempts = 0;
  await user.save();
  await logActivity(user, 'PASSWORD_RESET_COMPLETED', user.email);
  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
};

module.exports = {
  registerStudent,
  initiateStudentRegistration,
  verifyRegistrationOTP,
  setRegistrationPassword,
  registerCompany,
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
