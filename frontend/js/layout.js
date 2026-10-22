/**
 * layout.js — builds the navbar + sidebar shell for every dashboard page
 * via DOM manipulation, driven by a small per-role menu config.
 * This keeps every dashboard page's own HTML focused on its own content.
 */
const MENUS = {
  student: [
    { href: '/student/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard', key: 'dashboard' },
    { href: '/student/profile.html', icon: 'bi-person-circle', label: 'My Profile', key: 'profile' },
    { href: '/student/drives.html', icon: 'bi-briefcase', label: 'Placement Drives', key: 'drives' },
    { href: '/student/applications.html', icon: 'bi-list-check', label: 'My Applications', key: 'applications' },
    { href: '/student/results.html', icon: 'bi-trophy', label: 'Results', key: 'results' },
    { href: '/student/notifications.html', icon: 'bi-bell', label: 'Notifications', key: 'notifications' },
  ],
  tpo: [
    { href: '/tpo/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard', key: 'dashboard' },
    { href: '/tpo/companies.html', icon: 'bi-building', label: 'Companies', key: 'companies' },
    { href: '/tpo/drives.html', icon: 'bi-briefcase', label: 'Drives & Requirements', key: 'drives' },
    { href: '/tpo/applicants.html', icon: 'bi-people', label: 'Applicants & Rounds', key: 'applicants' },
    { href: '/tpo/students.html', icon: 'bi-mortarboard', label: 'Students', key: 'students' },
    { href: '/tpo/statistics.html', icon: 'bi-bar-chart', label: 'Statistics', key: 'statistics' },
    { href: '/tpo/notifications.html', icon: 'bi-bell', label: 'Notifications', key: 'notifications' },
  ],
  admin: [
    { href: '/admin/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard', key: 'dashboard' },
    { href: '/admin/users.html', icon: 'bi-people', label: 'Manage Users', key: 'users' },
    { href: '/admin/logs.html', icon: 'bi-clock-history', label: 'Activity Logs', key: 'logs' },
  ],
  company: [
    { href: '/company/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard', key: 'dashboard' },
    { href: '/company/profile.html', icon: 'bi-building', label: 'Company Profile', key: 'profile' },
    { href: '/company/requirement.html', icon: 'bi-file-earmark-plus', label: 'Submit Requirement', key: 'requirement' },
    { href: '/company/applicants.html', icon: 'bi-people', label: 'Applicants', key: 'applicants' },
    { href: '/company/feedback.html', icon: 'bi-chat-dots', label: 'Recruitment / Feedback', key: 'feedback' },
    { href: '/company/notifications.html', icon: 'bi-bell', label: 'Notifications', key: 'notifications' },
  ],
};

const Layout = {
  render({ role, active, title }) {
    const user = Auth.requireRole(role);
    if (!user) return null;

    document.getElementById('appNavbar').innerHTML = `
      <nav class="navbar navbar-expand navbar-portal navbar-dark px-3 shadow-sm">
        <div class="d-flex align-items-center">
          <a href="https://www.skit.ac.in" target="_blank" rel="noopener noreferrer" title="Visit official SKIT Jaipur website (www.skit.ac.in)" class="d-inline-flex me-2">
            <img src="/images/skit_logo.png" alt="SKIT" style="height:34px; background:#fff; border-radius:6px; padding:2px; box-shadow:0 2px 4px rgba(0,0,0,0.15);">
          </a>
          <a class="navbar-brand mb-0" href="${MENUS[role][0].href}">
            <span>SKIT Placement Portal</span>
          </a>
        </div>
        <div class="ms-auto d-flex align-items-center gap-3">
          <span class="text-white-50 small d-none d-sm-inline" id="navUserRole"></span>
          <div class="dropdown">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
              <i class="bi bi-person-circle me-1"></i><span id="navUserName"></span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#" id="changePwdBtn"><i class="bi bi-key me-2"></i>Change password</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
            </ul>
          </div>
        </div>
      </nav>`;

    const items = MENUS[role]
      .map(
        (item) => `
        <li class="nav-item">
          <a class="nav-link ${item.key === active ? 'active' : ''}" href="${item.href}" data-key="${item.key}">
            <i class="bi ${item.icon} me-2"></i>${item.label}
          </a>
        </li>`
      )
      .join('');

    document.getElementById('appSidebar').innerHTML = `<ul class="nav flex-column">${items}</ul>`;

    if (title) document.title = `${title} | Placement Portal`;
    const h = document.getElementById('pageTitle');
    if (h) h.textContent = title;

    initNavbar();
    Layout.initChangePassword();
    Layout.syncSession();
    Layout.loadUnreadBadge();
    return user;
  },

  /** Red unread counter next to "Notifications" in the sidebar (all roles). */
  async loadUnreadBadge() {
    try {
      const { unread } = await Api.get('/notifications');
      const link = document.querySelector('#appSidebar a[data-key="notifications"]');
      if (!link) return;
      const old = link.querySelector('.unread-badge');
      if (old) old.remove();
      if (unread > 0) link.insertAdjacentHTML('beforeend', `<span class="badge bg-danger rounded-pill ms-2 unread-badge">${unread > 99 ? '99+' : unread}</span>`);
    } catch (e) { /* not critical */ }
  },

  /** Keeps the cached user in sync with the server (e.g. an admin changed this user's role / name). */
  async syncSession() {
    try {
      const { user } = await Api.get('/auth/me');
      const cached = Auth.getUser() || {};
      if (user.role !== cached.role) {
        Auth.saveSession(Api.token(), { ...cached, ...user });
        window.location.href = Auth.dashboardFor(user.role) || '/login.html';
      } else if (user.name !== cached.name) {
        Auth.saveSession(Api.token(), { ...cached, name: user.name });
        const n = document.getElementById('navUserName');
        if (n) n.textContent = user.name;
      }
    } catch (e) { /* api.js already handles expired sessions */ }
  },

  /** "Change password" dialog — available to every role from the user menu. */
  initChangePassword() {
    if (!document.getElementById('changePwdModal')) {
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="changePwdModal" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h5 class="modal-title"><i class="bi bi-key me-2"></i>Change password</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div id="cpAlert"></div>
            <form id="cpForm" novalidate>
              <div class="mb-3"><label class="form-label" for="cpCurrent">Current password</label>
                <input type="password" class="form-control" id="cpCurrent" autocomplete="current-password"></div>
              <div class="mb-2"><label class="form-label" for="cpNew">New password</label>
                <input type="password" class="form-control" id="cpNew" autocomplete="new-password"></div>
              <div id="cpRules" class="mb-3"></div>
              <div class="mb-2"><label class="form-label" for="cpConfirm">Confirm new password</label>
                <input type="password" class="form-control" id="cpConfirm" autocomplete="new-password"></div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary-portal" id="cpSave">Update password</button>
          </div>
        </div></div>
      </div>`);
    }
    const schema = {
      cpCurrent: V.text({ label: 'Current password', required: true }),
      cpNew: (v) => (isBlank(v) ? 'New password is required' : Validate.passwordProblem(String(v)) ||
        (v === Validate.val('cpCurrent') ? 'New password must be different from the current one' : '')),
      cpConfirm: V.matches('cpNew'),
    };
    Validate.live(schema);
    Validate.passwordChecklist('cpNew', 'cpRules');
    // Accounts created with a temporary / default password are asked to choose their own on first sign-in
    const forced = !!(Auth.getUser() || {}).mustChangePassword;
    const modal = new bootstrap.Modal(document.getElementById('changePwdModal'), forced ? { backdrop: 'static', keyboard: false } : {});
    const openModal = () => {
      document.getElementById('cpForm').reset();
      Validate.clear(document.getElementById('cpForm'));
      UI.clearAlert('cpAlert');
      if (forced) UI.showAlert('cpAlert', 'You are using a temporary password. Please choose your own password now.', 'warning');
      modal.show();
    };
    document.getElementById('changePwdBtn').addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
    if (forced) openModal();
    document.getElementById('cpSave').addEventListener('click', async (e) => {
      UI.clearAlert('cpAlert');
      const { ok, values } = Validate.run(schema);
      if (!ok) return;
      await withButton(e.currentTarget, '<span class="spinner-border spinner-border-sm me-1"></span>Saving...', async () => {
        try {
          // the server returns a fresh token (older ones stop working after a password change)
          const res = await Api.post('/auth/change-password', {
            currentPassword: document.getElementById('cpCurrent').value,
            newPassword: values.cpNew,
            confirmPassword: document.getElementById('cpConfirm').value,
          });
          Auth.saveSession(res.token || Api.token(), { ...(Auth.getUser() || {}), mustChangePassword: false });
          modal.hide();
          const box = document.getElementById('alertBox');
          if (box) UI.showAlert('alertBox', 'Password changed successfully.', 'success');
        } catch (err) {
          if (!Validate.showServerErrors(err.errors, { currentPassword: 'cpCurrent', newPassword: 'cpNew', confirmPassword: 'cpConfirm' })) {
            UI.showAlert('cpAlert', err.message);
          }
        }
      });
    });
  },
};
