const ActivityLog = require('../models/ActivityLog');

const logActivity = async (actor, action, details = '') => {
  try {
    await ActivityLog.create({
      actor: actor?._id || actor?.id || null,
      actorRole: actor?.role || 'system',
      action,
      details,
    });
  } catch (err) {
    console.error('[ActivityLog] failed:', err.message);
  }
};

module.exports = logActivity;
