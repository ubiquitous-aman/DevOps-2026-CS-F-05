document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'dashboard', title: 'Company Dashboard' });
  if (!user) return;

  try {
    const [reqRes, approvedRes] = await Promise.all([
      Api.get('/company/requirements'),
      Api.get('/company/drives/approved'),
    ]);
    const requirements = reqRes.drives;
    const approved = approvedRes.drives;

    const pending = requirements.filter((r) => r.requirementStatus === 'pending').length;
    const published = requirements.filter((r) => r.status === 'published').length;

    const cards = [
      { label: 'Requirements Submitted', value: requirements.length, icon: 'bi-file-earmark-text', color: '#1e3a8a' },
      { label: 'Pending Review', value: pending, icon: 'bi-hourglass-split', color: '#d97706' },
      { label: 'Published Drives', value: published, icon: 'bi-megaphone', color: '#16a34a' },
      { label: 'Approved (Active)', value: approved.length, icon: 'bi-briefcase', color: '#0891b2' },
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

    document.getElementById('requirementsList').innerHTML = requirements.length
      ? requirements
          .slice(0, 6)
          .map(
            (r) => `
        <div class="d-flex justify-content-between align-items-center border-bottom py-2">
          <div>
            <div class="fw-semibold small">${UI.escapeHtml(r.jobTitle)}</div>
            <div class="text-muted small">₹${r.packageLPA} LPA</div>
          </div>
          <span class="${UI.badgeClass(r.requirementStatus)}">${r.requirementStatus}</span>
        </div>`
          )
          .join('')
      : UI.empty('No requirements submitted yet.');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }

  document.getElementById('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('msgSubject').value.trim();
    const message = document.getElementById('msgBody').value.trim();
    try {
      await Api.post('/company/message-tpo', { subject, message });
      UI.showAlert('alertBox', 'Message sent to TPO Cell.', 'success');
      e.target.reset();
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  });
});
