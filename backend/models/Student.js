const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    rollNumber: { type: String, required: true, unique: true, trim: true },
    branch: { type: String, required: true }, // e.g. CSE, ECE, ME
    batch: { type: Number, required: true }, // graduation year e.g. 2026
    phone: { type: String },

    // Academic Information
    academics: {
      tenthPercentage: { type: Number, min: 0, max: 100 },
      twelfthPercentage: { type: Number, min: 0, max: 100 },
      cgpa: { type: Number, min: 0, max: 10 },
      activeBacklogs: { type: Number, default: 0 },
    },

    // Resume
    resume: {
      fileName: String,
      filePath: String,
      uploadedAt: Date,
    },

    skills: [{ type: String }],

    isPlaced: { type: Boolean, default: false },
    placedCompany: { type: String, default: null },
    placedPackage: { type: Number, default: null }, // LPA
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
