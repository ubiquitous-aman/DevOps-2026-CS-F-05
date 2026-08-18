let driveModal, allCompanies = [], allDrives = [], roundCounter = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'drives', title: 'Drives & Requirements' });
  if (!user) return;

  driveModal = new bootstrap.Modal(document.getElementById('driveModal'));
  await Promise.all([loadCompanies(), loadDrives()]);
});

async function loadCompanies() {
  try {
    const { companies } = await Api.get('/tpo/companies');
    allCompanies = companies;
    const select = document.getElementById('company');
    select.innerHTML = companies
      .map((c) => `<option value="${c._id}">${UI.escapeHtml(c.companyName)}</option>`)
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function loadDrives() {
  const list = document.getElementById('drivesList');
  list.innerHTML = UI.spinner();
  try {
    const { drives } = await Api.get('/tpo/drives');
    allDrives = drives;
    if (drives.length === 0) {
      list.innerHTML = `<div class="col-12">${UI.empty('No drives yet. Click "New Drive" to create one.')}</div>`;
      return;
    }
    list.innerHTML = drives.map(renderDriveCard).join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderDriveCard(d) {
  return `
  <div class="col-md-6 col-xl-4">
    <div class="card drive-card h-100">
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h6 class="mb-0 fw-bold">${UI.escapeHtml(d.jobTitle)}</h6>
            <div class="text-muted small">${UI.escapeHtml(d.company?.companyName || '')}</div>
          </div>
          <span class="${UI.badgeClass(d.status)}">${d.status}</span>
        </div>
        <ul class="list-unstyled small mb-3">
          <li><i class="bi bi-cash-coin me-1"></i>₹${d.packageLPA} LPA</li>
          <li><i class="bi bi-calendar-event me-1"></i>Apply by ${UI.formatDate(d.applicationDeadline)}</li>
          <li><i class="bi bi-list-ol me-1"></i>${(d.rounds || []).length} round(s)</li>
        </ul>
        <div class="mt-auto d-flex flex-wrap gap-1">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${d._id}')"><i class="bi bi-pencil"></i> Edit</button>
          ${d.status === 'draft' ? `<button class="btn btn-sm btn-success" onclick="publishDrive('${d._id}')"><i class="bi bi-megaphone"></i> Publish</button>` : ''}
          <a href="applicants.html?driveId=${d._id}" class="btn btn-sm btn-outline-secondary"><i class="bi bi-people"></i> Applicants</a>
        </div>
      </div>
    </div>
  </div>`;
}

function openCreateModal() {
  document.getElementById('driveModalTitle').textContent = 'New Drive';
  document.getElementById('driveForm').reset();
  document.getElementById('driveId').value = '';
  document.getElementById('roundsContainer').innerHTML = '';
  roundCounter = 0;
  addRoundRow('Aptitude');
  addRoundRow('Technical Interview');
  addRoundRow('HR Interview');
  UI.clearAlert('modalAlert');
}

function openEditModal(id) {
  const d = allDrives.find((x) => x._id === id);
  if (!d) return;
  document.getElementById('driveModalTitle').textContent = 'Edit Drive';
  document.getElementById('driveId').value = d._id;
  document.getElementById('company').value = d.company?._id || d.company;
  document.getElementById('jobTitle').value = d.jobTitle;
  document.getElementById('jobDescription').value = d.jobDescription || '';
  document.getElementById('jobType').value = d.jobType || 'Full-Time';
  document.getElementById('packageLPA').value = d.packageLPA;
  document.getElementById('location').value = d.location || '';
  document.getElementById('applicationDeadline').value = d.applicationDeadline ? d.applicationDeadline.substring(0, 10) : '';

  const e = d.eligibility || {};
  document.getElementById('eligBranches').value = (e.branches || []).join(', ');
  document.getElementById('eligBatch').value = e.batch || '';
  document.getElementById('eligCgpa').value = e.minCgpa || 0;
  document.getElementById('eligBacklogs').value = e.maxBacklogs ?? 0;
  document.getElementById('eligTenth').value = e.min10th || 0;
  document.getElementById('eligTwelfth').value = e.min12th || 0;

  document.getElementById('roundsContainer').innerHTML = '';
  roundCounter = 0;
  (d.rounds || []).forEach((r) => addRoundRow(r.name, r.date ? r.date.substring(0, 10) : '', r.venue || ''));

  UI.clearAlert('modalAlert');
  driveModal.show();
}

function addRoundRow(name = 'Aptitude', date = '', venue = '') {
  roundCounter++;
  const rowId = `round-${roundCounter}`;
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 round-row';
  div.id = rowId;
  div.innerHTML = `
    <div class="col-md-4">
      <select class="form-select form-select-sm round-name">
        <option ${name === 'Aptitude' ? 'selected' : ''}>Aptitude</option>
        <option ${name === 'Technical Interview' ? 'selected' : ''}>Technical Interview</option>
        <option ${name === 'HR Interview' ? 'selected' : ''}>HR Interview</option>
        <option ${name === 'Other' ? 'selected' : ''}>Other</option>
      </select>
    </div>
    <div class="col-md-4">
      <input type="date" class="form-control form-control-sm round-date" value="${date}">
    </div>
    <div class="col-md-3">
      <input type="text" class="form-control form-control-sm round-venue" placeholder="Venue" value="${UI.escapeHtml(venue)}">
    </div>
    <div class="col-md-1">
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('${rowId}').remove()"><i class="bi bi-trash"></i></button>
    </div>`;
  document.getElementById('roundsContainer').appendChild(div);
}

async function saveDrive() {
  UI.clearAlert('modalAlert');
  const id = document.getElementById('driveId').value;
  const rounds = Array.from(document.querySelectorAll('.round-row')).map((row, idx) => ({
    name: row.querySelector('.round-name').value,
    order: idx + 1,
    date: row.querySelector('.round-date').value || undefined,
    venue: row.querySelector('.round-venue').value,
  }));

  const branches = document.getElementById('eligBranches').value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    company: document.getElementById('company').value,
    jobTitle: document.getElementById('jobTitle').value.trim(),
    jobDescription: document.getElementById('jobDescription').value.trim(),
    jobType: document.getElementById('jobType').value,
    packageLPA: Number(document.getElementById('packageLPA').value),
    location: document.getElementById('location').value.trim(),
    applicationDeadline: document.getElementById('applicationDeadline').value,
    eligibility: {
      branches,
      batch: Number(document.getElementById('eligBatch').value) || undefined,
      minCgpa: Number(document.getElementById('eligCgpa').value) || 0,
      maxBacklogs: Number(document.getElementById('eligBacklogs').value) || 0,
      min10th: Number(document.getElementById('eligTenth').value) || 0,
      min12th: Number(document.getElementById('eligTwelfth').value) || 0,
    },
    rounds,
  };

  if (!payload.company || !payload.jobTitle || !payload.packageLPA || !payload.applicationDeadline) {
    UI.showAlert('modalAlert', 'Please fill all required fields.');
    return;
  }

  const btn = document.getElementById('saveDriveBtn');
  btn.disabled = true;
  try {
    if (id) {
      await Api.put(`/tpo/drives/${id}`, payload);
    } else {
      await Api.post('/tpo/drives', payload);
    }
    driveModal.hide();
    UI.showAlert('alertBox', 'Drive saved successfully.', 'success');
    await loadDrives();
  } catch (err) {
    UI.showAlert('modalAlert', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function publishDrive(id) {
  if (!confirm('Publish this drive? Eligible students will be notified immediately.')) return;
  try {
    const res = await Api.put(`/tpo/drives/${id}/publish`);
    UI.showAlert('alertBox', `Drive published. ${res.eligibleStudentsNotified} eligible student(s) notified.`, 'success');
    await loadDrives();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
