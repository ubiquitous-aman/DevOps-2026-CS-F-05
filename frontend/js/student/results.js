document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'results', title: 'Results' });
  if (!user) return;

  try {
    const data = await Api.get('/student/results');

    const banner = document.getElementById('placementBanner');
    if (data.isPlaced) {
      banner.innerHTML = `
        <div class="alert alert-success d-flex align-items-center gap-3">
          <i class="bi bi-trophy-fill" style="font-size:1.8rem;"></i>
          <div>
            <div class="fw-bold">Congratulations! You are Placed 🎉</div>
            <div class="small">${UI.escapeHtml(data.placedCompany)} · ₹${data.placedPackage} LPA</div>
          </div>
        </div>`;
    } else {
      banner.innerHTML = `<div class="alert alert-secondary"><i class="bi bi-hourglass-split me-2"></i>You are not placed yet. Keep applying to eligible drives!</div>`;
    }

    const list = document.getElementById('resultsList');
    if (data.results.length === 0) {
      list.innerHTML = UI.empty('No final results yet — results appear here once a drive reaches a decision.');
      return;
    }

    list.innerHTML = data.results
      .map(
        (r) => `
      <div class="card section-card mb-3">
        <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h6 class="mb-0">${UI.escapeHtml(r.drive.jobTitle)}</h6>
            <div class="text-muted small">${UI.escapeHtml(r.drive.company.companyName)} · ₹${r.drive.packageLPA} LPA</div>
          </div>
          <span class="${UI.badgeClass(r.status)}" style="font-size:0.9rem;">${r.status}</span>
        </div>
      </div>`
      )
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});
