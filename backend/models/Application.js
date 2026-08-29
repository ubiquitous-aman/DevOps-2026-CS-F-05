const mongoose = require('mongoose');

const roundResultSchema = new mongoose.Schema(
  {
    round: { type: mongoose.Schema.Types.ObjectId, required: true }, // references Drive.rounds._id
    roundName: { type: String, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Cleared', 'Rejected'],
      default: 'Pending',
    },
    feedback: { type: String, default: '' }, // Company's recruitment feedback
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Application state machine (strictly validated in the controller):
 * Applied -> In Process -> Selected | Rejected
 * A student may also Withdraw while status is Applied/In Process.
 */
const applicationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    drive: { type: mongoose.Schema.Types.ObjectId, ref: 'Drive', required: true },

    status: {
      type: String,
      enum: ['Applied', 'In Process', 'Selected', 'Rejected', 'Withdrawn'],
      default: 'Applied',
    },

    currentRoundIndex: { type: Number, default: 0 }, // which round the candidate is currently at
    roundResults: [roundResultSchema],

    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A student can only apply once per drive
applicationSchema.index({ student: 1, drive: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
