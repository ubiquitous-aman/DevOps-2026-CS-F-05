const mongoose = require('mongoose');

/**
 * System-wide activity/audit log — powers Admin's
 * "Monitor Administrative Activity" screen.
 */
const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String },
    action: { type: String, required: true }, // e.g. "CREATED_DRIVE", "DEACTIVATED_USER"
    details: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
