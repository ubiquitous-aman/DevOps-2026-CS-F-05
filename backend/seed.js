/**
 * seed.js — creates default ADMIN and TPO accounts.
 * Run once after connecting to a fresh database:  npm run seed
 */
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');

const run = async () => {
  await connectDB();

  const defaults = [
    { name: 'System Admin', email: 'admin@placement.edu', password: 'Admin@123', role: 'admin' },
    { name: 'Placement Officer', email: 'tpo@placement.edu', password: 'Tpo@1234', role: 'tpo' },
  ];

  for (const d of defaults) {
    const exists = await User.findOne({ email: d.email });
    if (exists) {
      console.log(`[seed] ${d.email} already exists, skipping`);
      continue;
    }
    await User.create(d);
    console.log(`[seed] Created ${d.role}: ${d.email} / ${d.password}`);
  }

  console.log('[seed] Done. You can now log in with the accounts above.');
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
