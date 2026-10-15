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

  document.getElementById('driveSearch').addEventListener('input', renderDrives);
  document.getElementById('driveSort').addEventListener('change', renderDrives);
  document.getElementById('confirmApplyBtn').addEventListener('click', submitApplication);
  Validate.live(applySchema());
  // refresh the "time left" labels every minute
  setInterval(() => { if (allDrives.length) renderDrives(); }, 60000);

  await loadDrives();
});

/** "2d 4h left" style label; null once the time has passed */
function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const applySchema = () => ({
  documentLinks: V.urlList({ label: 'Document links', max: 5 }),
  coverNote: V.text({ label: 'Cover note', max: 500 }),
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

  const q = (document.getElementById('driveSearch').value || '').trim().toLowerCase();
  if (q) filtered = filtered.filter((d) => `${d.jobTitle} ${d.company?.companyName || ''} ${d.location || ''}`.toLowerCase().includes(q));
  const sort = document.getElementById('driveSort').value;
  filtered = [...filtered];
  if (sort === 'deadline') filtered.sort((a, b) => new Date(a.applicationDeadline) - new Date(b.applicationDeadline));
  else if (sort === 'package') filtered.sort((a, b) => (b.packageLPA || 0) - (a.packageLPA || 0));

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
              <li><i class="bi bi-calendar-event me-1"></i>Apply by ${UI.formatDateTime(d.applicationDeadline)}
                ${timeLeft(d.applicationDeadline) ? `<span class="badge ${new Date(d.applicationDeadline) - Date.now() < 86400000 ? 'bg-danger' : 'bg-light text-dark border'} ms-1">${timeLeft(d.applicationDeadline)}</span>` : ''}</li>
              ${d.openings ? `<li><i class="bi bi-people me-1"></i>${d.openings} opening(s)</li>` : ''}
              ${(d.requiredDocuments || []).length ? `<li><i class="bi bi-paperclip me-1"></i>Needs: ${UI.escapeHtml(d.requiredDocuments.join(', '))}</li>` : ''}
              ${(d.rounds || []).filter((r) => r.date).map((r) => `<li class="text-primary"><i class="bi bi-clock me-1"></i>${UI.escapeHtml(r.name)}: ${UI.formatDateTime(r.date)}${r.venue ? ' @ ' + UI.escapeHtml(r.venue) : ''}</li>`).join('')}
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
    <br>Once submitted, your application will move through the recruitment rounds scheduled by the T&P cell.`;
  const needsLinks = (drive.requiredDocuments || []).filter((x) => x !== 'Resume');
  document.getElementById('docLinksWrap').classList.remove('d-none');
  document.getElementById('docLinksReq').textContent = needsLinks.length ? `(required: ${needsLinks.join(', ')})` : '';
  document.getElementById('applyForm').reset();
  Validate.clear(document.getElementById('applyForm'));
  UI.clearAlert('applyModalAlert');
  applyModal.show();
}

async function submitApplication() {
  UI.clearAlert('applyModalAlert');
  const drive = allDrives.find((d) => d._id === pendingApplyDriveId);
  if (!drive) return;
  const schema = applySchema();
  const needsLinks = (drive.requiredDocuments || []).filter((x) => x !== 'Resume');
  if (needsLinks.length) {
    const base = schema.documentLinks;
    schema.documentLinks = (v) => (Validate.list(v).length === 0 ? `Add a link for: ${needsLinks.join(', ')}` : base(v));
  }
  const { ok } = Validate.run(schema);
  if (!ok) return;
  if (new Date() > new Date(drive.applicationDeadline)) {
    UI.showAlert('applyModalAlert', 'The application deadline has just passed.');
    return;
  }
  const btn = document.getElementById('confirmApplyBtn');
  await withButton(btn, '<span class="spinner-border spinner-border-sm me-1"></span>Applying...', async () => {
    try {
      await Api.post(`/student/drives/${pendingApplyDriveId}/apply`, {
        documentLinks: Validate.list(Validate.val('documentLinks')),
        coverNote: Validate.val('coverNote').trim(),
      });
      applyModal.hide();
      UI.showAlert('alertBox', 'Application submitted successfully!', 'success');
      await loadDrives();
    } catch (err) {
      if (!Validate.showServerErrors(err.errors)) UI.showAlert('applyModalAlert', err.message);
      else UI.showAlert('applyModalAlert', err.message);
      if (/already applied/i.test(err.message)) { applyModal.hide(); await loadDrives(); }
    }
  });
}
