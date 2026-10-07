const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['drive', 'application', 'result', 'system', 'company', 'reminder', 'schedule'],
      default: 'system',
    },
    relatedDrive: { type: mongoose.Schema.Types.ObjectId, ref: 'Drive' },
    isRead: { type: Boolean, default: false },
    // Used by remaining-time reminders so the same reminder is never sent twice to a user
    // (value includes the recipient id, so a single sparse unique index is enough)
    reminderKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Optional e-mail copy of every notification (see utils/notifyEmail.js — off unless EMAIL_NOTIFICATIONS=true)
const mail = (docs) => { require('../utils/notifyEmail').emailNotifications(docs).catch((e) => console.error('[NotifyEmail]', e.message)); };
notificationSchema.post('insertMany', (docs) => mail(docs));
notificationSchema.post('save', (doc) => mail(doc));

module.exports = mongoose.model('Notification', notificationSchema);
