document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'statistics', title: 'Placement Statistics' });
  if (!user) return;

  await loadStats();

  document.getElementById('notifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('notifyTitle').value.trim();
    const message = document.getElementById('notifyMessage').value.trim();
    try {
      const { students } = await Api.get('/tpo/students');
      const studentIds = students.map((s) => s._id);
      const res = await Api.post('/tpo/notify', { studentIds, title, message });
      UI.showAlert('alertBox', `Notified ${res.notified} student(s).`, 'success');
      e.target.reset();
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  });
});

async function loadStats() {
  try {
    const { stats } = await Api.get('/tpo/statistics');

    const cards = [
      { label: 'Total Students', value: stats.totalStudents, icon: 'bi-people', color: '#1e3a8a' },
      { label: 'Placed', value: stats.placedStudents, icon: 'bi-trophy', color: '#16a34a' },
      { label: 'Placement %', value: `${stats.placementPercentage}%`, icon: 'bi-graph-up-arrow', color: '#0891b2' },
      { label: 'Total Applications', value: stats.totalApplications, icon: 'bi-send', color: '#d97706' },
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

    document.getElementById('branchTable').innerHTML = stats.branchWise.length
      ? `<table class="table table-sm"><thead><tr><th>Branch</th><th>Total</th><th>Placed</th><th>%</th></tr></thead><tbody>${stats.branchWise
          .map((b) => `<tr><td>${UI.escapeHtml(b._id)}</td><td>${b.total}</td><td>${b.placed}</td><td>${b.total ? Math.round((b.placed / b.total) * 100) : 0}%</td></tr>`)
          .join('')}</tbody></table>`
      : UI.empty('No student data yet.');

    const total = stats.selected + stats.rejected + stats.inProcess || 1;
    const outcomes = [
      { label: 'Selected', value: stats.selected, color: '#16a34a' },
      { label: 'Rejected', value: stats.rejected, color: '#dc2626' },
      { label: 'In Process', value: stats.inProcess, color: '#0891b2' },
    ];
    document.getElementById('outcomeChart').innerHTML = outcomes
      .map((o) => {
        const pct = Math.round((o.value / total) * 100);
        return `
        <div class="mb-2">
          <div class="d-flex justify-content-between small"><span>${o.label}</span><span>${o.value} (${pct}%)</span></div>
          <div class="progress" style="height:10px;"><div class="progress-bar" style="width:${pct}%;background:${o.color}"></div></div>
        </div>`;
      })
      .join('');

    document.getElementById('avgPkg').textContent = `₹${stats.avgPackage} LPA`;
    document.getElementById('highPkg').textContent = `₹${stats.highestPackage} LPA`;
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
