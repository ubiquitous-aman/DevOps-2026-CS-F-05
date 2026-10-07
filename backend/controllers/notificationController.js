const Notification = require('../models/Notification');

// GET /api/notifications — inbox for any logged-in role (T&P sees company messages, companies see approvals...)
const list = async (req, res) => {
  if (process.env.NODE_ENV !== 'test') require('../utils/reminders').runReminderSweep().catch(() => {});
  const notifications = await Notification.find({ recipient: req.user._id }).sort('-createdAt').limit(100);
  const unread = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
  res.json({ success: true, count: notifications.length, unread, notifications });
};

// PUT /api/notifications/read-all
const readAll = async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
  res.json({ success: true });
};

// PUT /api/notifications/:id/read
const readOne = async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { isRead: true }, { new: true });
  if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, notification: n });
};

module.exports = { list, readAll, readOne };
