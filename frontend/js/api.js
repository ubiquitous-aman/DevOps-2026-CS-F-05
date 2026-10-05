/**
 * api.js — central AJAX/fetch wrapper for the whole frontend.
 * Every network call in this project goes through here, so auth headers,
 * error handling, and JSON parsing are handled consistently (CO-2: AJAX / Asynchronous Data Handling).
 */
const API_BASE = '/api';

const Api = {
  token() {
    return localStorage.getItem('ppm_token');
  },

  /**
   * Core request helper. Returns parsed JSON body.
   * Throws an Error with .message and .status on failure so callers
   * can show inline error alerts instead of alert() popups.
   */
  async request(method, path, body = null, isFormData = false) {
    const headers = {};
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    let res, data;
    try {
      res = await fetch(`${API_BASE}${path}`, options);
      data = await res.json();
    } catch (networkErr) {
      const err = new Error('Network error — is the server running?');
      err.status = 0;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data.message || 'Something went wrong');
      err.status = res.status;
      err.reasons = data.reasons;
      err.errors = data.errors; // { field: message } from server-side validation
      // Session expired / account removed -> back to login (but not for a failed login attempt itself)
      if (res.status === 401 && token && !path.startsWith('/auth/login')) {
        Auth.clearSession();
        window.location.href = '/login.html';
      }
      throw err;
    }
    return data;
  },

  /**
   * Authenticated binary download (CSV / ICS / resume). Plain <a href> links cannot send the
   * Authorization header, so files are fetched here and turned into a Blob.
   */
  async blob(path) {
    const token = this.token();
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch (e) {
      const err = new Error('Network error — is the server running?');
      err.status = 0;
      throw err;
    }
    if (!res.ok) {
      let msg = 'Download failed';
      try { msg = (await res.json()).message || msg; } catch (e) { /* not JSON */ }
      const err = new Error(msg);
      err.status = res.status;
      if (res.status === 401 && token) { Auth.clearSession(); window.location.href = '/login.html'; }
      throw err;
    }
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename="?([^";]+)"?/i.exec(cd);
    return { blob: await res.blob(), filename: m ? m[1] : null };
  },

  /** Saves a server-generated file (e.g. CSV) to the user's computer. */
  async download(path, fallbackName) {
    const { blob, filename } = await this.blob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || fallbackName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  /** Opens a student's resume in a new tab (PDF renders in the browser, DOC/DOCX downloads). */
  async openResume(studentId) {
    const win = window.open('', '_blank'); // opened first so popup blockers allow it
    try {
      const { blob } = await this.blob(`/files/resume/${studentId}`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (win) win.close();
      throw e;
    }
  },

  get(path) {
    return this.request('GET', path);
  },
  post(path, body, isFormData = false) {
    return this.request('POST', path, body, isFormData);
  },
  put(path, body) {
    return this.request('PUT', path, body);
  },
  delete(path) {
    return this.request('DELETE', path);
  },
};


/** Shared helpers used by inline onclick handlers on several pages */
async function openResumeFor(studentId) {
  try { await Api.openResume(studentId); } catch (err) { UI.showAlert('alertBox', err.message); }
}
async function downloadFile(path, fallbackName) {
  try { await Api.download(path, fallbackName); } catch (err) { UI.showAlert('alertBox', err.message); }
}
