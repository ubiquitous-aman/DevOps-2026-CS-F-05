/**
 * ui.js — small shared DOM-manipulation helpers used across every dashboard page.
 * Keeping these in one place is what lets each page's script stay focused on
 * its own event handling / data wiring (CO-2: DOM Manipulation).
 */
const UI = {
  showAlert(containerId, message, type = 'danger') {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>`;
  },
  clearAlert(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
  },
  badgeClass(status) {
    const key = (status || '').replace(/\s+/g, '-');
    return `badge badge-status badge-${key}`;
  },
  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },
  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
  initials(name) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  },
  spinner() {
    return `<div class="spinner-wrap"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
  },
  empty(message, icon = 'bi-inbox') {
    return `<div class="empty-state"><i class="bi ${icon}" style="font-size:2.5rem;"></i><p class="mt-2 mb-0">${message}</p></div>`;
  },
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

/** Renders the top navbar's user badge + logout handler — shared by all dashboards. */
function initNavbar() {
  const user = Auth.getUser();
  const nameEl = document.getElementById('navUserName');
  const roleEl = document.getElementById('navUserRole');
  if (nameEl && user) nameEl.textContent = user.name;
  if (roleEl && user) roleEl.textContent = user.role.toUpperCase();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }
}
