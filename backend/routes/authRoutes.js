const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// ---- Student registration (3-step OTP flow) ----
router.post('/register/student/initiate', initiateStudentRegistration);
router.post('/register/verify-email', verifyRegistrationOTP);
router.post('/register/set-password', setRegistrationPassword);

router.post('/register/company', registerCompany);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

module.exports = router;
