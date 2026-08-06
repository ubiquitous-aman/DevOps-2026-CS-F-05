const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

const generateOTP = () => {
  // Cryptographically stronger than Math.random for a 6-digit code
  const otp = crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, '0');
  return otp;
};

const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

const compareOTP = async (otp, hash) => {
  if (!hash) return false;
  return bcrypt.compare(otp, hash);
};

const getExpiry = () => new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

module.exports = { generateOTP, hashOTP, compareOTP, getExpiry, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS };
