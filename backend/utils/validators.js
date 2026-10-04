/**
 * validators.js — central server-side input validation.
 *
 * Every API endpoint builds a `Validator` from req.body (or req.query), declares
 * the rules for each field, and calls `v.fail(res)` BEFORE touching authorization
 * decisions that depend on data, business rules or the database:
 *
 *    Request -> validate input -> check role/ownership -> business rules -> DB
 *
 * The frontend has an equivalent (frontend/js/validate.js) for instant feedback, but
 * this file is the source of truth: it never trusts what the browser sent.
 */
const mongoose = require('mongoose');

// ------------------------------- constants -------------------------------
const BRANCHES = ['CSE', 'CSE(AI)', 'CSE(DS)', 'CSE(IoT)', 'IT', 'ECE', 'EEE', 'ME', 'CE'];
const JOB_TYPES = ['Full-Time', 'Internship', 'Internship + PPO'];
const ROUND_NAMES = ['Aptitude', 'Technical Interview', 'HR Interview', 'Other'];
const DOCUMENT_TYPES = ['Resume', 'Marksheets', 'ID Proof', 'Cover Letter', 'Portfolio'];
const ROLES = ['student', 'tpo', 'admin', 'company'];

const NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile numbers
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{3,19}$/;
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

const MAX_BATCH_AHEAD = 6;
const MAX_DEADLINE_DAYS = 365;

const isPlainString = (x) => typeof x === 'string';
const isBlank = (x) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');

/** Returns an error message for a weak password, or null if it is strong enough. */
const passwordProblem = (password) => {
  if (!isPlainString(password) || password.length < 8) return 'Password must be at least 8 characters long';
  if (password.length > 72) return 'Password must be at most 72 characters long';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter (A-Z)';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter (a-z)';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number (0-9)';
  if (!SPECIAL_RE.test(password)) return 'Password must contain at least one special character (!@#$%^&* etc.)';
  if (/\s/.test(password)) return 'Password must not contain spaces';
  return null;
};

const maxBatchYear = () => new Date().getFullYear() + MAX_BATCH_AHEAD;
const MIN_BATCH_YEAR = 2000;

class Validator {
  /**
   * @param {object} source  usually req.body
   * @param {object} opts    { partial: true } => fields that are absent are simply skipped
   */
  constructor(source, opts = {}) {
    this.src = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    this.errors = {};
    this.data = {};
    this.partial = !!opts.partial;
  }

  // ---- internals ----
  _err(field, msg) {
    if (!this.errors[field]) this.errors[field] = msg;
  }
  /** returns true when the field should be skipped (absent/blank & not required) */
  _skip(field, { required, label, allowEmpty }) {
    const val = this.src[field];
    if (isBlank(val)) {
      if (val === undefined && this.partial && !required) return true;
      if (required && !(this.partial && val === undefined)) {
        this._err(field, `${label || field} is required`);
        return true;
      }
      if (required && this.partial && val === undefined) return true;
      if (allowEmpty && val !== undefined) this.data[field] = '';
      return true;
    }
    return false;
  }

  // ---- field rules ----
  string(field, o = {}) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    let val = this.src[field];
    if (!isPlainString(val)) return this._err(field, `${label} must be text`), this;
    val = val.trim();
    if (o.min && val.length < o.min) return this._err(field, `${label} must be at least ${o.min} characters`), this;
    if (o.max && val.length > o.max) return this._err(field, `${label} must be at most ${o.max} characters`), this;
    if (o.pattern && !o.pattern.test(val)) return this._err(field, o.patternMsg || `${label} has an invalid format`), this;
    if (o.upper) val = val.toUpperCase();
    this.data[field] = val;
    return this;
  }
  name(field, o = {}) {
    return this.string(field, { min: 2, max: 60, pattern: NAME_RE, patternMsg: `${o.label || 'Name'} may contain only letters, spaces and . ' -`, label: 'Name', ...o });
  }
  email(field, o = {}) {
    const label = o.label || 'Email';
    if (this._skip(field, { label, ...o })) return this;
    const val = this.src[field];
    if (!isPlainString(val)) return this._err(field, `${label} must be text`), this;
    const e = val.trim().toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e)) return this._err(field, `Please enter a valid ${label.toLowerCase()} address`), this;
    this.data[field] = e;
    return this;
  }
  phone(field, o = {}) {
    const label = o.label || 'Phone number';
    if (this._skip(field, { label, ...o })) return this;
    const val = this.src[field];
    if (!isPlainString(val) && typeof val !== 'number') return this._err(field, `${label} is invalid`), this;
    let digits = String(val).replace(/[\s-]/g, '');
    digits = digits.replace(/^(\+91|91|0)(?=\d{10}$)/, '');
    if (!PHONE_RE.test(digits)) return this._err(field, `${label} must be a valid 10-digit mobile number`), this;
    this.data[field] = digits;
    return this;
  }
  password(field, o = {}) {
    const label = o.label || 'Password';
    if (this._skip(field, { label, ...o })) return this;
    const val = this.src[field];
    const problem = passwordProblem(val);
    if (problem) return this._err(field, problem), this;
    this.data[field] = val; // never trimmed
    return this;
  }
  integer(field, o = {}) {
    return this._num(field, { ...o, int: true });
  }
  number(field, o = {}) {
    return this._num(field, o);
  }
  _num(field, o) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    const raw = this.src[field];
    if (typeof raw === 'boolean' || (typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && raw.trim() === '')) {
      return this._err(field, `${label} must be a number`), this;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return this._err(field, `${label} must be a valid number`), this;
    if (o.int && !Number.isInteger(n)) return this._err(field, `${label} must be a whole number`), this;
    if (o.min !== undefined && n < o.min) return this._err(field, `${label} must be at least ${o.min}`), this;
    if (o.max !== undefined && n > o.max) return this._err(field, `${label} must be at most ${o.max}`), this;
    if (o.exclusiveMin !== undefined && n <= o.exclusiveMin) return this._err(field, `${label} must be greater than ${o.exclusiveMin}`), this;
    if (o.decimals !== undefined && Math.round(n * 10 ** o.decimals) / 10 ** o.decimals !== n) {
      return this._err(field, `${label} may have at most ${o.decimals} decimal places`), this;
    }
    this.data[field] = n;
    return this;
  }
  boolean(field, o = {}) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    const val = this.src[field];
    if (val === true || val === 'true') this.data[field] = true;
    else if (val === false || val === 'false') this.data[field] = false;
    else this._err(field, `${label} must be true or false`);
    return this;
  }
  oneOf(field, allowed, o = {}) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    const val = this.src[field];
    if (!isPlainString(val) || !allowed.includes(val)) {
      return this._err(field, `${label} must be one of: ${allowed.join(', ')}`), this;
    }
    this.data[field] = val;
    return this;
  }
  url(field, o = {}) {
    const label = o.label || 'URL';
    if (this._skip(field, { label, ...o })) return this;
    const val = this.src[field];
    const parsed = parseUrl(val);
    if (!parsed) return this._err(field, `${label} must be a valid http(s) link`), this;
    this.data[field] = parsed;
    return this;
  }
  /** valid date (ISO string / Date). Options: future, past, after (Date), before (Date), maxDaysAhead */
  date(field, o = {}) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    const d = parseDate(this.src[field]);
    if (!d) return this._err(field, `${label} must be a valid date`), this;
    const now = Date.now();
    if (o.future && d.getTime() < now - 60 * 1000) return this._err(field, `${label} must be in the future`), this;
    if (o.past && d.getTime() > now) return this._err(field, `${label} cannot be in the future`), this;
    if (o.after && d.getTime() <= o.after.getTime()) return this._err(field, `${label} must be after ${o.afterLabel || o.after.toISOString()}`), this;
    if (o.before && d.getTime() >= o.before.getTime()) return this._err(field, `${label} must be before ${o.beforeLabel || o.before.toISOString()}`), this;
    if (o.maxDaysAhead && d.getTime() > now + o.maxDaysAhead * 86400000) {
      return this._err(field, `${label} cannot be more than ${o.maxDaysAhead} days ahead`), this;
    }
    this.data[field] = d;
    return this;
  }
  objectId(field, o = {}) {
    const label = o.label || field;
    if (this._skip(field, o)) return this;
    const val = this.src[field];
    if (!isValidObjectId(val)) return this._err(field, `${label} is not a valid id`), this;
    this.data[field] = String(val);
    return this;
  }
  /** array of strings; each element checked with `item(value) -> errorMessage | null` and optionally transformed */
  stringArray(field, o = {}) {
    const label = o.label || field;
    if (this._skip(field, { ...o, allowEmpty: false })) {
      return this;
    }
    let val = this.src[field];
    if (isPlainString(val)) val = val.split(',');
    if (!Array.isArray(val)) return this._err(field, `${label} must be a list`), this;
    const out = [];
    for (const raw of val) {
      if (!isPlainString(raw)) return this._err(field, `${label} contains an invalid entry`), this;
      const s = raw.trim();
      if (!s) continue;
      if (o.itemMax && s.length > o.itemMax) return this._err(field, `Each entry in ${label} must be at most ${o.itemMax} characters`), this;
      if (o.allowed && !o.allowed.includes(s)) return this._err(field, `${label}: '${s}' is not allowed (use: ${o.allowed.join(', ')})`), this;
      if (o.itemUrl) {
        const u = parseUrl(s);
        if (!u) return this._err(field, `${label}: '${s}' is not a valid http(s) link`), this;
        out.push(u);
      } else out.push(s);
    }
    const uniq = [...new Set(out)];
    if (o.max !== undefined && uniq.length > o.max) return this._err(field, `${label} can have at most ${o.max} entries`), this;
    if (o.min !== undefined && uniq.length < o.min) return this._err(field, `${label} needs at least ${o.min} entry`), this;
    this.data[field] = uniq;
    return this;
  }
  /** escape hatch for cross-field rules: fn(data) returns an error message or null */
  check(field, fn) {
    const msg = fn(this.data);
    if (msg) this._err(field, msg);
    return this;
  }

  get ok() {
    return Object.keys(this.errors).length === 0;
  }
  /** Sends a 400 and returns true when validation failed. Use: `if (v.fail(res)) return;` */
  fail(res) {
    if (this.ok) return false;
    const first = Object.values(this.errors)[0];
    res.status(400).json({ success: false, message: first, errors: this.errors });
    return true;
  }
}

// ------------------------------- helpers -------------------------------
function parseUrl(val) {
  if (!isPlainString(val)) return null;
  const s = val.trim();
  if (!s || s.length > 2048 || /\s/.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
  return u.toString();
}

function parseDate(val) {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (!isPlainString(val) && typeof val !== 'number') return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) return null;
  return d;
}

function isValidObjectId(id) {
  return (typeof id === 'string' || (id && typeof id.toString === 'function' && typeof id !== 'object')) &&
    mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

/** Reject Mongo operator injection ({"$ne": ...}) anywhere in a request body/query. */
function hasUnsafeKeys(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return false;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('$') || k.includes('.')) return true;
    if (hasUnsafeKeys(obj[k], depth + 1)) return true;
  }
  return false;
}

// ------------------------- shared composite rules -------------------------

/** Eligibility criteria block — used by TPO drive create/update, company registration, approval overrides. */
function validateEligibility(raw, { partial = false } = {}) {
  const v = new Validator(raw, { partial });
  v.stringArray('branches', { label: 'Eligible branches', allowed: BRANCHES, max: BRANCHES.length });
  v.integer('batch', { label: 'Eligible batch', min: MIN_BATCH_YEAR, max: maxBatchYear() });
  v.number('minCgpa', { label: 'Minimum CGPA', min: 0, max: 10, decimals: 2 });
  v.integer('maxBacklogs', { label: 'Maximum backlogs', min: 0, max: 50 });
  v.number('min10th', { label: 'Minimum 10th %', min: 0, max: 100, decimals: 2 });
  v.number('min12th', { label: 'Minimum 12th %', min: 0, max: 100, decimals: 2 });
  return v;
}

/**
 * Rounds timetable. `allowSchedule=false` (company side) ignores any dates/venues:
 * interview dates are controlled by the T&P cell.
 */
function validateRounds(rawRounds, { allowSchedule, deadline } = {}) {
  const errors = [];
  const rounds = [];
  if (rawRounds === undefined || rawRounds === null) return { rounds, errors };
  if (!Array.isArray(rawRounds)) return { rounds, errors: [{ index: 0, message: 'Rounds must be a list' }] };
  if (rawRounds.length > 10) return { rounds, errors: [{ index: 0, message: 'A drive can have at most 10 rounds' }] };

  let prev = null;
  rawRounds.forEach((r, i) => {
    const n = i + 1;
    const rv = new Validator(r);
    rv.oneOf('name', ROUND_NAMES, { required: true, label: `Round ${n} name` });
    rv.string('venue', { label: `Round ${n} venue`, max: 120 });
    rv.string('description', { label: `Round ${n} description`, max: 500 });
    if (allowSchedule) {
      rv.date('date', { label: `Round ${n} date/time` });
      rv.date('endDate', { label: `Round ${n} end time` });
      if (rv.data.date && deadline && rv.data.date.getTime() < deadline.getTime()) {
        rv._err('date', `Round ${n} must be scheduled after the application deadline`);
      }
      if (rv.data.date && prev && rv.data.date.getTime() < prev.getTime()) {
        rv._err('date', `Round ${n} cannot be scheduled before Round ${n - 1}`);
      }
      if (rv.data.date && rv.data.endDate && rv.data.endDate.getTime() <= rv.data.date.getTime()) {
        rv._err('endDate', `Round ${n} end time must be after its start time`);
      }
      if (rv.data.endDate && !rv.data.date) rv._err('endDate', `Round ${n}: set a start time before the end time`);
      if (rv.data.date) prev = rv.data.endDate || rv.data.date;
    }
    if (!rv.ok) errors.push({ index: i, message: Object.values(rv.errors)[0] });
    else {
      const out = { name: rv.data.name, order: i + 1 };
      if (rv.data.description) out.description = rv.data.description;
      if (allowSchedule) {
        if (rv.data.date) out.date = rv.data.date;
        if (rv.data.endDate) out.endDate = rv.data.endDate;
        if (rv.data.venue) out.venue = rv.data.venue;
      }
      if (r && r._id && isValidObjectId(String(r._id))) out._id = String(r._id);
      rounds.push(out);
    }
  });
  return { rounds, errors };
}

module.exports = {
  Validator,
  passwordProblem,
  parseUrl,
  parseDate,
  isValidObjectId,
  hasUnsafeKeys,
  validateEligibility,
  validateRounds,
  BRANCHES,
  JOB_TYPES,
  ROUND_NAMES,
  DOCUMENT_TYPES,
  ROLES,
  MIN_BATCH_YEAR,
  maxBatchYear,
  MAX_DEADLINE_DAYS,
};
