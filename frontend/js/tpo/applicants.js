let allDrives = [], currentApplicants = [], actionModal, pendingAction = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'applicants', title: 'Applicants & Rounds' });
  if (!user) return;

  actionModal = new bootstrap.Modal(document.getElementById('actionModal'));
  document.getElementById('confirmActionBtn').addEventListener('click', () => submitAction('Cleared'));
  document.getElementById('rejectActionBtn').addEventListener('click', () => submitAction('Rejected'));

  await loadDrives();

  document.getElementById('driveSelect').addEventListener('change', (e) => loadApplicants(e.target.value));
});

async function loadDrives() {
  try {
    const { drives } = await Api.get('/tpo/drives');
    allDrives = drives.filter((d) => d.status === 'published' || d.status === 'closed');
    const select = document.getElementById('driveSelect');
    select.innerHTML = allDrives
      .map((d) => `<option value="${d._id}">${UI.escapeHtml(d.jobTitle)} — ${UI.escapeHtml(d.company?.companyName || '')}</option>`)
      .join('');

    const params = new URLSearchParams(window.location.search);
    const preselect = params.get('driveId');
    if (preselect && allDrives.some((d) => d._id === preselect)) {
      select.value = preselect;
    }

    if (allDrives.length > 0) await loadApplicants(select.value);
    else document.getElementById('applicantsList').innerHTML = UI.empty('No published drives yet.');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function loadApplicants(driveId) {
  if (!driveId) return;
  const list = document.getElementById('applicantsList');
  list.innerHTML = UI.spinner();
  try {
    const [appsRes, eligRes] = await Promise.all([
      Api.get(`/tpo/drives/${driveId}/applicants`),
      Api.get(`/tpo/drives/${driveId}/eligible-students`),
    ]);
    currentApplicants = appsRes.applications;
    document.getElementById('eligibleCount').innerHTML =
      `<i class="bi bi-people-fill me-1"></i>${eligRes.count} student(s) eligible for this drive · ${currentApplicants.length} applied`;

    if (currentApplicants.length === 0) {
      list.innerHTML = UI.empty('No applicants yet for this drive.');
      return;
    }
    list.innerHTML = `
      <div class="card section-card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table align-middle">
              <thead><tr><th>Student</th><th>Branch</th><th>Stage</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>${currentApplicants.map(renderApplicantRow).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderApplicantRow(app) {
  const student = app.student;
  const currentRound = app.roundResults[app.currentRoundIndex];
  const allCleared = app.roundResults.every((r) => r.status === 'Cleared');
  let actionBtn = '';

  if (app.status === 'In Process' && allCleared && app.currentRoundIndex === app.roundResults.length - 1) {
    actionBtn = `<button class="btn btn-sm btn-primary-portal" onclick="openFinalDecision('${app._id}')"><i class="bi bi-flag"></i> Final Decision</button>`;
  } else if (['Applied', 'In Process'].includes(app.status) && currentRound) {
    actionBtn = `<button class="btn btn-sm btn-outline-primary" onclick="openRoundAction('${app._id}','${currentRound.roundName}')"><i class="bi bi-arrow-right-circle"></i> ${UI.escapeHtml(currentRound.roundName)}</button>`;
  } else {
    actionBtn = `<span class="text-muted small">No action</span>`;
  }

  return `
  <tr>
    <td>
      <div class="fw-semibold">${UI.escapeHtml(student.user.name)}</div>
      <div class="text-muted small">${UI.escapeHtml(student.rollNumber)} · ${UI.escapeHtml(student.user.email)}</div>
    </td>
    <td>${UI.escapeHtml(student.branch)}</td>
    <td class="small">${currentRound ? UI.escapeHtml(currentRound.roundName) : '—'}</td>
    <td><span class="${UI.badgeClass(app.status)}">${app.status}</span></td>
    <td>${actionBtn}</td>
  </tr>`;
}

function openRoundAction(appId, roundName) {
  pendingAction = { appId, type: 'round' };
  document.getElementById('actionModalTitle').textContent = `Update: ${roundName}`;
  document.getElementById('actionModalDesc').textContent = `Mark this candidate's "${roundName}" round as cleared or rejected.`;
  document.getElementById('actionFeedback').value = '';
  document.getElementById('packageFieldWrap').classList.add('d-none');
  document.getElementById('confirmActionBtn').textContent = 'Mark Cleared';
  UI.clearAlert('actionModalAlert');
  actionModal.show();
}

function openFinalDecision(appId) {
  pendingAction = { appId, type: 'final' };
  document.getElementById('actionModalTitle').textContent = 'Final Placement Decision';
  document.getElementById('actionModalDesc').textContent = 'All rounds cleared. Make the final Select / Reject decision for this candidate.';
  document.getElementById('actionFeedback').value = '';
  document.getElementById('packageFieldWrap').classList.remove('d-none');
  document.getElementById('confirmActionBtn').textContent = 'Select Candidate';
  UI.clearAlert('actionModalAlert');
  actionModal.show();
}

async function submitAction(kind) {
  UI.clearAlert('actionModalAlert');
  if (!pendingAction) return;
  const { appId, type } = pendingAction;
  const feedback = document.getElementById('actionFeedback').value;

  try {
    if (type === 'round') {
      await Api.put(`/tpo/applications/${appId}/round`, {
        status: kind === 'Cleared' ? 'Cleared' : 'Rejected',
        feedback,
      });
    } else {
      const decision = kind === 'Cleared' ? 'Selected' : 'Rejected';
      const packageLPA = Number(document.getElementById('packageField').value) || undefined;
      await Api.put(`/tpo/applications/${appId}/decision`, { decision, packageLPA });
    }
    actionModal.hide();
    UI.showAlert('alertBox', 'Candidate status updated.', 'success');
    await loadApplicants(document.getElementById('driveSelect').value);
  } catch (err) {
    UI.showAlert('actionModalAlert', err.message);
  }
}
