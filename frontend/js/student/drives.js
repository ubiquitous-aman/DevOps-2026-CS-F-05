let allDrives = [];
let currentFilter = 'all';
let pendingApplyDriveId = null;
let applyModal;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'drives', title: 'Placement Drives' });
  if (!user) return;

  applyModal = new bootstrap.Modal(document.getElementById('applyModal'));

  document.querySelectorAll('#filterGroup button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filterGroup button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderDrives();
    });
  });

  document.getElementById('confirmApplyBtn').addEventListener('click', submitApplication);

  await loadDrives();
});

async function loadDrives() {
  const list = document.getElementById('drivesList');
  list.innerHTML = UI.spinner();
  try {
    const { drives } = await Api.get('/student/drives');
    allDrives = drives;
    renderDrives();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderDrives() {
  const list = document.getElementById('drivesList');
  let filtered = allDrives;
  if (currentFilter === 'eligible') filtered = allDrives.filter((d) => d.eligible && !d.applicationStatus);
  if (currentFilter === 'applied') filtered = allDrives.filter((d) => d.applicationStatus);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="col-12">${UI.empty('No drives found for this filter.')}</div>`;
    return;
  }

  list.innerHTML = filtered
    .map((d) => {
      const deadlinePassed = new Date() > new Date(d.applicationDeadline);
      let actionHtml;
      if (d.applicationStatus) {
        actionHtml = `<span class="${UI.badgeClass(d.applicationStatus)}">${d.applicationStatus}</span>`;
      } else if (!d.eligible) {
        actionHtml = `<button class="btn btn-sm btn-outline-secondary" disabled title="${UI.escapeHtml((d.reasons || []).join('; '))}">Not Eligible</button>`;
      } else if (deadlinePassed) {
        actionHtml = `<span class="badge badge-status badge-closed">Deadline Passed</span>`;
      } else {
        actionHtml = `<button class="btn btn-sm btn-primary-portal" onclick="openApplyModal('${d._id}')"><i class="bi bi-send me-1"></i>Apply</button>`;
      }

      return `
      <div class="col-md-6 col-xl-4">
        <div class="card drive-card h-100 ${d.eligible ? '' : 'not-eligible'}">
          <div class="card-body d-flex flex-column">
            <div class="d-flex align-items-start gap-2 mb-2">
              <div class="company-avatar">${UI.initials(d.company.companyName)}</div>
              <div>
                <h6 class="mb-0 fw-bold">${UI.escapeHtml(d.jobTitle)}</h6>
                <div class="text-muted small">${UI.escapeHtml(d.company.companyName)}</div>
              </div>
            </div>
            <p class="small text-muted mb-2">${UI.escapeHtml(d.jobDescription || 'No description provided.').slice(0, 100)}</p>
            <ul class="list-unstyled small mb-3">
              <li><i class="bi bi-cash-coin me-1"></i>₹${d.packageLPA} LPA</li>
              <li><i class="bi bi-geo-alt me-1"></i>${UI.escapeHtml(d.location || 'Not specified')}</li>
              <li><i class="bi bi-calendar-event me-1"></i>Apply by ${UI.formatDate(d.applicationDeadline)}</li>
              ${d.collegeRequirements ? `<li class="mt-1 text-primary"><i class="bi bi-mortarboard me-1"></i><strong>College Req:</strong> ${UI.escapeHtml(d.collegeRequirements)}</li>` : ''}
            </ul>
            ${!d.eligible ? `<div class="alert alert-warning py-1 px-2 small mb-2">${UI.escapeHtml((d.reasons || [])[0] || 'Not eligible')}</div>` : ''}
            <div class="mt-auto">${actionHtml}</div>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

function openApplyModal(driveId) {
  const drive = allDrives.find((d) => d._id === driveId);
  pendingApplyDriveId = driveId;
  document.getElementById('applyModalBody').innerHTML = `
    You are about to apply for <strong>${UI.escapeHtml(drive.jobTitle)}</strong> at
    <strong>${UI.escapeHtml(drive.company.companyName)}</strong> (₹${drive.packageLPA} LPA).
    ${drive.collegeRequirements ? `<div class="alert alert-info py-2 px-3 small my-2"><i class="bi bi-mortarboard me-1"></i><strong>Institutional Requirement:</strong> ${UI.escapeHtml(drive.collegeRequirements)}</div>` : ''}
    <br>Once submitted, your application will move through the recruitment rounds defined by the company.`;
  applyModal.show();
}

async function submitApplication() {
  const btn = document.getElementById('confirmApplyBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Applying...';
  try {
    await Api.post(`/student/drives/${pendingApplyDriveId}/apply`);
    applyModal.hide();
    UI.showAlert('alertBox', 'Application submitted successfully!', 'success');
    await loadDrives();
  } catch (err) {
    applyModal.hide();
    UI.showAlert('alertBox', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Apply Now';
  }
}
