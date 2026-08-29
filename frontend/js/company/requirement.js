let roundCounter = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'requirement', title: 'Submit Placement Requirement' });
  if (!user) return;

  addRoundRow('Aptitude');
  addRoundRow('Technical Interview');
  addRoundRow('HR Interview');

  await loadRequirements();

  document.getElementById('reqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');

    const rounds = Array.from(document.querySelectorAll('.round-row')).map((row, idx) => ({
      name: row.querySelector('.round-name').value,
      order: idx + 1,
      date: row.querySelector('.round-date').value || undefined,
      venue: row.querySelector('.round-venue').value,
    }));

    const payload = {
      jobTitle: document.getElementById('jobTitle').value.trim(),
      jobDescription: document.getElementById('jobDescription').value.trim(),
      jobType: document.getElementById('jobType').value,
      packageLPA: Number(document.getElementById('packageLPA').value),
      location: document.getElementById('location').value.trim(),
      applicationDeadline: document.getElementById('applicationDeadline').value,
      rounds,
    };

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    try {
      await Api.post('/company/requirements', payload);
      UI.showAlert('alertBox', 'Requirement submitted. Awaiting TPO Cell approval.', 'success');
      e.target.reset();
      document.getElementById('roundsContainer').innerHTML = '';
      roundCounter = 0;
      addRoundRow('Aptitude');
      addRoundRow('Technical Interview');
      addRoundRow('HR Interview');
      await loadRequirements();
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    } finally {
      btn.disabled = false;
    }
  });
});

function addRoundRow(name = 'Aptitude') {
  roundCounter++;
  const rowId = `round-${roundCounter}`;
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 round-row';
  div.id = rowId;
  div.innerHTML = `
    <div class="col-5">
      <select class="form-select form-select-sm round-name">
        <option ${name === 'Aptitude' ? 'selected' : ''}>Aptitude</option>
        <option ${name === 'Technical Interview' ? 'selected' : ''}>Technical Interview</option>
        <option ${name === 'HR Interview' ? 'selected' : ''}>HR Interview</option>
        <option ${name === 'Other' ? 'selected' : ''}>Other</option>
      </select>
    </div>
    <div class="col-4">
      <input type="date" class="form-control form-control-sm round-date">
    </div>
    <div class="col-2">
      <input type="text" class="form-control form-control-sm round-venue" placeholder="Venue">
    </div>
    <div class="col-1">
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
          <div class="text-muted small">₹${d.packageLPA} LPA · Deadline ${UI.formatDate(d.applicationDeadline)}</div>
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
