let driveModal, scheduleModal, reasonModal, allCompanies = [], allDrives = [], roundCounter = 0;
let editingDrive = null, scheduleDriveId = null, reasonAction = null;

const driveSchema = () => ({
  company: V.select({ label: 'a company' }),
  jobTitle: V.text({ label: 'Job title', required: true, min: 3, max: 100 }),
  jobDescription: V.text({ label: 'Job description', max: 2000 }),
  jobType: V.select({ label: 'a job type', allowed: ['Full-Time', 'Internship', 'Internship + PPO'] }),
  packageLPA: V.number({ label: 'Package / CTC', required: true, exclusiveMin: 0, max: 500, decimals: 2 }),
  openings: V.int({ label: 'Openings', min: 1, max: 10000 }),
  location: V.text({ label: 'Location', max: 100 }),
  applicationDeadline: V.date({ label: 'Application deadline', required: true, future: !editingDrive || changedDeadline(), maxDaysAhead: 365 }),
  driveDate: V.date({ label: 'Drive date', future: true, after: () => Validate.val('applicationDeadline'), afterLabel: 'the application deadline' }),
  collegeRequirements: V.text({ label: 'College requirements', max: 1000 }),
  eligBranches: (v) => {
    const bad = Validate.list(v).find((b) => !BRANCHES.includes(b));
    return bad ? `'${bad}' is not a valid branch (use: ${BRANCHES.join(', ')})` : '';
  },
  eligBatch: V.int({ label: 'Eligible batch', min: 2000, max: new Date().getFullYear() + 6 }),
  eligCgpa: V.number({ label: 'Minimum CGPA', min: 0, max: 10, decimals: 2 }),
  eligBacklogs: V.int({ label: 'Maximum backlogs', min: 0, max: 50 }),
  eligTenth: V.number({ label: 'Minimum 10th %', min: 0, max: 100, decimals: 2 }),
  eligTwelfth: V.number({ label: 'Minimum 12th %', min: 0, max: 100, decimals: 2 }),
});

function changedDeadline() {
  if (!editingDrive) return true;
  return Validate.val('applicationDeadline') !== Validate.toLocalInput(editingDrive.applicationDeadline);
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'drives', title: 'Drives & Requirements' });
  if (!user) return;

  driveModal = new bootstrap.Modal(document.getElementById('driveModal'));
  scheduleModal = new bootstrap.Modal(document.getElementById('scheduleModal'));
  reasonModal = new bootstrap.Modal(document.getElementById('reasonModal'));
  document.getElementById('docChecks').innerHTML = DOC_TYPES.map((d, i) => `
    <div class="form-check"><input class="form-check-input doc-check" type="checkbox" value="${d}" id="doc${i}">
    <label class="form-check-label" for="doc${i}">${d}</label></div>`).join('');
  document.getElementById('reasonConfirmBtn').addEventListener('click', submitReason);
  await Promise.all([loadCompanies(), loadDrives()]);
});

async function loadCompanies() {
  try {
    const { companies } = await Api.get('/tpo/companies');
    allCompanies = companies.filter((c) => c.approvalStatus !== 'rejected');
    document.getElementById('company').innerHTML =
      '<option value="">Choose...</option>' + allCompanies.map((c) => `<option value="${c._id}">${UI.escapeHtml(c.companyName)}</option>`).join('');
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
  const pending = d.requirementStatus === 'pending';
  const live = ['draft', 'published'].includes(d.status);
  const btns = [];
  if (pending) btns.push(`<button class="btn btn-sm btn-warning" onclick="openDecision('${d._id}')"><i class="bi bi-shield-check"></i> Review</button>`);
  if (live) btns.push(`<button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${d._id}')"><i class="bi bi-pencil"></i> Edit</button>`);
  if (d.status === 'draft' && d.requirementStatus === 'approved') btns.push(`<button class="btn btn-sm btn-success" onclick="publishDrive('${d._id}')"><i class="bi bi-megaphone"></i> Publish</button>`);
  if (live && !pending) btns.push(`<button class="btn btn-sm btn-outline-info" onclick="openSchedule('${d._id}')"><i class="bi bi-calendar-event"></i> Schedule</button>`);
  if (d.status === 'published') btns.push(`<button class="btn btn-sm btn-outline-secondary" onclick="openStatus('${d._id}','closed')"><i class="bi bi-lock"></i> Close</button>`);
  if (live) btns.push(`<button class="btn btn-sm btn-outline-danger" onclick="openStatus('${d._id}','cancelled')"><i class="bi bi-x-circle"></i> Cancel</button>`);
  btns.push(`<a href="applicants.html?driveId=${d._id}" class="btn btn-sm btn-outline-secondary"><i class="bi bi-people"></i> Applicants (${d.applicationCount || 0})</a>`);

  return `
  <div class="col-md-6 col-xl-4">
    <div class="card drive-card h-100">
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h6 class="mb-0 fw-bold">${UI.escapeHtml(d.jobTitle)}</h6>
            <div class="text-muted small">${UI.escapeHtml(d.company?.companyName || '')}</div>
          </div>
          <div class="text-end"><span class="${UI.badgeClass(d.status)}">${d.status}</span>
            ${pending ? `<br><span class="${UI.badgeClass('pending')} mt-1 d-inline-block">awaiting review</span>` : ''}</div>
        </div>
        <ul class="list-unstyled small mb-3">
          <li><i class="bi bi-cash-coin me-1"></i>₹${d.packageLPA} LPA${d.openings ? ` · ${d.openings} opening(s)` : ''}</li>
          <li><i class="bi bi-calendar-event me-1"></i>Apply by ${UI.formatDateTime(d.applicationDeadline)}</li>
          ${d.driveDate ? `<li><i class="bi bi-building me-1"></i>Drive: ${UI.formatDateTime(d.driveDate)}</li>` : ''}
          <li><i class="bi bi-list-ol me-1"></i>${(d.rounds || []).length} round(s)${(d.rounds || []).some((r) => !r.date) && (d.rounds || []).length ? ' <span class="badge bg-warning text-dark">dates not set</span>' : ''}</li>
          ${(d.requiredDocuments || []).length ? `<li><i class="bi bi-paperclip me-1"></i>${UI.escapeHtml(d.requiredDocuments.join(', '))}</li>` : ''}
          ${d.decisionReason ? `<li class="text-danger"><i class="bi bi-info-circle me-1"></i>${UI.escapeHtml(d.decisionReason)}</li>` : ''}
        </ul>
        <div class="mt-auto d-flex flex-wrap gap-1">${btns.join('')}</div>
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ create / edit
function openCreateModal() {
  editingDrive = null;
  document.getElementById('driveModalTitle').textContent = 'New Drive';
  document.getElementById('driveForm').reset();
  Validate.clear(document.getElementById('driveForm'));
  document.getElementById('driveId').value = '';
  document.getElementById('company').disabled = false;
  document.querySelectorAll('.doc-check').forEach((c) => { c.checked = c.value === 'Resume'; });
  document.getElementById('applicationDeadline').min = Validate.nowLocal();
  setRoundsLocked(false);
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
  editingDrive = d;
  const set = (k, v) => { document.getElementById(k).value = v ?? ''; };
  document.getElementById('driveModalTitle').textContent = 'Edit Drive';
  Validate.clear(document.getElementById('driveForm'));
  set('driveId', d._id);
  set('company', d.company?._id || d.company);
  document.getElementById('company').disabled = true;
  set('jobTitle', d.jobTitle);
  set('jobDescription', d.jobDescription);
  set('jobType', d.jobType || 'Full-Time');
  set('packageLPA', d.packageLPA);
  set('openings', d.openings);
  set('location', d.location);
  set('applicationDeadline', Validate.toLocalInput(d.applicationDeadline));
  set('driveDate', Validate.toLocalInput(d.driveDate));
  set('collegeRequirements', d.collegeRequirements);
  document.querySelectorAll('.doc-check').forEach((c) => { c.checked = (d.requiredDocuments || []).includes(c.value); });

  const e = d.eligibility || {};
  set('eligBranches', (e.branches || []).join(', '));
  set('eligBatch', e.batch);
  set('eligCgpa', e.minCgpa || 0);
  set('eligBacklogs', e.maxBacklogs ?? 0);
  set('eligTenth', e.min10th || 0);
  set('eligTwelfth', e.min12th || 0);

  document.getElementById('roundsContainer').innerHTML = '';
  roundCounter = 0;
  (d.rounds || []).forEach((r) => addRoundRow(r.name, r));
  setRoundsLocked((d.applicationCount || 0) > 0);
  UI.clearAlert('modalAlert');
  driveModal.show();
}

function setRoundsLocked(locked) {
  document.getElementById('addRoundBtn').classList.toggle('d-none', locked);
  document.getElementById('roundsLockedNote').textContent = locked
    ? 'Students have already applied, so rounds cannot be added, removed or renamed. You can still change dates and venues.'
    : 'Set dates after the application deadline; each round must start after the previous one ends.';
  document.querySelectorAll('.round-name').forEach((s) => { s.disabled = locked; });
  document.querySelectorAll('.round-del').forEach((b) => b.classList.toggle('d-none', locked));
}

function addRoundRow(name = 'Aptitude', r = {}) {
  if (document.querySelectorAll('.round-row').length >= 10) {
    UI.showAlert('modalAlert', 'A drive can have at most 10 rounds.');
    return;
  }
  roundCounter++;
  const rowId = `round-${roundCounter}`;
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 round-row';
  div.id = rowId;
  div.dataset.id = r._id || '';
  div.innerHTML = `
    <div class="col-md-3"><select class="form-select form-select-sm round-name">
      ${ROUND_NAMES.map((n) => `<option ${name === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="col-md-3"><input type="datetime-local" class="form-control form-control-sm round-date" title="Start" value="${Validate.toLocalInput(r.date)}"></div>
    <div class="col-md-3"><input type="datetime-local" class="form-control form-control-sm round-end" title="End (optional)" value="${Validate.toLocalInput(r.endDate)}"></div>
    <div class="col-md-2"><input type="text" class="form-control form-control-sm round-venue" placeholder="Venue" maxlength="120" value="${UI.escapeHtml(r.venue || '')}"></div>
    <div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger round-del" onclick="document.getElementById('${rowId}').remove()"><i class="bi bi-trash"></i></button></div>`;
  document.getElementById('roundsContainer').appendChild(div);
}

/** Validates the round rows; returns { rounds, error } */
function collectRounds(deadlineIso) {
  const rows = Array.from(document.querySelectorAll('.round-row'));
  const rounds = [];
  let prevEnd = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n = i + 1;
    const date = row.querySelector('.round-date').value;
    const end = row.querySelector('.round-end').value;
    const venue = row.querySelector('.round-venue').value.trim();
    const start = date ? new Date(date) : null;
    const finish = end ? new Date(end) : null;
    if (venue.length > 120) return { error: `Round ${n}: venue is too long` };
    if (finish && !start) return { error: `Round ${n}: set a start time before the end time` };
    if (start && deadlineIso && start <= new Date(deadlineIso)) return { error: `Round ${n} must be scheduled after the application deadline` };
    if (start && prevEnd && start < prevEnd) return { error: `Round ${n} cannot start before Round ${n - 1} ends` };
    if (start && finish && finish <= start) return { error: `Round ${n}: end time must be after the start time` };
    if (start) prevEnd = finish || start;
    const out = { name: row.querySelector('.round-name').value, order: n };
    if (row.dataset.id) out._id = row.dataset.id;
    if (start) out.date = start.toISOString();
    if (finish) out.endDate = finish.toISOString();
    if (venue) out.venue = venue;
    rounds.push(out);
  }
  return { rounds };
}

async function saveDrive() {
  UI.clearAlert('modalAlert');
  const id = document.getElementById('driveId').value;
  const schema = driveSchema();
  if (id) delete schema.company;
  const { ok, values: v } = Validate.run(schema);
  if (!ok) return;

  // an untouched deadline keeps its exact stored value (so an already-passed deadline does not block other edits)
  const deadlineIso = editingDrive && !changedDeadline() ? new Date(editingDrive.applicationDeadline).toISOString() : Validate.toISO(v.applicationDeadline);
  const { rounds, error } = collectRounds(deadlineIso);
  if (error) return UI.showAlert('modalAlert', error);

  const payload = {
    jobTitle: v.jobTitle,
    jobDescription: v.jobDescription,
    jobType: v.jobType,
    packageLPA: Number(v.packageLPA),
    location: v.location,
    applicationDeadline: deadlineIso,
    requiredDocuments: Array.from(document.querySelectorAll('.doc-check:checked')).map((c) => c.value),
    collegeRequirements: v.collegeRequirements,
    eligibility: {
      branches: Validate.list(v.eligBranches),
      minCgpa: Number(v.eligCgpa) || 0,
      maxBacklogs: Number(v.eligBacklogs) || 0,
      min10th: Number(v.eligTenth) || 0,
      min12th: Number(v.eligTwelfth) || 0,
    },
    rounds,
  };
  if (v.openings) payload.openings = Number(v.openings);
  if (v.eligBatch) payload.eligibility.batch = Number(v.eligBatch);
  if (v.driveDate) payload.driveDate = Validate.toISO(v.driveDate);
  if (!id) payload.company = v.company;

  await withButton(document.getElementById('saveDriveBtn'), '<span class="spinner-border spinner-border-sm me-1"></span>Saving...', async () => {
    try {
      if (id) await Api.put(`/tpo/drives/${id}`, payload);
      else await Api.post('/tpo/drives', payload);
      driveModal.hide();
      UI.showAlert('alertBox', 'Drive saved successfully.', 'success');
      await loadDrives();
    } catch (err) {
      Validate.showServerErrors(err.errors, { 'eligibility.minCgpa': 'eligCgpa', 'eligibility.maxBacklogs': 'eligBacklogs', 'eligibility.min10th': 'eligTenth', 'eligibility.min12th': 'eligTwelfth', 'eligibility.branches': 'eligBranches', 'eligibility.batch': 'eligBatch' });
      UI.showAlert('modalAlert', err.message);
    }
  });
}

// ------------------------------------------------------------------ publish
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

// ------------------------------------------------------------------ schedule
function openSchedule(id) {
  const d = allDrives.find((x) => x._id === id);
  if (!d) return;
  scheduleDriveId = id;
  document.getElementById('schedTitle').textContent = d.jobTitle;
  UI.clearAlert('schedAlert');
  document.getElementById('schedDriveDate').value = Validate.toLocalInput(d.driveDate);
  document.getElementById('schedRounds').innerHTML = (d.rounds || []).length
    ? d.rounds.map((r, i) => `
      <div class="row g-2 align-items-center mb-2 sched-row" data-id="${r._id}">
        <div class="col-md-3 fw-semibold small">${i + 1}. ${UI.escapeHtml(r.name)}</div>
        <div class="col-md-3"><input type="datetime-local" class="form-control form-control-sm s-date" value="${Validate.toLocalInput(r.date)}"></div>
        <div class="col-md-3"><input type="datetime-local" class="form-control form-control-sm s-end" value="${Validate.toLocalInput(r.endDate)}"></div>
        <div class="col-md-3"><input type="text" class="form-control form-control-sm s-venue" maxlength="120" placeholder="Venue" value="${UI.escapeHtml(r.venue || '')}"></div>
      </div>`).join('')
    : '<div class="text-muted small">This drive has no rounds yet. Add rounds via Edit.</div>';
  scheduleModal.show();
}

async function saveSchedule() {
  UI.clearAlert('schedAlert');
  const d = allDrives.find((x) => x._id === scheduleDriveId);
  const rows = Array.from(document.querySelectorAll('.sched-row'));
  const now = Date.now();
  const deadline = new Date(d.applicationDeadline);
  let prevEnd = null;
  const rounds = [];
  for (let i = 0; i < rows.length; i++) {
    const n = i + 1;
    const date = rows[i].querySelector('.s-date').value;
    const end = rows[i].querySelector('.s-end').value;
    const start = date ? new Date(date) : null;
    const finish = end ? new Date(end) : null;
    if (finish && !start) return UI.showAlert('schedAlert', `Round ${n}: set a start time before the end time`);
    if (start) {
      if (start.getTime() < now) return UI.showAlert('schedAlert', `Round ${n} must be in the future`);
      if (start <= deadline) return UI.showAlert('schedAlert', `Round ${n} must be after the application deadline (${UI.formatDateTime(deadline)})`);
      if (prevEnd && start < prevEnd) return UI.showAlert('schedAlert', `Round ${n} cannot start before Round ${n - 1} ends`);
      if (finish && finish <= start) return UI.showAlert('schedAlert', `Round ${n}: end time must be after the start time`);
      prevEnd = finish || start;
    }
    rounds.push({ roundId: rows[i].dataset.id, date: start ? start.toISOString() : null, endDate: finish ? finish.toISOString() : null, venue: rows[i].querySelector('.s-venue').value.trim() });
  }
  const payload = {};
  if (rounds.length) payload.rounds = rounds;
  const dd = document.getElementById('schedDriveDate').value;
  if (dd) {
    const t = new Date(dd);
    if (t <= deadline) return UI.showAlert('schedAlert', 'Drive date must be after the application deadline');
    if (t.getTime() < now) return UI.showAlert('schedAlert', 'Drive date must be in the future');
    payload.driveDate = t.toISOString();
  }
  if (!payload.rounds && !payload.driveDate) return UI.showAlert('schedAlert', 'Nothing to save — enter at least one date.');

  await withButton(document.getElementById('schedSaveBtn'), '<span class="spinner-border spinner-border-sm me-1"></span>Saving...', async () => {
    try {
      const res = await Api.put(`/tpo/drives/${scheduleDriveId}/schedule`, payload);
      scheduleModal.hide();
      UI.showAlert('alertBox', `Schedule saved. ${res.notified} student(s) notified.`, 'success');
      await loadDrives();
    } catch (err) {
      UI.showAlert('schedAlert', err.message);
    }
  });
}

// ------------------------------------------------------------------ approve / reject / close / cancel
function openDecision(id) {
  const d = allDrives.find((x) => x._id === id);
  reasonAction = { type: 'decision', id };
  document.getElementById('reasonTitle').textContent = `Review: ${d.jobTitle}`;
  document.getElementById('reasonDesc').textContent = 'Approve to publish this requirement to eligible students (set eligibility first via Edit if needed), or reject it with a reason the company will see.';
  document.getElementById('approveExtras').classList.remove('d-none');
  document.getElementById('approveCollege').value = d.collegeRequirements || '';
  prepReason('Reject', true);
  const btn = document.getElementById('reasonConfirmBtn');
  // second button for approve
  let ap = document.getElementById('reasonApproveBtn');
  if (!ap) {
    ap = document.createElement('button');
    ap.id = 'reasonApproveBtn';
    ap.type = 'button';
    ap.className = 'btn btn-success';
    ap.textContent = 'Approve & publish';
    btn.parentNode.insertBefore(ap, btn);
    ap.addEventListener('click', () => submitDecision('approved'));
  }
  ap.classList.remove('d-none');
  reasonModal.show();
}

function openStatus(id, status) {
  const d = allDrives.find((x) => x._id === id);
  reasonAction = { type: 'status', id, status };
  document.getElementById('approveExtras').classList.add('d-none');
  const ap = document.getElementById('reasonApproveBtn');
  if (ap) ap.classList.add('d-none');
  if (status === 'closed') {
    document.getElementById('reasonTitle').textContent = `Close: ${d.jobTitle}`;
    document.getElementById('reasonDesc').textContent = 'Closing stops new applications. Existing applications continue through the rounds.';
    prepReason('Close drive', false);
  } else {
    document.getElementById('reasonTitle').textContent = `Cancel: ${d.jobTitle}`;
    document.getElementById('reasonDesc').textContent = 'Applicants and the company will be notified with your reason. This cannot be undone.';
    prepReason('Cancel drive', true);
  }
  reasonModal.show();
}

function prepReason(label, needReason) {
  UI.clearAlert('reasonAlert');
  document.getElementById('reasonText').value = '';
  Validate.clear(document.getElementById('reasonWrap'));
  document.getElementById('reasonWrap').classList.toggle('d-none', !needReason);
  document.getElementById('reasonConfirmBtn').textContent = label;
  reasonAction.needReason = needReason;
}

const reasonRule = { reasonText: V.text({ label: 'Reason', required: true, min: 5, max: 500 }) };

async function submitDecision(decision) {
  UI.clearAlert('reasonAlert');
  const payload = { decision };
  const college = document.getElementById('approveCollege').value.trim();
  if (college.length > 1000) return UI.showAlert('reasonAlert', 'College requirements must be at most 1000 characters');
  if (college) payload.collegeRequirements = college;
  if (decision === 'rejected') {
    const r = Validate.run(reasonRule);
    if (!r.ok) return;
    payload.reason = r.values.reasonText;
  }
  try {
    const res = await Api.put(`/tpo/drives/${reasonAction.id}/decision`, payload);
    reasonModal.hide();
    UI.showAlert('alertBox', decision === 'approved' ? `Approved and published. ${res.eligibleStudentsNotified} eligible student(s) notified.` : 'Requirement rejected. The company has been notified.', decision === 'approved' ? 'success' : 'warning');
    await loadDrives();
  } catch (err) {
    UI.showAlert('reasonAlert', err.message);
  }
}

async function submitReason() {
  if (!reasonAction) return;
  if (reasonAction.type === 'decision') return submitDecision('rejected');
  UI.clearAlert('reasonAlert');
  const payload = { status: reasonAction.status };
  if (reasonAction.needReason) {
    const r = Validate.run(reasonRule);
    if (!r.ok) return;
    payload.reason = r.values.reasonText;
  }
  try {
    await Api.put(`/tpo/drives/${reasonAction.id}/status`, payload);
    reasonModal.hide();
    UI.showAlert('alertBox', `Drive ${reasonAction.status}.`, 'success');
    await loadDrives();
  } catch (err) {
    UI.showAlert('reasonAlert', err.message);
  }
}
