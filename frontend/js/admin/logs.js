document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'admin', active: 'logs', title: 'Activity Logs' });
  if (!user) return;

  const tbody = document.getElementById('logsTbody');
  tbody.innerHTML = `<tr><td colspan="5">${UI.spinner()}</td></tr>`;
  try {
    const { logs } = await Api.get('/admin/activity-logs');
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">${UI.empty('No activity recorded yet.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = logs
      .map(
        (l) => `
      <tr>
        <td class="small text-muted" style="white-space:nowrap;">${UI.formatDateTime(l.createdAt)}</td>
        <td class="small">${UI.escapeHtml(l.actor?.name || 'System')}</td>
        <td><span class="badge bg-secondary text-uppercase">${l.actorRole}</span></td>
        <td class="small fw-semibold">${UI.escapeHtml(l.action)}</td>
        <td class="small text-muted">${UI.escapeHtml(l.details || '')}</td>
      </tr>`
      )
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});
