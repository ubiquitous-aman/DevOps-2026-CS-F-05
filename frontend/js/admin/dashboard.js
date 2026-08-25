document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'admin', active: 'dashboard', title: 'Admin Dashboard' });
  if (!user) return;

  try {
    const sysRes = await Api.get('/admin/system-info');
    const info = sysRes.systemInfo;

    const cards = [
      { label: 'Students', value: info.counts.studentCount, icon: 'bi-people', color: '#1e3a8a' },
      { label: 'Companies', value: info.counts.companyCount, icon: 'bi-building', color: '#0891b2' },
      { label: 'TPO / Admin Accounts', value: info.counts.tpoCount + info.counts.adminCount, icon: 'bi-person-badge', color: '#d97706' },
      { label: 'Active Users', value: info.activeUsers, icon: 'bi-person-check', color: '#16a34a' },
    ];
    document.getElementById('statCards').innerHTML = cards
      .map(
        (c) => `
      <div class="col-sm-6 col-xl-3">
        <div class="card stat-card">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="stat-icon" style="background:${c.color}"><i class="bi ${c.icon}"></i></div>
            <div><div class="stat-value">${c.value}</div><div class="text-muted small">${c.label}</div></div>
          </div>
        </div>
      </div>`
      )
      .join('');

    document.getElementById('sysInfoTable').innerHTML = `
      <tbody>
        <tr><td>Total Drives</td><td>${info.counts.driveCount}</td></tr>
        <tr><td>Total Applications</td><td>${info.counts.applicationCount}</td></tr>
        <tr><td>Active Users</td><td>${info.activeUsers}</td></tr>
        <tr><td>Inactive (Deactivated) Users</td><td>${info.inactiveUsers}</td></tr>
        <tr><td>Environment</td><td><span class="badge bg-secondary">${info.nodeEnv}</span></td></tr>
        <tr><td>Server Time</td><td>${UI.formatDateTime(info.serverTime)}</td></tr>
      </tbody>`;
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});

