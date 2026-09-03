/**
 * validate.js — client-side form validation (instant feedback).
 *
 * IMPORTANT: this only improves the user experience. The server (backend/utils/validators.js) re-validates every
 * request with the same rules and is the real gatekeeper — never rely on this file for security.
 *
 * Usage:
 *   const schema = {
 *     email:    V.email({ required: true }),
 *     password: V.password(),
 *     cgpa:     V.number({ label: 'CGPA', min: 0, max: 10 }),
 *   };
 *   const { ok, values } = Validate.run(schema);      // marks bad fields red + shows messages
 *   Validate.live(schema);                            // validate while typing / on blur
 *   Validate.showServerErrors(err.errors);            // map {field: message} from a 400 response onto the inputs
 */
const BRANCHES = ['CSE', 'CSE(AI)', 'CSE(DS)', 'CSE(IoT)', 'IT', 'ECE', 'EEE', 'ME', 'CE'];
const ROUND_NAMES = ['Aptitude', 'Technical Interview', 'HR Interview', 'Other'];
const DOC_TYPES = ['Resume', 'Marksheets', 'ID Proof', 'Cover Letter', 'Portfolio'];

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{3,19}$/;
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

const V = {
  text({ label = 'This field', required = false, min, max, pattern, patternMsg } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      const s = String(v).trim();
      if (min && s.length < min) return `${label} must be at least ${min} characters`;
      if (max && s.length > max) return `${label} must be at most ${max} characters`;
      if (pattern && !pattern.test(s)) return patternMsg || `${label} has an invalid format`;
      return '';
    };
  },
  name({ label = 'Name', required = true } = {}) {
    return V.text({ label, required, min: 2, max: 60, pattern: NAME_RE, patternMsg: `${label} may contain only letters, spaces and . ' -` });
  },
  email({ label = 'Email', required = true } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      const s = String(v).trim();
      return s.length > 254 || !EMAIL_RE.test(s) ? `Please enter a valid ${label.toLowerCase()} address` : '';
    };
  },
  phone({ label = 'Phone number', required = false } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      const d = String(v).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
      return PHONE_RE.test(d) ? '' : `${label} must be a valid 10-digit mobile number`;
    };
  },
  rollNumber() {
    return V.text({ label: 'Roll number', required: true, pattern: ROLL_RE, patternMsg: 'Roll number must be 4-20 letters/digits (/ and - allowed)' });
  },
  password({ label = 'Password', required = true } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      return Validate.passwordProblem(String(v));
    };
  },
  /** same value as another field */
  matches(otherId, message = 'Passwords do not match') {
    return (v) => (v !== Validate.val(otherId) ? message : '');
  },
  number({ label = 'Value', required = false, min, max, int = false, decimals, exclusiveMin } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      const n = Number(v);
      if (!Number.isFinite(n)) return `${label} must be a valid number`;
      if (int && !Number.isInteger(n)) return `${label} must be a whole number`;
      if (min !== undefined && n < min) return `${label} must be at least ${min}`;
      if (max !== undefined && n > max) return `${label} must be at most ${max}`;
      if (exclusiveMin !== undefined && n <= exclusiveMin) return `${label} must be greater than ${exclusiveMin}`;
      if (decimals !== undefined && Math.round(n * 10 ** decimals) / 10 ** decimals !== n) return `${label} may have at most ${decimals} decimal places`;
      return '';
    };
  },
  int(opts = {}) {
    return V.number({ ...opts, int: true });
  },
  url({ label = 'Link', required = false } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      return Validate.isUrl(String(v).trim()) ? '' : `${label} must be a valid http(s) link`;
    };
  },
  /** comma/line separated list of urls */
  urlList({ label = 'Links', max = 5 } = {}) {
    return (v) => {
      const items = Validate.list(v);
      if (items.length > max) return `${label}: at most ${max} links`;
      const bad = items.find((u) => !Validate.isUrl(u));
      return bad ? `${label}: "${bad}" is not a valid http(s) link` : '';
    };
  },
  select({ label = 'This field', required = true, allowed } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `Please choose ${label.toLowerCase()}` : '';
      return allowed && !allowed.includes(v) ? `${label} is not valid` : '';
    };
  },
  /** <input type="datetime-local"> / date value */
  date({ label = 'Date', required = false, future = false, after, afterLabel, maxDaysAhead } = {}) {
    return (v) => {
      if (isBlank(v)) return required ? `${label} is required` : '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return `${label} must be a valid date`;
      if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return `${label} is out of range`;
      if (future && d.getTime() < Date.now() - 60000) return `${label} must be in the future`;
      const other = typeof after === 'function' ? after() : after;
      if (other && !Number.isNaN(new Date(other).getTime()) && d.getTime() <= new Date(other).getTime()) return `${label} must be after ${afterLabel || 'the previous date'}`;
      if (maxDaysAhead && d.getTime() > Date.now() + maxDaysAhead * 86400000) return `${label} cannot be more than ${maxDaysAhead} days ahead`;
      return '';
    };
  },
  file({ allowed = ['.pdf', '.doc', '.docx'], maxMB = 5, required = true } = {}) {
    return (_v, el) => {
      const f = el && el.files && el.files[0];
      if (!f) return required ? 'Please choose a file' : '';
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext)) return `Only ${allowed.join(', ')} files are allowed`;
      if (f.size === 0) return 'The selected file is empty';
      if (f.size > maxMB * 1024 * 1024) return `File is too large (maximum ${maxMB} MB)`;
      return '';
    };
  },
};

const Validate = {
  V,
  val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  },
  list(v) {
    return String(v || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  },
  isUrl(s) {
    if (!s || s.length > 2048 || /\s/.test(s)) return false;
    try {
      const u = new URL(s);
      return ['http:', 'https:'].includes(u.protocol) && (u.hostname.includes('.') || u.hostname === 'localhost');
    } catch {
      return false;
    }
  },
  passwordProblem(p) {
    if (p.length < 8) return 'Password must be at least 8 characters long';
    if (p.length > 72) return 'Password must be at most 72 characters long';
    if (!/[A-Z]/.test(p)) return 'Password must contain an uppercase letter (A-Z)';
    if (!/[a-z]/.test(p)) return 'Password must contain a lowercase letter (a-z)';
    if (!/[0-9]/.test(p)) return 'Password must contain a number (0-9)';
    if (!SPECIAL_RE.test(p)) return 'Password must contain a special character (!@#$%^&* etc.)';
    if (/\s/.test(p)) return 'Password must not contain spaces';
    return '';
  },

  /** Convert a <input type="datetime-local"> / date value to an ISO string (so the server gets an unambiguous instant). */
  toISO(v) {
    if (isBlank(v)) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  },
  /** ISO string from the server -> value for <input type="datetime-local"> in the user's local time */
  toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  /** min value for datetime-local "now" */
  nowLocal() {
    return Validate.toLocalInput(new Date().toISOString());
  },

  // ---------- DOM feedback ----------
  setError(el, message) {
    if (!el) return;
    el.classList.toggle('is-invalid', !!message);
    el.classList.toggle('is-valid', !message && !isBlank(el.value));
    const host = (el.closest('.input-group') || el).parentElement;
    let fb = host && host.querySelector(`.invalid-feedback[data-for="${el.id}"]`);
    if (!fb && message) {
      fb = document.createElement('div');
      fb.className = 'invalid-feedback';
      fb.dataset.for = el.id;
      // keep input-groups tidy: put feedback after the group
      const anchor = el.closest('.input-group') || el;
      anchor.insertAdjacentElement('afterend', fb);
    }
    if (fb) {
      fb.textContent = message || '';
      fb.style.display = message ? 'block' : 'none';
    }
  },
  clear(root = document) {
    root.querySelectorAll('.is-invalid, .is-valid').forEach((e) => e.classList.remove('is-invalid', 'is-valid'));
    root.querySelectorAll('.invalid-feedback[data-for]').forEach((e) => { e.style.display = 'none'; });
  },
  /** Validate every field of `schema` ({ elementId: ruleFn }). Returns { ok, values, firstError } */
  run(schema, { focus = true } = {}) {
    let ok = true;
    let first = null;
    const values = {};
    Object.entries(schema).forEach(([id, rule]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const raw = el.type === 'checkbox' ? el.checked : el.value;
      const msg = rule(raw, el) || '';
      values[id] = typeof raw === 'string' ? raw.trim() : raw;
      Validate.setError(el, msg);
      if (msg) {
        ok = false;
        if (!first) first = el;
      }
    });
    if (!ok && focus && first) first.focus();
    return { ok, values, firstError: first };
  },
  /** validate individual fields when the user leaves them / types in an already-invalid one */
  live(schema) {
    Object.entries(schema).forEach(([id, rule]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const check = () => Validate.setError(el, rule(el.value, el) || '');
      el.addEventListener('blur', check);
      el.addEventListener('change', check);
      // while typing, only clear an existing error once the value becomes valid (never show new errors mid-typing)
      el.addEventListener('input', () => { if (el.classList.contains('is-invalid') && !rule(el.value, el)) check(); });
    });
  },
  /** Map {fieldName: message} returned by the API onto inputs. `map` can rename: { 'academics.cgpa': 'cgpa' } */
  showServerErrors(errors, map = {}) {
    if (!errors) return false;
    let shown = false;
    Object.entries(errors).forEach(([field, msg]) => {
      const id = map[field] || field.split('.').pop();
      const el = document.getElementById(id);
      if (el) {
        Validate.setError(el, msg);
        shown = true;
      }
    });
    return shown;
  },

  // ---------- password helpers ----------
  /** Live checklist for a password input. `listId` is a container whose children get filled in. */
  passwordChecklist(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    const rules = [
      ['8+ characters', (p) => p.length >= 8],
      ['Uppercase (A-Z)', (p) => /[A-Z]/.test(p)],
      ['Lowercase (a-z)', (p) => /[a-z]/.test(p)],
      ['Number (0-9)', (p) => /[0-9]/.test(p)],
      ['Special (!@#$%^&*)', (p) => SPECIAL_RE.test(p)],
    ];
    const draw = () => {
      const p = input.value;
      list.innerHTML = rules
        .map(([t, f]) => `<span class="me-3 small ${f(p) ? 'text-success' : 'text-muted'}"><i class="bi ${f(p) ? 'bi-check-circle-fill' : 'bi-circle'} me-1"></i>${t}</span>`)
        .join('');
    };
    input.addEventListener('input', draw);
    draw();
  },
  /** adds an eye button toggle to a password input (wraps nothing, appends a sibling button) */
  eyeToggle(inputId) {
    const el = document.getElementById(inputId);
    if (!el || el.dataset.eye) return;
    el.dataset.eye = '1';
    const wrap = document.createElement('div');
    wrap.className = 'input-group';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary';
    btn.tabIndex = -1;
    btn.innerHTML = '<i class="bi bi-eye"></i>';
    btn.addEventListener('click', () => {
      const show = el.type === 'password';
      el.type = show ? 'text' : 'password';
      btn.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    });
    wrap.appendChild(btn);
  },
};

/** Prevent double submits: disables the button while `fn` runs. */
async function withButton(btn, busyHtml, fn) {
  if (!btn || btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  const original = btn.innerHTML;
  btn.disabled = true;
  if (busyHtml) btn.innerHTML = busyHtml;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.dataset.busy = '0';
    btn.innerHTML = original;
  }
}
