let logPage = 1;
let logPages = 1;
let actionsLoaded = false;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'admin', active: 'logs', title: 'Activity Logs' });
  if (!user) return;
  document.getElementById('logApply').addEventListener('click', () => loadLogs(1));
  document.getElementById('logSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLogs(1); });
  document.getElementById('logAction').addEventListener('change', () => loadLogs(1));
  document.getElementById('logReset').addEventListener('click', () => {
    document.getElementById('logAction').value = '';
    document.getElementById('logSearch').value = '';
    loadLogs(1);
  });
  document.getElementById('logPrev').addEventListener('click', () => { if (logPage > 1) loadLogs(logPage - 1); });
  document.getElementById('logNext').addEventListener('click', () => { if (logPage < logPages) loadLogs(logPage + 1); });
  await loadLogs(1);
});

async function loadLogs(page) {
  const tbody = document.getElementById('logsTbody');
  tbody.innerHTML = `<tr><td colspan="5">${UI.spinner()}</td></tr>`;
  const params = new URLSearchParams({ page, limit: 50 });
  const action = document.getElementById('logAction').value;
  const q = document.getElementById('logSearch').value.trim();
  if (action) params.set('action', action);
  if (q) params.set('q', q);
  try {
    const res = await Api.get(`/admin/activity-logs?${params}`);
    logPage = res.page;
    logPages = res.pages;
    if (!actionsLoaded) {
      document.getElementById('logAction').innerHTML += res.actions.map((a) => `<option value="${UI.escapeHtml(a)}">${UI.escapeHtml(a)}</option>`).join('');
      actionsLoaded = true;
    }
    document.getElementById('logInfo').textContent = `Page ${res.page} of ${res.pages} · ${res.total} record(s)`;
    document.getElementById('logPrev').disabled = res.page <= 1;
    document.getElementById('logNext').disabled = res.page >= res.pages;
    if (res.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">${UI.empty('No activity found.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = res.logs
      .map(
        (l) => `
      <tr>
        <td class="small text-muted" style="white-space:nowrap;">${UI.formatDateTime(l.createdAt)}</td>
        <td class="small">${UI.escapeHtml(l.actor?.name || 'System')}</td>
        <td><span class="badge bg-secondary text-uppercase">${UI.escapeHtml(l.actorRole || '')}</span></td>
        <td class="small fw-semibold">${UI.escapeHtml(l.action)}</td>
        <td class="small text-muted">${UI.escapeHtml(l.details || '')}</td>
      </tr>`
      )
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
