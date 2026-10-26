const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  rollNumber: { type: String, required: true, unique: true },
  branch: { type: String, required: true },
  batch: { type: Number, required: true },
  phone: { type: String, required: true },
  otpHash: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  otpAttempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // Auto-delete after 1 hour
});

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
