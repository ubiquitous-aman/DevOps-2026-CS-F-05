require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');
const { rejectUnsafeInput, errorHandler } = require('./middleware/common');

const app = express();

const { metricsMiddleware, metricsHandler } = require('./utils/metrics');
app.use(metricsMiddleware);


// ---------- Middleware ----------
app.disable('x-powered-by');
// CORS: the portal serves its own frontend, so same-origin needs no CORS at all.
// Set CORS_ORIGIN="https://a.example,https://b.example" to allow specific other origins; leave empty to allow any (dev).
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
// Basic hardening headers (a full CSP is not set because the pages load Bootstrap from a CDN)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', rejectUnsafeInput); // blocks NoSQL operator injection ({"$ne": ...}) in body/query
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// NOTE: uploaded resumes are NOT served statically any more — they are private and
// downloaded through the authenticated route GET /api/files/resume/:studentId

// Serve the frontend (static HTML/CSS/JS/Bootstrap site) so the whole
// project can be run from a single Node process.
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ---------- Routes ----------
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/tpo', require('./routes/tpoRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/company', require('./routes/companyRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes')); // inbox for every role (T&P / company included)
app.use('/api/files', require('./routes/fileRoutes'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Placement Portal API is running', time: new Date() });
});

// Fallback to index.html for the frontend root
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------- 404 + Error handling ----------
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use(errorHandler);

// ---------- Start ----------
const PORT = process.env.PORT || 5000;

app.get('/metrics', metricsHandler);

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
    // Remaining-time reminders (deadline / interview approaching) — sweep every 10 minutes
    const { runReminderSweep } = require('./utils/reminders');
    const sweep = () => runReminderSweep({ force: true }).catch((e) => console.error('[Reminders]', e.message));
    setTimeout(sweep, 5000);
    setInterval(sweep, 10 * 60 * 1000).unref();
  });
}

module.exports = app; // exported for test.js (supertest)
