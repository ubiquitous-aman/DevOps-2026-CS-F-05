let roundCounter = 0;
const MAX_ROUNDS = 10;

const reqSchema = () => ({
  jobTitle: V.text({ label: 'Job title', required: true, min: 3, max: 100 }),
  jobDescription: V.text({ label: 'Job description', max: 2000 }),
  jobType: V.select({ label: 'a job type', allowed: ['Full-Time', 'Internship', 'Internship + PPO'] }),
  packageLPA: V.number({ label: 'Package / CTC', required: true, exclusiveMin: 0, max: 500, decimals: 2 }),
  openings: V.int({ label: 'Number of openings', min: 1, max: 10000 }),
  location: V.text({ label: 'Location', max: 100 }),
  minCgpa: V.number({ label: 'Minimum CGPA', required: true, min: 0, max: 10, decimals: 2 }),
  maxBacklogs: V.int({ label: 'Maximum backlogs', required: true, min: 0, max: 50 }),
  min10th: V.number({ label: 'Minimum 10th %', required: true, min: 0, max: 100, decimals: 2 }),
  min12th: V.number({ label: 'Minimum 12th / Diploma %', required: true, min: 0, max: 100, decimals: 2 }),
  applicationDeadline: V.date({ label: 'Application deadline', required: true, future: true, maxDaysAhead: 365 }),
});

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'requirement', title: 'Submit Placement Requirement' });
  if (!user) return;

  document.getElementById('docChecks').innerHTML = DOC_TYPES.map((d, i) => `
    <div class="form-check"><input class="form-check-input doc-check" type="checkbox" value="${d}" id="doc${i}" ${d === 'Resume' ? 'checked' : ''}>
    <label class="form-check-label" for="doc${i}">${d}</label></div>`).join('');
  document.getElementById('applicationDeadline').min = Validate.nowLocal();
  Validate.live(reqSchema());
  resetRounds();
  await loadRequirements();

  document.getElementById('reqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    document.getElementById('roundsError').textContent = '';
    const { ok, values } = Validate.run(reqSchema());
    const rounds = Array.from(document.querySelectorAll('.round-row')).map((row, idx) => ({ name: row.querySelector('.round-name').value, order: idx + 1 }));
    if (rounds.length > MAX_ROUNDS) {
      document.getElementById('roundsError').textContent = `At most ${MAX_ROUNDS} rounds`;
      return;
    }
    if (!ok) return;

    const payload = {
      jobTitle: values.jobTitle,
      jobDescription: values.jobDescription,
      jobType: values.jobType,
      packageLPA: Number(values.packageLPA),
      location: values.location,
      applicationDeadline: Validate.toISO(values.applicationDeadline),
      requiredDocuments: Array.from(document.querySelectorAll('.doc-check:checked')).map((c) => c.value),
      eligibility: {
        minCgpa: Number(values.minCgpa),
        maxBacklogs: Number(values.maxBacklogs),
        min10th: Number(values.min10th),
        min12th: Number(values.min12th),
      },
      rounds,
    };
    if (values.openings) payload.openings = Number(values.openings);

    await withButton(document.getElementById('submitBtn'), '<span class="spinner-border spinner-border-sm me-1"></span>Submitting...', async () => {
      try {
        await Api.post('/company/requirements', payload);
        UI.showAlert('alertBox', 'Requirement submitted. Awaiting T&P cell approval.', 'success');
        e.target.reset();
        Validate.clear(e.target);
        document.querySelectorAll('.doc-check').forEach((c) => { c.checked = c.value === 'Resume'; });
        resetRounds();
        await loadRequirements();
      } catch (err) {
        Validate.showServerErrors(err.errors);
        UI.showAlert('alertBox', err.message);
      }
    });
  });
});

function resetRounds() {
  document.getElementById('roundsContainer').innerHTML = '';
  roundCounter = 0;
  addRoundRow('Aptitude');
  addRoundRow('Technical Interview');
  addRoundRow('HR Interview');
}

function addRoundRow(name = 'Aptitude') {
  if (document.querySelectorAll('.round-row').length >= MAX_ROUNDS) {
    document.getElementById('roundsError').textContent = `At most ${MAX_ROUNDS} rounds`;
    return;
  }
  roundCounter++;
  const rowId = `round-${roundCounter}`;
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 round-row';
  div.id = rowId;
  div.innerHTML = `
    <div class="col-10">
      <select class="form-select form-select-sm round-name">
        ${ROUND_NAMES.map((n) => `<option ${name === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    <div class="col-2">
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('${rowId}').remove()"><i class="bi bi-trash"></i></button>
    </div>`;
  document.getElementById('roundsContainer').appendChild(div);
}

async function loadRequirements() {
  const list = document.getElementById('reqList');
  list.innerHTML = UI.spinner();
  try {
    const { drives } = await Api.get('/company/requirements');
    if (drives.length === 0) {
      list.innerHTML = UI.empty('No requirements submitted yet.');
      return;
    }
    list.innerHTML = drives
      .map(
        (d) => `
      <div class="d-flex justify-content-between align-items-start border-bottom py-2">
        <div>
          <div class="fw-semibold small">${UI.escapeHtml(d.jobTitle)}</div>
          <div class="text-muted small">₹${d.packageLPA} LPA${d.openings ? ` · ${d.openings} opening(s)` : ''} · Deadline ${UI.formatDateTime(d.applicationDeadline)}</div>
          ${d.decisionReason ? `<div class="small text-danger"><i class="bi bi-info-circle me-1"></i>${UI.escapeHtml(d.decisionReason)}</div>` : ''}
        </div>
        <div class="text-end">
          <span class="${UI.badgeClass(d.requirementStatus)}">${d.requirementStatus}</span><br>
          <span class="${UI.badgeClass(d.status)} mt-1 d-inline-block">${d.status}</span>
        </div>
      </div>`
      )
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
