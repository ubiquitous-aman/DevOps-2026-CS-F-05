const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Central User model — used for authentication across all 4 roles:
 * STUDENT, TPO, ADMIN, COMPANY.
 * Role-specific data lives in Student.js / Company.js and is linked via `profileRef`.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: {
      type: String,
      // Password is not required during initial OTP registration step.
      // It becomes mandatory once the account completes verification (emailVerified=true),
      // or for roles (company, admin, tpo) created with passwords directly.
      required: function () {
        return this.role !== 'student' || this.emailVerified === true;
      },
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'tpo', 'admin', 'company'],
      required: true,
    },
    isActive: { type: Boolean, default: true }, // Admin can activate/deactivate
    lastLogin: { type: Date },

    // ---- Forgot Password / Email OTP ----
    passwordResetOTPHash: { type: String, select: false },
    passwordResetOTPExpires: { type: Date, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },

    // ---- Registration Email Verification ----
    // Kept separate from forgot-password OTP so the two flows never clash.
    emailVerified: { type: Boolean, default: false },
    registrationOTPHash: { type: String, select: false },
    registrationOTPExpires: { type: Date, select: false },
    registrationOTPAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
