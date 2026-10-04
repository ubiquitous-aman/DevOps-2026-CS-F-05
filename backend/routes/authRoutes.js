const express = require('express');
const router = express.Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { wrapController, rateLimit } = require('../middleware/common');

const ctrl = wrapController(c);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => `login:${req.ip}`, message: 'Too many login attempts. Please try again in a few minutes.' });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (req) => `otp:${req.ip}`, message: 'Too many requests. Please try again in a few minutes.' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyFn: (req) => `register:${req.ip}`, message: 'Too many sign-ups from this network. Please try again later.' });

// ---- Registration ----
router.post('/register/student', registerLimiter, ctrl.registerStudent); // simple single-form sign-up
router.post('/register/student/initiate', otpLimiter, ctrl.initiateStudentRegistration); // legacy 3-step OTP flow
router.post('/register/verify-email', otpLimiter, ctrl.verifyRegistrationOTP);
router.post('/register/set-password', ctrl.setRegistrationPassword);
router.post('/register/company', registerLimiter, ctrl.registerCompany);

router.post('/login', loginLimiter, ctrl.login);
router.get('/me', protect, ctrl.getMe);
router.post('/logout', protect, ctrl.logout);
router.post('/change-password', protect, ctrl.changePassword);

router.post('/forgot-password', otpLimiter, ctrl.forgotPassword);
router.post('/verify-otp', otpLimiter, ctrl.verifyOtp);
router.post('/reset-password', ctrl.resetPassword);

module.exports = router;
