/**
 * auth.js — session helpers shared by every page.
 */
const Auth = {
  saveSession(token, user) {
    localStorage.setItem('ppm_token', token);
    localStorage.setItem('ppm_user', JSON.stringify(user));
  },
  getUser() {
    const raw = localStorage.getItem('ppm_user');
    return raw ? JSON.parse(raw) : null;
  },
  clearSession() {
    localStorage.removeItem('ppm_token');
    localStorage.removeItem('ppm_user');
  },
  isLoggedIn() {
    return !!localStorage.getItem('ppm_token');
  },
  dashboardFor(role) {
    return {
      student: '/student/dashboard.html',
      tpo: '/tpo/dashboard.html',
      admin: '/admin/dashboard.html',
      company: '/company/dashboard.html',
    }[role];
  },
  /**
   * Guards a role-specific page: redirects to login if not authenticated,
   * or to the correct dashboard if the role doesn't match.
   */
  requireRole(expectedRole) {
    const user = this.getUser();
    if (!this.isLoggedIn() || !user) {
      window.location.href = '/login.html';
      return null;
    }
    if (user.role !== expectedRole) {
      window.location.href = this.dashboardFor(user.role) || '/index.html';
      return null;
    }
    return user;
  },
  async logout() {
    try {
      await Api.post('/auth/logout');
    } catch (e) {
      /* ignore network errors on logout */
    }
    this.clearSession();
    window.location.href = '/login.html';
  },
};
