/**
 * reminders.js — remaining-time notifications.
 *
 *  - Application deadline approaching (48 h and 6 h before) -> eligible students who have not applied yet
 *  - Interview / test round approaching (24 h and 2 h before) -> students whose application is at that round
 *
 * Each reminder carries a `reminderKey` (recipient + reminder); a unique sparse index guarantees a student
 * never receives the same reminder twice, no matter how often the sweep runs.
 */
const Drive = require('../models/Drive');
const Student = require('../models/Student');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const { isEligible } = require('../controllers/studentController');

const HOUR = 3600 * 1000;
const DEADLINE_STEPS = [6, 48]; // hours (smallest first)
const ROUND_STEPS = [2, 24];
let lastRun = 0;

const humanRemaining = (ms) => {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 90) return `${mins} minute(s)`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour(s)`;
  return `${Math.round(hrs / 24)} day(s)`;
};
const stepFor = (ms, steps) => steps.find((h) => ms <= h * HOUR);

const insertUnique = async (docs) => {
  if (!docs.length) return 0;
  try {
    const res = await Notification.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    if (err.code === 11000 || err.writeErrors) return err.insertedDocs ? err.insertedDocs.length : (err.result && err.result.insertedCount) || 0;
    throw err;
  }
};

async function runReminderSweep({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRun < 5 * 60 * 1000) return { skipped: true };
  lastRun = now;
  let created = 0;

  // 1) deadline reminders
  const horizon = new Date(now + Math.max(...DEADLINE_STEPS) * HOUR);
  const drives = await Drive.find({ status: 'published', applicationDeadline: { $gt: new Date(now), $lte: horizon } })
    .populate('company', 'companyName');
  if (drives.length) {
    const students = await Student.find().populate('user', '_id isActive');
    for (const drive of drives) {
      const remaining = new Date(drive.applicationDeadline).getTime() - now;
      const step = stepFor(remaining, DEADLINE_STEPS);
      if (!step) continue;
      const applied = new Set((await Application.find({ drive: drive._id }).select('student')).map((a) => String(a.student)));
      const docs = students
        .filter((s) => s.user && s.user.isActive && !applied.has(String(s._id)) && isEligible(s, drive).eligible)
        .map((s) => ({
          recipient: s.user._id,
          title: `⏰ Deadline in ${humanRemaining(remaining)}: ${drive.company?.companyName || 'Drive'}`,
          message: `Applications for "${drive.jobTitle}" close on ${new Date(drive.applicationDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (about ${humanRemaining(remaining)} left). Apply before it closes!`,
          type: 'reminder',
          relatedDrive: drive._id,
          reminderKey: `${s.user._id}:deadline:${drive._id}:${step}h`,
        }));
      created += await insertUnique(docs);
    }
  }

  // 2) upcoming round reminders
  const active = await Application.find({ status: { $in: ['Applied', 'In Process'] } })
    .populate({ path: 'drive', populate: { path: 'company', select: 'companyName' } })
    .populate({ path: 'student', select: 'user' });
  const docs = [];
  for (const app of active) {
    const round = app.drive?.rounds?.find((r) => String(r._id) === String(app.roundResults[app.currentRoundIndex]?.round));
    if (!round || !round.date || app.drive.status === 'cancelled') continue;
    const remaining = new Date(round.date).getTime() - now;
    if (remaining <= 0) continue;
    const step = stepFor(remaining, ROUND_STEPS);
    if (!step) continue;
    docs.push({
      recipient: app.student.user,
      title: `📅 ${round.name} in ${humanRemaining(remaining)}`,
      message: `${app.drive.company?.companyName || ''} — "${app.drive.jobTitle}": ${round.name} on ${new Date(round.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${round.venue ? ` at ${round.venue}` : ''}.`,
      type: 'reminder',
      relatedDrive: app.drive._id,
      reminderKey: `${app.student.user}:round:${app._id}:${round._id}:${step}h:${new Date(round.date).getTime()}`,
    });
  }
  created += await insertUnique(docs);
  return { created };
}

module.exports = { runReminderSweep, humanRemaining };
