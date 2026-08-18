const mongoose = require('mongoose');

/**
 * A recruitment "Round" inside a Drive's timetable — dates are defined
 * by the company itself, per the workflow spec.
 */
const roundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ['Aptitude', 'Technical Interview', 'HR Interview', 'Other'],
      required: true,
    },
    order: { type: Number, required: true }, // sequence: 1,2,3...
    date: { type: Date },
    venue: { type: String },
    description: { type: String },
  },
  { _id: true }
);

const driveSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // TPO who approved/created it

    jobTitle: { type: String, required: true },
    jobDescription: { type: String },
    jobType: { type: String, enum: ['Full-Time', 'Internship', 'Internship + PPO'], default: 'Full-Time' },
    packageLPA: { type: Number, required: true },
    location: { type: String },

    // Eligibility criteria — set by TPO Cell
    eligibility: {
      branches: [{ type: String }],
      batch: { type: Number },
      minCgpa: { type: Number, default: 0 },
      maxBacklogs: { type: Number, default: 0 },
      min10th: { type: Number, default: 0 },
      min12th: { type: Number, default: 0 },
    },

    rounds: [roundSchema],

    applicationDeadline: { type: Date, required: true },

    status: {
      type: String,
      enum: ['draft', 'published', 'closed', 'cancelled'],
      default: 'draft',
    },

    // Requirement submitted by company must be approved by TPO before publishing
    requirementStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // College & TPO added institutional requirements (e.g., NPTEL, MOOC, attendance)
    collegeRequirements: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Drive', driveSchema);
