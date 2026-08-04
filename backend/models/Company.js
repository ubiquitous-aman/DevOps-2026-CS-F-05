const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    companyName: { type: String, required: true, trim: true },
    website: { type: String },
    industry: { type: String },
    description: { type: String },
    hrContact: {
      name: String,
      phone: String,
      email: String,
    },
    // Company submits a placement requirement; TPO approves/rejects it,
    // and only then does it become an active Drive.
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Initial placement drive requirements submitted by company
    placementRequirement: {
      jobTitle: { type: String },
      jobDescription: { type: String },
      jobType: { type: String, enum: ['Full-Time', 'Internship', 'Internship + PPO'], default: 'Full-Time' },
      packageLPA: { type: Number },
      location: { type: String },
      eligibility: {
        branches: [{ type: String }],
        batch: { type: Number },
        minCgpa: { type: Number, default: 0 },
        maxBacklogs: { type: Number, default: 0 },
        min10th: { type: Number, default: 0 },
        min12th: { type: Number, default: 0 },
      },
      rounds: [
        {
          name: { type: String },
          order: { type: Number },
          date: { type: Date },
          venue: { type: String },
          description: { type: String },
        },
      ],
      applicationDeadline: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
