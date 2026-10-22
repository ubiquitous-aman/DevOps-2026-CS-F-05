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

    const toolbar = toolbarHtml(driveId);
    if (currentApplicants.length === 0) {
      list.innerHTML = toolbar + UI.empty('No applicants yet for this drive.');
      return;
    }
    list.innerHTML = toolbar + `
      <div class="card section-card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table align-middle">
              <thead><tr><th style="width:34px;"><input type="checkbox" class="form-check-input" id="selectAll" title="Select all who can be moved to the next step" onchange="toggleAll(this.checked)"></th><th>Student</th><th>Branch</th><th>Stage</th><th>Status</th><th>Action</th></tr></thead>
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

  const actionable = ['Applied', 'In Process'].includes(app.status) && currentRound && currentRound.status === 'Pending';
  const resumeLink = student.resume && student.resume.filePath
    ? ` · <a href="#" onclick="openResumeFor('${student._id}'); return false;"><i class="bi bi-file-earmark-person"></i> Resume</a>` : '';
  return `
  <tr>
    <td>${actionable ? `<input type="checkbox" class="form-check-input row-check" value="${app._id}" onchange="updateBulkBar()">` : ''}</td>
    <td>
      <div class="fw-semibold"><a href="#" onclick="viewStudent('${student._id}'); return false;">${UI.escapeHtml(student.user.name)}</a></div>
      <div class="text-muted small">${UI.escapeHtml(student.rollNumber)} · ${UI.escapeHtml(student.user.email)}${resumeLink}</div>
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
  document.getElementById('joiningWrap').classList.add('d-none');
  Validate.clear(document.getElementById('actionModal'));
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
  document.getElementById('joiningWrap').classList.remove('d-none');
  document.getElementById('packageField').value = '';
  document.getElementById('joiningField').value = '';
  Validate.clear(document.getElementById('actionModal'));
  document.getElementById('confirmActionBtn').textContent = 'Select Candidate';
  UI.clearAlert('actionModalAlert');
  actionModal.show();
}

async function submitAction(kind) {
  UI.clearAlert('actionModalAlert');
  if (!pendingAction) return;
  const { appId, type } = pendingAction;
  const schema = { actionFeedback: V.text({ label: 'Feedback', max: 1000 }) };
  if (type === 'final' && kind === 'Cleared') {
    schema.packageField = V.number({ label: 'Package', exclusiveMin: 0, max: 500, decimals: 2 });
    schema.joiningField = V.date({ label: 'Joining date', future: true, maxDaysAhead: 1095 });
  }
  const { ok, values } = Validate.run(schema);
  if (!ok) return;

  const btn = document.getElementById(kind === 'Cleared' ? 'confirmActionBtn' : 'rejectActionBtn');
  await withButton(btn, '<span class="spinner-border spinner-border-sm"></span>', async () => {
    try {
      if (type === 'round') {
        await Api.put(`/tpo/applications/${appId}/round`, { status: kind === 'Cleared' ? 'Cleared' : 'Rejected', feedback: values.actionFeedback });
      } else {
        const payload = { decision: kind === 'Cleared' ? 'Selected' : 'Rejected' };
        if (values.packageField) payload.packageLPA = Number(values.packageField);
        if (values.joiningField) payload.joiningDate = Validate.toISO(values.joiningField);
        await Api.put(`/tpo/applications/${appId}/decision`, payload);
      }
      actionModal.hide();
      UI.showAlert('alertBox', 'Candidate status updated.', 'success');
      await loadApplicants(document.getElementById('driveSelect').value);
    } catch (err) {
      UI.showAlert('actionModalAlert', err.message);
    }
  });
}

/** Full student view (shared with the admin screen) */
async function viewStudent(studentId) {
  await StudentView.open(`/tpo/students/${studentId}`);
}

/* ---------- export + bulk actions ---------- */
function toolbarHtml(driveId) {
  return `
  <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
    <div class="btn-group btn-group-sm">
      <button class="btn btn-outline-success dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-file-earmark-excel me-1"></i>Export CSV</button>
      <ul class="dropdown-menu">
        <li><a class="dropdown-item" href="#" onclick="downloadFile('/tpo/drives/${driveId}/export', 'applicants.csv'); return false;">All applicants</a></li>
        <li><a class="dropdown-item" href="#" onclick="downloadFile('/tpo/drives/${driveId}/export?selected=1', 'selected-candidates.csv'); return false;">Selected candidates only</a></li>
        <li><a class="dropdown-item" href="#" onclick="downloadFile('/tpo/drives/${driveId}/export-eligible', 'eligible-students.csv'); return false;">Eligible students</a></li>
      </ul>
    </div>
    <div id="bulkBar" class="d-none d-flex flex-wrap gap-2 align-items-center">
      <span class="small fw-semibold" id="bulkCount"></span>
      <button class="btn btn-sm btn-success" onclick="bulkRound('Cleared')"><i class="bi bi-check2-circle me-1"></i>Clear round</button>
      <button class="btn btn-sm btn-outline-danger" onclick="bulkRound('Rejected')"><i class="bi bi-x-circle me-1"></i>Reject</button>
    </div>
  </div>`;
}

function checkedIds() {
  return [...document.querySelectorAll('.row-check:checked')].map((c) => c.value);
}
function toggleAll(on) {
  document.querySelectorAll('.row-check').forEach((c) => { c.checked = on; });
  updateBulkBar();
}
function updateBulkBar() {
  const n = checkedIds().length;
  const bar = document.getElementById('bulkBar');
  if (!bar) return;
  bar.classList.toggle('d-none', n === 0);
  bar.classList.toggle('d-flex', n > 0);
  document.getElementById('bulkCount').textContent = `${n} selected`;
}

async function bulkRound(status) {
  const ids = checkedIds();
  if (!ids.length) return;
  const feedback = prompt(`${status === 'Cleared' ? 'Clear' : 'Reject'} the current round for ${ids.length} candidate(s).\n\nFeedback for all of them (optional):`, '');
  if (feedback === null) return;
  try {
    const res = await Api.put('/tpo/applications/bulk-round', { ids, status, feedback: feedback.trim() });
    const failed = res.results.filter((r) => !r.ok);
    UI.showAlert('alertBox', `${res.updated} candidate(s) updated${failed.length ? `, ${failed.length} skipped: ${UI.escapeHtml(failed[0].message)}` : ''}.`, failed.length ? 'warning' : 'success');
    await loadApplicants(document.getElementById('driveSelect').value);
  } catch (err) {
    UI.showAlert('alertBox', err.errors ? Object.values(err.errors)[0] : err.message);
  }
}
