let approvedDrives = [], currentView = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'applicants', title: 'Applicants' });
  if (!user) return;

  document.querySelectorAll('#viewTabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#viewTabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      loadApplicants(document.getElementById('driveSelect').value);
    });
  });

  await loadDrives();
  document.getElementById('driveSelect').addEventListener('change', (e) => loadApplicants(e.target.value));
});

async function loadDrives() {
  try {
    const { drives } = await Api.get('/company/drives/approved');
    approvedDrives = drives;
    const select = document.getElementById('driveSelect');
    if (drives.length === 0) {
      select.innerHTML = '<option>No approved drives yet</option>';
      document.getElementById('applicantsList').innerHTML = UI.empty('You have no approved/published drives yet.');
      return;
    }
    select.innerHTML = drives.map((d) => `<option value="${d._id}">${UI.escapeHtml(d.jobTitle)}</option>`).join('');
    await loadApplicants(select.value);
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function loadApplicants(driveId) {
  if (!driveId) return;
  const list = document.getElementById('applicantsList');
  list.innerHTML = UI.spinner();
  try {
    if (currentView === 'all') {
      const { applications } = await Api.get(`/company/drives/${driveId}/applicants`);
      renderTable(applications, list, false);
    } else {
      const { selected } = await Api.get(`/company/drives/${driveId}/selected`);
      renderTable(selected, list, true);
    }
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderTable(applications, list, selectedOnly) {
  if (applications.length === 0) {
    list.innerHTML = UI.empty(selectedOnly ? 'No candidates finally selected yet.' : 'No applicants yet.');
    return;
  }
  list.innerHTML = `
    <div class="card section-card">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table align-middle">
            <thead><tr><th>Student</th><th>Branch</th><th>Current Stage</th><th>Status</th>${!selectedOnly ? '<th>Action</th>' : ''}</tr></thead>
            <tbody>
              ${applications
                .map((app) => {
                  const student = app.student;
                  const currentRound = app.roundResults[app.currentRoundIndex];
                  return `
                <tr>
                  <td>
                    <div class="fw-semibold">${UI.escapeHtml(student.user.name)}</div>
                    <div class="text-muted small">${UI.escapeHtml(student.rollNumber)}</div>
                  </td>
                  <td>${UI.escapeHtml(student.branch)}</td>
                  <td class="small">${currentRound ? UI.escapeHtml(currentRound.roundName) : '—'}</td>
                  <td><span class="${UI.badgeClass(app.status)}">${app.status}</span></td>
                  ${!selectedOnly ? `<td><a href="feedback.html?appId=${app._id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-chat-dots"></i> Feedback</a></td>` : ''}
                </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}
