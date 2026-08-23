document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'notifications', title: 'Notifications' });
  if (!user) return;
  await loadNotifications();
});

async function loadNotifications() {
  const list = document.getElementById('notifList');
  list.innerHTML = UI.spinner();
  try {
    const { notifications } = await Api.get('/student/notifications');
    if (notifications.length === 0) {
      list.innerHTML = UI.empty('No notifications yet.');
      return;
    }
    list.innerHTML = notifications
      .map(
        (n) => `
      <div class="notif-item ${n.isRead ? '' : 'unread'} cursor-pointer" onclick="markRead('${n._id}', this)">
        <div class="d-flex justify-content-between">
          <div class="fw-semibold">${UI.escapeHtml(n.title)}</div>
          ${!n.isRead ? '<span class="badge bg-warning text-dark">New</span>' : ''}
        </div>
        <div class="small text-muted">${UI.escapeHtml(n.message)}</div>
        <div class="text-muted" style="font-size:0.72rem;">${UI.formatDateTime(n.createdAt)}</div>
      </div>`
      )
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function markRead(id, el) {
  try {
    await Api.put(`/student/notifications/${id}/read`);
    el.classList.remove('unread');
    const badge = el.querySelector('.badge');
    if (badge) badge.remove();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
