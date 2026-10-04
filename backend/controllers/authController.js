const User = require('../models/User');
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

// Shared field rules for the student sign-up forms
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

// =====================================================================
// STUDENT REGISTRATION
//  - registerStudent        : simple single-form sign-up (used by the UI)
//  - initiate/verify/set... : original 3-step email-OTP flow (kept for API compatibility)
// =====================================================================

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

  const user = await User.create({ name, email, password, role: 'student', emailVerified: true });
  let student;
  try {
    student = await Student.create({ user: user._id, rollNumber, branch, batch, phone });
  } catch (err) {
    await user.deleteOne(); // never leave a user without a profile
    throw err;
  }
  await logActivity(user, 'STUDENT_REGISTERED', `${name} (${rollNumber})`);
  res.status(201).json({
    success: true,
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: student._id },
  });
};

// @route POST /api/auth/register/student/initiate  (Step 1 of the OTP flow)
const initiateStudentRegistration = async (req, res) => {
  const v = studentDetails(new Validator(req.body), { phoneRequired: false });
  if (v.fail(res)) return;
  const { name, email, rollNumber, branch, batch, phone } = v.data;

  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.emailVerified) {
    return res.status(400).json({ success: false, message: 'Email already registered' });
  }
  const rollExists = await Student.findOne({ rollNumber });
  if (rollExists) {
    const linkedUser = await User.findById(rollExists.user);
    if (!linkedUser || linkedUser.emailVerified || linkedUser.email !== email) {
      return res.status(400).json({ success: false, message: 'Roll number already registered' });
    }
  }

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const otpExpires = getExpiry();
  let user;

  if (existingUser) {
    existingUser.name = name;
    existingUser.registrationOTPHash = otpHash;
    existingUser.registrationOTPExpires = otpExpires;
    existingUser.registrationOTPAttempts = 0;
    await existingUser.save();
    user = existingUser;
    const student = await Student.findOne({ user: user._id });
    if (student) {
      Object.assign(student, { rollNumber, branch, batch, phone });
      await student.save();
    } else {
      await Student.create({ user: user._id, rollNumber, branch, batch, phone });
    }
  } else {
    user = await User.create({
      name, email, role: 'student', emailVerified: false,
      registrationOTPHash: otpHash, registrationOTPExpires: otpExpires, registrationOTPAttempts: 0,
    });
    await Student.create({ user: user._id, rollNumber, branch, batch, phone });
  }

  await sendEmail({
    to: email,
    subject: 'Your College Placement Portal — Email Verification Code',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#2563eb;">College Placement Portal</h2><p>Hi ${name},</p><p>Your email verification code is:</p><div style="background:#f1f5f9;border-radius:8px;padding:24px;text-align:center;margin:24px 0;"><span style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#1e293b;">${otp}</span></div><p style="color:#64748b;font-size:0.9rem;">This code expires in 10 minutes.</p></div>`,
    text: `Your College Placement Portal email verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
  });

  const response = { success: true, message: 'Verification code sent to your email address.' };
  if (process.env.NODE_ENV === 'test') response.otpForTesting = otp;
  res.status(200).json(response);
};

// @route POST /api/auth/register/verify-email  (Step 2)
const verifyRegistrationOTP = async (req, res) => {
  const v = new Validator(req.body)
    .email('email', { required: true })
    .string('otp', { required: true, label: 'Verification code', pattern: /^\d{6}$/, patternMsg: 'Verification code must be 6 digits' });
  if (v.fail(res)) return;
  const { email, otp } = v.data;

  const user = await User.findOne({ email }).select('+registrationOTPHash +registrationOTPExpires +registrationOTPAttempts');
  if (!user || !user.registrationOTPHash || user.emailVerified) {
    return res.status(400).json({ success: false, message: 'Invalid or expired code. Please register again.' });
  }
  if (user.registrationOTPAttempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Please register again to get a new code.' });
  }
  if (new Date() > new Date(user.registrationOTPExpires)) {
    return res.status(400).json({ success: false, message: 'This code has expired. Please register again to get a new code.' });
  }
  if (!(await compareOTP(otp, user.registrationOTPHash))) {
    user.registrationOTPAttempts += 1;
    await user.save();
    const remaining = MAX_OTP_ATTEMPTS - user.registrationOTPAttempts;
    return res.status(400).json({ success: false, message: `Incorrect code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Please register again.'}` });
  }

  user.emailVerified = true;
  user.registrationOTPHash = undefined;
  user.registrationOTPExpires = undefined;
  user.registrationOTPAttempts = 0;
  await user.save();
  const setupToken = jwt.sign({ id: user._id, purpose: 'email_setup' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  await logActivity(user, 'EMAIL_VERIFIED', email);
  res.json({ success: true, message: 'Email verified successfully.', setupToken });
};

// @route POST /api/auth/register/set-password  (Step 3)
const setRegistrationPassword = async (req, res) => {
  const v = new Validator(req.body)
    .string('setupToken', { required: true, label: 'Setup token' })
    .password('password', { required: true });
  if (v.fail(res)) return;
  const { setupToken, password } = v.data;

  let decoded;
  try {
    decoded = jwt.verify(setupToken, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ success: false, message: 'Session expired. Please register again.' });
  }
  if (decoded.purpose !== 'email_setup') return res.status(400).json({ success: false, message: 'Invalid setup token' });

  const user = await User.findById(decoded.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.emailVerified) return res.status(400).json({ success: false, message: 'Email not verified. Please complete verification first.' });

  user.password = password;
  await user.save();
  const student = await Student.findOne({ user: user._id });
  await logActivity(user, 'STUDENT_REGISTERED', `${user.name} (${student?.rollNumber || ''})`);
  res.status(201).json({
    success: true,
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: student?._id },
  });
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

  // Optional first placement requirement submitted together with the sign-up
  let requirement;
  if (req.body.jobTitle) {
    const dv = validateDriveInput(req.body, { role: 'company' });
    Object.entries(dv.v.errors).forEach(([k, m]) => v._err(k, m));
    const rawElig = req.body.eligibility || {
      branches: req.body.branches, batch: req.body.batch, minCgpa: req.body.minCgpa,
      maxBacklogs: req.body.maxBacklogs, min10th: req.body.min10th, min12th: req.body.min12th,
    };
    const cleaned = {};
    Object.entries(rawElig || {}).forEach(([k, val]) => { if (val !== undefined && val !== '') cleaned[k] = val; });
    const ev = validateEligibility(cleaned, { partial: true });
    Object.entries(ev.errors).forEach(([k, m]) => v._err(`eligibility.${k}`, m));
    requirement = { ...dv.data, eligibility: ev.data };
    delete requirement.openings;
    delete requirement.requiredDocuments;
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
    ...(requirement ? { placementRequirement: requirement } : {}),
  });
  await logActivity(user, 'COMPANY_REGISTERED', d.companyName);
  res.status(201).json({
    success: true,
    token: generateToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: company._id },
  });
};

// @route POST /api/auth/login   (all roles)
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

// @route POST /api/auth/change-password   (every role)
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
  // Older tokens stop working after a password change, so hand back a fresh one for this device
  res.json({ success: true, message: 'Password changed successfully.', token: generateToken(user) });
};

// =====================================================================
// FORGOT PASSWORD — Email OTP verification (all roles incl. T&P / Admin)
// =====================================================================

// @route POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  const v = new Validator(req.body).email('email', { required: true });
  if (v.fail(res)) return;

  const user = await User.findOne({ email: v.data.email });
  const genericResponse = { success: true, message: 'If that email is registered, a verification code has been sent.' };
  // Same answer for unknown / deactivated accounts so the endpoint can't be used to enumerate users.
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
