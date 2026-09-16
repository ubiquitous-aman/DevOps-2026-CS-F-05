/**
 * driveRules.js — validation + business rules shared by the Company "submit requirement"
 * endpoint and the T&P "create / edit drive" endpoints.
 */
const Drive = require('../models/Drive');
const {
  Validator, validateEligibility, validateRounds, JOB_TYPES, DOCUMENT_TYPES, MAX_DEADLINE_DAYS,
} = require('./validators');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param body    request body
 * @param opts    { partial, role: 'company' | 'tpo', existing?: Drive }
 * @returns       { ok, errors, data }  — `data` is a clean object safe to assign to a Drive
 */
function validateDriveInput(body, { partial = false, role = 'tpo', existing = null } = {}) {
  const v = new Validator(body, { partial })
    .string('jobTitle', { required: true, label: 'Job title', min: 3, max: 100 })
    .string('jobDescription', { label: 'Job description', max: 2000, allowEmpty: true })
    .oneOf('jobType', JOB_TYPES, { label: 'Job type' })
    .number('packageLPA', { required: true, label: 'Package / CTC (LPA)', exclusiveMin: 0, max: 500, decimals: 2 })
    .integer('openings', { label: 'Number of openings', min: 1, max: 10000 })
    .string('location', { label: 'Location', max: 100, allowEmpty: true })
    .stringArray('requiredDocuments', { label: 'Required documents', allowed: DOCUMENT_TYPES, max: DOCUMENT_TYPES.length });

  // Application deadline: valid, in the future and within a year. On edit, an unchanged (already past)
  // deadline is tolerated so unrelated fields can still be edited.
  const deadlineUnchanged = existing && body.applicationDeadline !== undefined &&
    new Date(body.applicationDeadline).getTime() === new Date(existing.applicationDeadline).getTime();
  v.date('applicationDeadline', {
    required: true,
    label: 'Application deadline',
    future: !deadlineUnchanged,
    maxDaysAhead: MAX_DEADLINE_DAYS,
  });
  const deadline = v.data.applicationDeadline || (existing && existing.applicationDeadline && new Date(existing.applicationDeadline));

  // Drive (on-campus) date — only the T&P cell sets it; must come after the application deadline.
  let driveDate;
  if (role === 'tpo') {
    v.date('driveDate', {
      label: 'Drive date/time',
      after: deadline instanceof Date ? deadline : undefined,
      afterLabel: 'the application deadline',
    });
    driveDate = v.data.driveDate;
    v.string('collegeRequirements', { label: 'College requirements', max: 1000, allowEmpty: true });
  }

  // Eligibility criteria (T&P decides eligibility)
  if (body.eligibility !== undefined) {
    if (!body.eligibility || typeof body.eligibility !== 'object' || Array.isArray(body.eligibility)) {
      v._err('eligibility', 'Eligibility criteria are invalid');
    } else {
      const src = role === 'tpo' ? body.eligibility : {
        minCgpa: body.eligibility.minCgpa, maxBacklogs: body.eligibility.maxBacklogs,
        min10th: body.eligibility.min10th, min12th: body.eligibility.min12th,
      };
      Object.keys(src).forEach((k) => src[k] === undefined && delete src[k]);
      const ev = validateEligibility(src, { partial: true });
      Object.entries(ev.errors).forEach(([k, m]) => v._err(`eligibility.${k}`, m));
      v.data.eligibility = ev.data;
    }
  }

  // Rounds — companies may only propose round names; dates / venues belong to the T&P cell.
  if (body.rounds !== undefined) {
    const { rounds, errors } = validateRounds(body.rounds, { allowSchedule: role === 'tpo', deadline: deadline instanceof Date ? deadline : undefined });
    errors.forEach((e) => v._err(`rounds.${e.index}`, e.message));
    v.data.rounds = rounds;
  }

  return { ok: v.ok, v, data: v.data, driveDate };
}

/** An open (draft/published) drive for the same company with the same title already exists? */
async function findDuplicateDrive(companyId, jobTitle, excludeId) {
  const filter = {
    company: companyId,
    jobTitle: new RegExp(`^${escapeRegex(jobTitle)}$`, 'i'),
    status: { $in: ['draft', 'published'] },
    requirementStatus: { $ne: 'rejected' },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Drive.findOne(filter);
}

module.exports = { validateDriveInput, findDuplicateDrive, escapeRegex };
