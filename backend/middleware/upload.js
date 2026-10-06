const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    const err = new Error('Only PDF, DOC or DOCX files are allowed for resumes');
    err.status = 400;
    cb(err);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/** Checks the real file content (magic bytes), not just the extension. Returns an error message or null. */
const resumeProblem = (filePath, originalName) => {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return 'The uploaded file is empty';
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    const ext = path.extname(originalName).toLowerCase();
    const isPdf = buf.slice(0, 5).toString() === '%PDF-';
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // .docx
    const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0; // .doc
    if (ext === '.pdf' && !isPdf) return 'This file is not a valid PDF';
    if (ext === '.docx' && !isZip) return 'This file is not a valid DOCX document';
    if (ext === '.doc' && !isOle && !isZip) return 'This file is not a valid DOC document';
    return null;
  } catch (e) {
    return 'Could not read the uploaded file';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

module.exports = upload;
module.exports.resumeProblem = resumeProblem;
