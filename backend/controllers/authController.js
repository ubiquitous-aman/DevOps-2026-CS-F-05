const User = require('../models/User');
const Student = require('../models/Student');
const Company = require('../models/Company');
const jwt = require('jsonwebtoken');
const generateToken = require('../utils/generateToken');
const logActivity = require('../utils/logActivity');
const sendEmail = require('../utils/email');
const { generateOTP, hashOTP, compareOTP, getExpiry, MAX_OTP_ATTEMPTS } = require('../utils/otp');

/**
 * Validates password strength:
 * - At least 8 characters
 * - Uppercase letter (A-Z)
 * - Lowercase letter (a-z)
 * - Number (0-9)
 * - Special character (!@#$%^&* etc.)
 */
const validatePasswordComplexity = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z)';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z)';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9)';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&* etc.)';
  }
  return null;
};

// =====================================================================
// STUDENT REGISTRATION — 3-step OTP flow
// Step 1: Collect details → store unverified user → send OTP
// Step 2: Verify OTP → issue short-lived setup token
// Step 3: Set password → account fully activated → issue JWT
// =====================================================================

// @desc  Step 1: Accept student details, store an unverified account, send OTP
// @route POST /api/auth/register/student/initiate
const initiateStudentRegistration = async (req, res) => {
  try {
    const { name, email, rollNumber, branch, batch, phone } = req.body;

    if (!name || !email || !rollNumber || !branch || !batch) {
      return res.status(400).json({ success: false, message: 'Please fill all required fields' });
    }

    // Check for duplicate email — if a fully verified account exists, reject.
    // If an unverified account exists (previous incomplete registration), allow
    // them to restart (overwrite the OTP so they can try again).
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const rollExists = await Student.findOne({ rollNumber });
    if (rollExists) {
      // Could be their own previous unfinished attempt — allow only if the
      // linked user is unverified and matches this email.
      const linkedUser = rollExists ? await User.findById(rollExists.user) : null;
      if (!linkedUser || linkedUser.emailVerified || linkedUser.email !== email) {
        return res.status(400).json({ success: false, message: 'Roll number already registered' });
      }
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const otpExpires = getExpiry();

    let user, student;

    if (existingUser) {
      // Restart incomplete registration — refresh OTP only, keep other fields
      existingUser.name = name;
      existingUser.registrationOTPHash = otpHash;
      existingUser.registrationOTPExpires = otpExpires;
      existingUser.registrationOTPAttempts = 0;
      await existingUser.save();
      user = existingUser;

      // Update student profile fields too (branch/batch may have changed)
      student = await Student.findOne({ user: user._id });
      if (student) {
        student.rollNumber = rollNumber;
        student.branch = branch;
        student.batch = batch;
        student.phone = phone;
        await student.save();
      } else {
        student = await Student.create({ user: user._id, rollNumber, branch, batch, phone });
      }
    } else {
      // Brand-new registration — no password yet (set in Step 3).
      // The User schema allows this because emailVerified defaults to false,
      // and password is only required once emailVerified === true.
      user = await User.create({
        name,
        email,
        role: 'student',
        emailVerified: false,
        registrationOTPHash: otpHash,
        registrationOTPExpires: otpExpires,
        registrationOTPAttempts: 0,
      });

      student = await Student.create({ user: user._id, rollNumber, branch, batch, phone });
    }

    await sendEmail({
      to: email,
      subject: 'Your College Placement Portal — Email Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
          <h2 style="color:#2563eb;">College Placement Portal</h2>
          <p>Hi ${name},</p>
          <p>Thanks for registering! Please verify your email address with the code below:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#1e293b;">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:0.9rem;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:0.8rem;">This email was sent by College Placement Portal. Do not reply to this email.</p>
        </div>`,
      text: `Your College Placement Portal email verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    });

    // In test env, expose OTP so automated tests can verify without a mailbox
    const response = { success: true, message: 'Verification code sent to your email address.' };
    if (process.env.NODE_ENV === 'test') response.otpForTesting = otp;

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Step 2: Verify the registration OTP, return a short-lived setup token
// @route POST /api/auth/register/verify-email
const verifyRegistrationOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required' });
    }

    const user = await User.findOne({ email }).select(
      '+registrationOTPHash +registrationOTPExpires +registrationOTPAttempts'
    );

    if (!user || !user.registrationOTPHash || user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code. Please register again.' });
    }

    if (user.registrationOTPAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Please register again to get a new code.' });
    }

    if (new Date() > new Date(user.registrationOTPExpires)) {
      return res.status(400).json({ success: false, message: 'This code has expired. Please register again to get a new code.' });
    }

    const valid = await compareOTP(otp, user.registrationOTPHash);
    if (!valid) {
      user.registrationOTPAttempts += 1;
      await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.registrationOTPAttempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Please register again.'}`,
      });
    }

    // OTP correct — mark email as verified, clear OTP fields
    user.emailVerified = true;
    user.registrationOTPHash = undefined;
    user.registrationOTPExpires = undefined;
    user.registrationOTPAttempts = 0;
    await user.save();

    // Issue a short-lived, single-purpose token for the password-setup step
    const setupToken = jwt.sign(
      { id: user._id, purpose: 'email_setup' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await logActivity(user, 'EMAIL_VERIFIED', email);

    res.json({ success: true, message: 'Email verified successfully.', setupToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Step 3: Set password using setup token — fully activates the account
// @route POST /api/auth/register/set-password
const setRegistrationPassword = async (req, res) => {
  try {
    const { setupToken, password } = req.body;
    if (!setupToken || !password) {
      return res.status(400).json({ success: false, message: 'Setup token and password are required' });
    }
    const complexityErr = validatePasswordComplexity(password);
    if (complexityErr) {
      return res.status(400).json({ success: false, message: complexityErr });
    }

    let decoded;
    try {
      decoded = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, message: 'Session expired. Please register again.' });
    }
    if (decoded.purpose !== 'email_setup') {
      return res.status(400).json({ success: false, message: 'Invalid setup token' });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email not verified. Please complete verification first.' });
    }

    // Set password — the pre-save hook in User.js will hash it
    user.password = password;
    await user.save();

    const student = await Student.findOne({ user: user._id });

    await logActivity(user, 'STUDENT_REGISTERED', `${user.name} (${student?.rollNumber || ''})`);

    res.status(201).json({
      success: true,
      token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: student?._id },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Register a new COMPANY
// @route POST /api/auth/register/company
const registerCompany = async (req, res) => {
  try {
    const { name, email, password, companyName, website, industry, description, hrPhone, hrEmail } = req.body;

    if (!name || !email || !password || !companyName) {
      return res.status(400).json({ success: false, message: 'Please fill all required fields' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await User.create({ name, email, password, role: 'company' });

    const placementRequirement = req.body.jobTitle
      ? {
        jobTitle: req.body.jobTitle,
        jobDescription: req.body.jobDescription || description || '',
        jobType: req.body.jobType || 'Full-Time',
        packageLPA: req.body.packageLPA ? Number(req.body.packageLPA) : undefined,
        location: req.body.location || '',
        eligibility: req.body.eligibility || {
          branches: req.body.branches
            ? Array.isArray(req.body.branches)
              ? req.body.branches
              : req.body.branches.split(',').map((s) => s.trim())
            : [],
          batch: req.body.batch ? Number(req.body.batch) : 2026,
          minCgpa: req.body.minCgpa ? Number(req.body.minCgpa) : 0,
          maxBacklogs: req.body.maxBacklogs ? Number(req.body.maxBacklogs) : 0,
          min10th: req.body.min10th ? Number(req.body.min10th) : 0,
          min12th: req.body.min12th ? Number(req.body.min12th) : 0,
        },
        applicationDeadline: req.body.applicationDeadline || undefined,
      }
      : undefined;

    const company = await Company.create({
      user: user._id,
      companyName,
      website,
      industry,
      description,
      hrContact: { name, phone: hrPhone, email: hrEmail || email },
      ...(placementRequirement ? { placementRequirement } : {}),
    });

    await logActivity(user, 'COMPANY_REGISTERED', companyName);

    res.status(201).json({
      success: true,
      token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId: company._id },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Login for ALL roles (student, tpo, admin, company)
// @route POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    // Block student accounts that started registration but never completed OTP verification
    if (user.role === 'student' && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please complete registration by verifying your email.',
      });
    }

    user.lastLogin = new Date();
    await user.save();

    let profileId = null;
    if (user.role === 'student') {
      const s = await Student.findOne({ user: user._id });
      profileId = s?._id;
    } else if (user.role === 'company') {
      const c = await Company.findOne({ user: user._id });
      profileId = c?._id;
    }

    await logActivity(user, 'LOGIN', `${user.role} logged in`);

    res.json({
      success: true,
      token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role, profileId },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Get currently logged-in user
// @route GET /api/auth/me
const getMe = async (req, res) => {
  const user = req.user;
  let profile = null;
  if (user.role === 'student') profile = await Student.findOne({ user: user._id });
  if (user.role === 'company') profile = await Company.findOne({ user: user._id });

  res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role }, profile });
};

// @desc  Logout (stateless JWT - just logs the event; client discards token)
// @route POST /api/auth/logout
const logout = async (req, res) => {
  await logActivity(req.user, 'LOGOUT', `${req.user.role} logged out`);
  res.json({ success: true, message: 'Logged out successfully' });
};

// =====================================================================
// FORGOT PASSWORD — Email OTP verification (3 steps)
// =====================================================================

// @desc  Step 1: request an OTP be emailed to the account's address
// @route POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email });

    // Always respond success (even if the email isn't registered) so this
    // endpoint can't be used to enumerate valid accounts.
    const genericResponse = {
      success: true,
      message: 'If that email is registered, a verification code has been sent.',
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const otp = generateOTP();
    user.passwordResetOTPHash = await hashOTP(otp);
    user.passwordResetOTPExpires = getExpiry();
    user.passwordResetAttempts = 0;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Your Placement Portal password reset code',
      html: `
        <p>Hi ${user.name},</p>
        <p>Your one-time password reset code is:</p>
        <h2 style="letter-spacing:4px;">${otp}</h2>
        <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
      text: `Your Placement Portal password reset code is ${otp}. It expires in 10 minutes.`,
    });

    await logActivity(user, 'PASSWORD_RESET_OTP_SENT', user.email);

    // In test/dev mode with no SMTP configured, the OTP is only visible in
    // the server console — exposing it here (test env only) lets the
    // automated test suite verify the flow without a real mailbox.
    if (process.env.NODE_ENV === 'test') {
      genericResponse.otpForTesting = otp;
    }

    res.json(genericResponse);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Step 2: verify the emailed OTP, get a short-lived reset token back
// @route POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    const user = await User.findOne({ email }).select('+passwordResetOTPHash +passwordResetOTPExpires +passwordResetAttempts');
    if (!user || !user.passwordResetOTPHash) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code. Please request a new one.' });
    }

    if (user.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new code.' });
    }

    if (new Date() > new Date(user.passwordResetOTPExpires)) {
      return res.status(400).json({ success: false, message: 'This code has expired. Please request a new one.' });
    }

    const valid = await compareOTP(otp, user.passwordResetOTPHash);
    if (!valid) {
      user.passwordResetAttempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
    }

    // OTP correct — issue a short-lived, single-purpose reset token instead
    // of trusting the client to remember it verified the OTP.
    const resetToken = jwt.sign({ id: user._id, purpose: 'password_reset' }, process.env.JWT_SECRET, {
      expiresIn: '10m',
    });

    res.json({ success: true, message: 'Code verified.', resetToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Step 3: set a new password using the verified reset token
// @desc  Step 3: set a new password using the verified reset token
// @route POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required' });
    }
    const complexityErr = validatePasswordComplexity(newPassword);
    if (complexityErr) {
      return res.status(400).json({ success: false, message: complexityErr });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, message: 'Reset session expired. Please start again.' });
    }
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset token' });
    }

    const user = await User.findById(decoded.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if new password is same as old password
    if (user.password && (await user.matchPassword(newPassword))) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as your old password. Please choose a different password.',
      });
    }

    user.password = newPassword; // pre-save hook re-hashes it
    user.passwordResetOTPHash = undefined;
    user.passwordResetOTPExpires = undefined;
    user.passwordResetAttempts = 0;
    await user.save();

    await logActivity(user, 'PASSWORD_RESET_COMPLETED', user.email);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  initiateStudentRegistration,
  verifyRegistrationOTP,
  setRegistrationPassword,
  registerCompany,
  login,
  getMe,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
