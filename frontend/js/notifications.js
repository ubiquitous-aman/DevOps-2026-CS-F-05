/**
 * notifications.js — inbox for the T&P cell and companies (students have their own page, js/student/notifications.js).
 * Uses the shared /api/notifications endpoints.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const current = Auth.getUser();
  if (!current) { window.location.href = '/login.html'; return; }
  const user = Layout.render({ role: current.role, active: 'notifications', title: 'Notifications' });
  if (!user) return;
  document.getElementById('markAllBtn').addEventListener('click', markAll);
  await loadNotifications();
});

async function loadNotifications() {
  const list = document.getElementById('notifList');
  list.innerHTML = UI.spinner();
  try {
    const { notifications, unread } = await Api.get('/notifications');
    document.getElementById('markAllBtn').classList.toggle('d-none', !unread);
    if (notifications.length === 0) {
      list.innerHTML = UI.empty('No notifications yet.');
      return;
    }
    list.innerHTML = notifications.map((n) => `
      <div class="notif-item ${n.isRead ? '' : 'unread'} cursor-pointer" onclick="markRead('${n._id}', this)">
        <div class="d-flex justify-content-between">
          <div class="fw-semibold">${UI.escapeHtml(n.title)}</div>
          ${!n.isRead ? '<span class="badge bg-warning text-dark">New</span>' : ''}
        </div>
        <div class="small text-muted">${UI.escapeHtml(n.message)}</div>
        <div class="text-muted" style="font-size:0.72rem;">${UI.formatDateTime(n.createdAt)}</div>
      </div>`).join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function markRead(id, el) {
  if (!el.classList.contains('unread')) return;
  try {
    await Api.put(`/notifications/${id}/read`);
    el.classList.remove('unread');
    const badge = el.querySelector('.badge');
    if (badge) badge.remove();
    Layout.loadUnreadBadge();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function markAll() {
  try {
    await Api.put('/notifications/read-all');
    await loadNotifications();
    Layout.loadUnreadBadge();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
