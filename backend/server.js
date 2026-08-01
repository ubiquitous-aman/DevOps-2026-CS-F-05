require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Serve uploaded resumes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server Error' });
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
  });
}

module.exports = app; // exported for test.js (supertest)
