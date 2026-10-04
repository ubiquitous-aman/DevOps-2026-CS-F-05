/**
 * Emergency password reset from the command line (e.g. an Admin/T&P who forgot the password and has no
 * working mailbox for the e-mail OTP flow).
 *
 *   npm run reset-password -- admin@placement.edu "NewStrong@123"
 */
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const { passwordProblem } = require('../utils/validators');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run reset-password -- <email> "<new password>"');
    process.exit(1);
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  user.password = password;
  user.isActive = true;
  await user.save();
  console.log(`[reset-password] Password updated for ${user.email} (${user.role})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
