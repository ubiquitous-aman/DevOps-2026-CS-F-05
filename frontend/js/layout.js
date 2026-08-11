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
    { href: '/tpo/statistics.html', icon: 'bi-bar-chart', label: 'Statistics', key: 'statistics' },
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
              <li><a class="dropdown-item" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
            </ul>
          </div>
        </div>
      </nav>`;

    const items = MENUS[role]
      .map(
        (item) => `
        <li class="nav-item">
          <a class="nav-link ${item.key === active ? 'active' : ''}" href="${item.href}">
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
    return user;
  },
};
