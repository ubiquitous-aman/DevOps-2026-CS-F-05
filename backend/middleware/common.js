const { isValidObjectId, hasUnsafeKeys } = require('../utils/validators');

/** Wraps an async route handler so a thrown error becomes a JSON error response instead of a hung request / crash. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Wraps every exported function of a controller module with asyncHandler. */
const wrapController = (ctrl) => {
  const out = {};
  Object.keys(ctrl).forEach((k) => {
    out[k] = typeof ctrl[k] === 'function' ? asyncHandler(ctrl[k]) : ctrl[k];
  });
  return out;
};

/** router.param('id', validateIdParam) — rejects malformed ObjectIds with 400 before any DB access. */
const validateIdParam = (req, res, next, value, name) => {
  if (!isValidObjectId(value)) {
    return res.status(400).json({ success: false, message: `Invalid ${name || 'id'} in URL` });
  }
  next();
};

/** Blocks NoSQL operator injection (keys starting with `$` or containing `.`) in body and query. */
const rejectUnsafeInput = (req, res, next) => {
  if (hasUnsafeKeys(req.body) || hasUnsafeKeys(req.query)) {
    return res.status(400).json({ success: false, message: 'Request contains invalid characters in field names' });
  }
  next();
};

/** Tiny in-memory rate limiter (per key) — used for login / forgot-password. Disabled in tests. */
const rateLimit = ({ windowMs, max, keyFn, message }) => {
  const hits = new Map();
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    const rec = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (rec.length >= max) {
      const wait = Math.ceil((windowMs - (now - rec[0])) / 60000);
      return res.status(429).json({ success: false, message: message || `Too many attempts. Try again in ${wait} minute(s).` });
    }
    rec.push(now);
    hits.set(key, rec);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
};

/** Final error handler: turns Mongoose / Multer / body-parser errors into clean 4xx JSON. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Server Error';

  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for '${err.path}'`;
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    message = `That ${field} is already in use`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (maximum 5 MB)' : err.message;
  }

  if (status >= 500) console.error('[ERROR]', err.stack || err);
  res.status(status).json({ success: false, message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Server Error' : message });
};

module.exports = { asyncHandler, wrapController, validateIdParam, rejectUnsafeInput, rateLimit, errorHandler };
