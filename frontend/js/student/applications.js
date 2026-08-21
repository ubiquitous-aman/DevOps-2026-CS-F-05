document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'applications', title: 'My Applications' });
  if (!user) return;
  await loadApplications();
});

async function loadApplications() {
  const container = document.getElementById('applicationsList');
  container.innerHTML = UI.spinner();
  try {
    const { applications } = await Api.get('/student/applications');
    if (applications.length === 0) {
      container.innerHTML = UI.empty('You have not applied to any drives yet.', 'bi-send');
      return;
    }
    container.innerHTML = applications.map(renderApplicationCard).join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderApplicationCard(app) {
  const drive = app.drive;
  const stageHtml = app.roundResults
    .map((r, idx) => {
      let cls = '';
      if (r.status === 'Cleared') cls = 'cleared';
      else if (r.status === 'Rejected') cls = 'rejected';
      else if (idx === app.currentRoundIndex && app.status !== 'Rejected') cls = 'current';
      return `<div class="stage-step ${cls}"><i class="bi bi-check-circle-fill me-1" style="${r.status === 'Cleared' ? '' : 'display:none'}"></i>${r.roundName}<div class="small fw-normal">${r.status}</div></div>`;
    })
    .join('<div class="px-1"><i class="bi bi-chevron-right text-muted"></i></div>');

  const canWithdraw = ['Applied', 'In Process'].includes(app.status);

  return `
  <div class="card section-card mb-3">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <h5 class="mb-0">${UI.escapeHtml(drive.jobTitle)}</h5>
          <div class="text-muted small">${UI.escapeHtml(drive.company.companyName)} · ₹${drive.packageLPA} LPA · Applied ${UI.formatDate(app.appliedAt)}</div>
        </div>
        <span class="${UI.badgeClass(app.status)}">${app.status}</span>
      </div>
      <div class="stage-timeline my-3">${stageHtml}</div>
      ${app.roundResults[app.currentRoundIndex]?.feedback ? `<div class="alert alert-info small py-2 mb-2"><i class="bi bi-chat-left-quote me-1"></i>${UI.escapeHtml(app.roundResults[app.currentRoundIndex].feedback)}</div>` : ''}
      ${canWithdraw ? `<button class="btn btn-sm btn-outline-danger" onclick="withdraw('${app._id}')"><i class="bi bi-x-circle me-1"></i>Withdraw Application</button>` : ''}
    </div>
  </div>`;
}

async function withdraw(id) {
  if (!confirm('Are you sure you want to withdraw this application?')) return;
  try {
    await Api.put(`/student/applications/${id}/withdraw`);
    UI.showAlert('alertBox', 'Application withdrawn.', 'success');
    await loadApplications();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
