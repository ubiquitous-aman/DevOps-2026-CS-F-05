/**
 * notifyEmail.js — optional e-mail copy of in-app notifications.
 * Enabled only when EMAIL_NOTIFICATIONS=true AND SMTP (EMAIL_USER / EMAIL_PASS) is configured.
 * Never runs in tests and never blocks or breaks the request that created the notification.
 */
const enabled = () =>
  process.env.NODE_ENV !== 'test' && process.env.EMAIL_NOTIFICATIONS === 'true' && process.env.EMAIL_USER && process.env.EMAIL_PASS;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const emailNotifications = async (docs) => {
  if (!enabled()) return;
  const User = require('../models/User'); // lazy: avoids a circular require at load time
  const sendEmail = require('./email');
  const list = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  const users = await User.find({ _id: { $in: list.map((d) => d.recipient) }, isActive: true }).select('email');
  const byId = new Map(users.map((u) => [String(u._id), u.email]));
  for (const n of list) {
    const to = byId.get(String(n.recipient));
    if (!to) continue;
    try {
      await sendEmail({
        to,
        subject: `[Placement Portal] ${n.title}`,
        text: `${n.title}\n\n${n.message}\n\nLog in to the portal for details.`,
        html: `<div style="font-family:sans-serif"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.message)}</p><p style="color:#64748b">Log in to the Placement Portal for details.</p></div>`,
      });
    } catch (e) {
      console.error('[NotifyEmail]', e.message);
    }
  }
};

module.exports = { emailNotifications };
