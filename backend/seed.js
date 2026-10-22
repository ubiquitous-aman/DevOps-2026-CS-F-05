/**
 * seed.js — creates default ADMIN and TPO accounts.
 * Run once after connecting to a fresh database:  npm run seed
 *
 * Set ADMIN_EMAIL / ADMIN_PASSWORD / TPO_EMAIL / TPO_PASSWORD in .env to use real mailboxes — needed if
 * you want the "Forgot password" e-mail OTP to reach Admin / T&P users.
 */
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const { passwordProblem } = require('./utils/validators');

const run = async () => {
  await connectDB();

  const defaults = [
    { name: 'System Admin', email: process.env.ADMIN_EMAIL || 'admin@placement.edu', password: process.env.ADMIN_PASSWORD || 'Admin@123', role: 'admin', usedDefault: !process.env.ADMIN_PASSWORD },
    { name: 'Placement Officer', email: process.env.TPO_EMAIL || 'tpo@placement.edu', password: process.env.TPO_PASSWORD || 'Tpo@1234', role: 'tpo', usedDefault: !process.env.TPO_PASSWORD },
  ];

  for (const d of defaults) {
    const problem = passwordProblem(d.password);
    if (problem) {
      console.error(`[seed] Password for ${d.email} rejected: ${problem}`);
      continue;
    }
    const exists = await User.findOne({ email: d.email.toLowerCase() });
    if (exists) {
      console.log(`[seed] ${d.email} already exists, skipping`);
      continue;
    }
    // Built-in default passwords are public (README) — force a change on first login. Custom ones from .env are kept as is.
    await User.create({ ...d, emailVerified: true, mustChangePassword: d.usedDefault });
    console.log(`[seed] Created ${d.role}: ${d.email} / ${d.password}`);
  }

  console.log('[seed] Done. You can now log in with the accounts above.');
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
