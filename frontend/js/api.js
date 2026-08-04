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
      throw err;
    }
    return data;
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

