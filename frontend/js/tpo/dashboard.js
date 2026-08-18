document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'dashboard', title: 'TPO Dashboard' });
  if (!user) return;

  try {
    const [statsRes, drivesRes] = await Promise.all([Api.get('/tpo/statistics'), Api.get('/tpo/drives')]);
    const stats = statsRes.stats;
    const drives = drivesRes.drives;

    const cards = [
      { label: 'Total Students', value: stats.totalStudents, icon: 'bi-people', color: '#1e3a8a' },
      { label: 'Placed Students', value: `${stats.placedStudents} (${stats.placementPercentage}%)`, icon: 'bi-trophy', color: '#16a34a' },
      { label: 'Published Drives', value: `${stats.publishedDrives}/${stats.totalDrives}`, icon: 'bi-briefcase', color: '#0891b2' },
      { label: 'Applications In Process', value: stats.inProcess, icon: 'bi-hourglass-split', color: '#d97706' },
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

    const pending = drives.filter((d) => d.requirementStatus === 'pending' || d.status === 'draft');
    const pendingEl = document.getElementById('pendingRequirements');
    pendingEl.innerHTML = pending.length
      ? pending
          .slice(0, 6)
          .map(
            (d) => `
        <div class="d-flex justify-content-between align-items-center border-bottom py-2">
          <div>
            <div class="fw-semibold small">${UI.escapeHtml(d.jobTitle)}</div>
            <div class="text-muted small">${UI.escapeHtml(d.company?.companyName || '')}</div>
          </div>
          <a href="drives.html" class="btn btn-sm btn-outline-primary">Review</a>
        </div>`
          )
          .join('')
      : UI.empty('No pending requirements — all caught up!');

    const branchEl = document.getElementById('branchStats');
    branchEl.innerHTML = stats.branchWise.length
      ? stats.branchWise
          .map((b) => {
            const pct = b.total ? Math.round((b.placed / b.total) * 100) : 0;
            return `
        <div class="mb-2">
          <div class="d-flex justify-content-between small"><span>${UI.escapeHtml(b._id)}</span><span>${b.placed}/${b.total} (${pct}%)</span></div>
          <div class="progress" style="height:8px;"><div class="progress-bar bg-success" style="width:${pct}%"></div></div>
        </div>`;
          })
          .join('')
      : UI.empty('No student data yet.');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});
