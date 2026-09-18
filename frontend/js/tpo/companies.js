let allCompanies = [];
let selectedCompanyId = null;
let reviewModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'companies', title: 'Manage Companies' });
  if (!user) return;

  reviewModal = new bootstrap.Modal(document.getElementById('reviewModal'));
  await loadCompanies();
});

async function loadCompanies() {
  const tbody = document.getElementById('companiesTbody');
  tbody.innerHTML = `<tr><td colspan="6">${UI.spinner()}</td></tr>`;
  try {
    const { companies } = await Api.get('/tpo/companies');
    allCompanies = companies;
    if (companies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">${UI.empty('No companies registered yet.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = companies
      .map((c) => {
        const req = c.pendingDrive || c.placementRequirement || null;
        const reqSummary = req?.jobTitle
          ? `<span class="fw-semibold text-primary">${UI.escapeHtml(req.jobTitle)}</span>
             <div class="text-muted small">${req.packageLPA ? req.packageLPA + ' LPA' : ''} ${req.jobType ? '· ' + req.jobType : ''}</div>`
          : `<span class="text-muted small">Standard Registration</span>`;

        return `
      <tr>
        <td>
          <div class="fw-semibold">${UI.escapeHtml(c.companyName)}</div>
          <div class="text-muted small">${UI.escapeHtml(c.website || '')}</div>
        </td>
        <td>${UI.escapeHtml(c.industry || '—')}</td>
        <td>
          <div>${UI.escapeHtml(c.hrContact?.name || c.user?.name || '—')}</div>
          <div class="text-muted small">${UI.escapeHtml(c.user?.email || '')}</div>
        </td>
        <td>${reqSummary}</td>
        <td><span class="${UI.badgeClass(c.approvalStatus)}">${c.approvalStatus}</span></td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary me-1" title="Send a message to this company" onclick="messageCompany('${c._id}', '${UI.escapeHtml(c.companyName).replace(/'/g, '&#39;')}')"><i class="bi bi-chat-dots"></i></button>
          ${
            c.approvalStatus === 'pending'
              ? `<button class="btn btn-sm btn-primary-portal" onclick="openReviewModal('${c._id}')">
                   <i class="bi bi-shield-check me-1"></i>Review & Approve
                 </button>`
              : `<button class="btn btn-sm btn-outline-secondary" onclick="openReviewModal('${c._id}')">
                   <i class="bi bi-eye me-1"></i>View Details
                 </button>`
          }
        </td>
      </tr>`;
      })
      .join('');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function openReviewModal(id) {
  selectedCompanyId = id;
  const c = allCompanies.find((item) => item._id === id);
  if (!c) return;

  UI.clearAlert('reviewAlert');

  // Fill Profile
  document.getElementById('revCompName').textContent = c.companyName || '—';
  document.getElementById('revIndustry').textContent = c.industry || '—';
  document.getElementById('revWebsite').innerHTML = c.website
    ? `<a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" rel="noopener noreferrer">${UI.escapeHtml(c.website)}</a>`
    : '—';
  document.getElementById('revHrContact').textContent = `${c.hrContact?.name || c.user?.name || '—'} (${c.hrContact?.phone || c.user?.email || '—'})`;
  document.getElementById('revDescription').textContent = c.description || 'No description provided.';

  // Fill Company Requirements (from pending drive or placementRequirement)
  const req = c.pendingDrive || c.placementRequirement || {};
  document.getElementById('revJobTitle').textContent = req.jobTitle || 'General Campus Recruitment';
  document.getElementById('revPackage').textContent = req.packageLPA ? `${req.packageLPA} LPA` : 'To be discussed';
  document.getElementById('revJobType').textContent = req.jobType || 'Full-Time';
  document.getElementById('revLocation').textContent = req.location || 'Pan India / Jaipur';
  document.getElementById('revDeadline').textContent = req.applicationDeadline ? UI.formatDate(req.applicationDeadline) : 'Flexible';
  document.getElementById('revBranches').textContent = (req.eligibility?.branches && req.eligibility.branches.length > 0)
    ? req.eligibility.branches.join(', ')
    : 'All Eligible Branches';
  document.getElementById('revBatch').textContent = req.eligibility?.batch || '2026';
  document.getElementById('revMinCgpa').textContent = req.eligibility?.minCgpa ? `${req.eligibility.minCgpa} CGPA` : 'Not specified by company';
  document.getElementById('revMaxBacklogs').textContent = req.eligibility?.maxBacklogs != null && req.eligibility?.minCgpa ? req.eligibility.maxBacklogs : 'Not specified by company';
  document.getElementById('revMinMarks').textContent = (req.eligibility?.min10th || req.eligibility?.min12th) ? `10th: ${req.eligibility.min10th || 0}%, 12th/Diploma: ${req.eligibility.min12th || 0}%` : 'Not specified by company';

  // Rounds
  const rounds = req.rounds || [];
  if (rounds.length > 0) {
    document.getElementById('revRounds').innerHTML = rounds
      .map((r, i) => `<span class="badge bg-light text-dark border me-1 mb-1">Round ${r.order || i + 1}: ${UI.escapeHtml(r.name || 'Round')}</span>`)
      .join('');
  } else {
    document.getElementById('revRounds').innerHTML = '<span class="text-muted small">Standard rounds (Aptitude, Technical, HR)</span>';
  }

  // Pre-fill existing college requirements if drive already has them
  document.getElementById('collegeRequirements').value = req.collegeRequirements || '';
  document.getElementById('overrideBranches').value = '';
  document.getElementById('overrideCgpa').value = '';
  document.getElementById('overrideBacklogs').value = '';

  document.getElementById('rejectReasonCard').classList.add('d-none');
  document.getElementById('rejectReason').value = '';
  Validate.clear(document.getElementById('reviewModal'));
  const isApproved = c.approvalStatus === 'approved';
  document.getElementById('approveBtn').style.display = isApproved ? 'none' : 'inline-block';
  document.getElementById('rejectBtn').style.display = isApproved ? 'none' : 'inline-block';

  reviewModal.show();
}

const overrideSchema = {
  collegeRequirements: V.text({ label: 'College requirements', max: 1000 }),
  overrideBranches: (v) => {
    const bad = Validate.list(v).find((b) => !BRANCHES.includes(b));
    return bad ? `'${bad}' is not a valid branch (use: ${BRANCHES.join(', ')})` : '';
  },
  overrideCgpa: V.number({ label: 'Min CGPA', min: 0, max: 10, decimals: 2 }),
  overrideBacklogs: V.int({ label: 'Max backlogs', min: 0, max: 50 }),
};

/** first click on "Reject" reveals the reason box; second click submits */
function startReject() {
  const card = document.getElementById('rejectReasonCard');
  if (card.classList.contains('d-none')) {
    card.classList.remove('d-none');
    document.getElementById('rejectReason').focus();
    return;
  }
  submitDecision('rejected');
}

async function submitDecision(decision) {
  if (!selectedCompanyId) return;
  UI.clearAlert('reviewAlert');

  const payload = { decision };
  if (decision === 'rejected') {
    const r = Validate.run({ rejectReason: V.text({ label: 'Reason', required: true, min: 5, max: 500 }) });
    if (!r.ok) return;
    payload.reason = r.values.rejectReason;
  } else {
    const { ok } = Validate.run(overrideSchema);
    if (!ok) return;
    payload.collegeRequirements = document.getElementById('collegeRequirements').value.trim();
    const eligibility = {};
    const branchOverride = document.getElementById('overrideBranches').value.trim();
    const cgpaOverride = document.getElementById('overrideCgpa').value;
    const backlogsOverride = document.getElementById('overrideBacklogs').value;
    if (branchOverride) eligibility.branches = Validate.list(branchOverride);
    if (cgpaOverride !== '') eligibility.minCgpa = parseFloat(cgpaOverride);
    if (backlogsOverride !== '') eligibility.maxBacklogs = parseInt(backlogsOverride, 10);
    if (Object.keys(eligibility).length > 0) payload.eligibility = eligibility;
  }

  const btn = document.getElementById(decision === 'approved' ? 'approveBtn' : 'rejectBtn');
  await withButton(btn, '<span class="spinner-border spinner-border-sm me-1"></span>Saving...', async () => {
    try {
      const res = await Api.put(`/tpo/companies/${selectedCompanyId}/approve`, payload);
      reviewModal.hide();
      const msg = decision === 'approved'
        ? `Company approved!${res.drive ? ` Drive published and ${res.eligibleStudentsNotified || 0} eligible students notified.` : ''}`
        : 'Company application rejected.';
      UI.showAlert('alertBox', msg, decision === 'approved' ? 'success' : 'warning');
      await loadCompanies();
    } catch (err) {
      UI.showAlert('reviewAlert', err.message);
    }
  });
}

/** T&P -> company message (arrives in the company's Notifications inbox; companies reply with "Message T&P"). */
async function messageCompany(companyId, name) {
  const subject = prompt(`Message to ${name}\n\nSubject:`);
  if (subject === null) return;
  const message = prompt('Message:');
  if (message === null) return;
  try {
    const res = await Api.post('/tpo/message-company', { companyId, subject: subject.trim(), message: message.trim() });
    UI.showAlert('alertBox', res.message, 'success');
  } catch (err) {
    UI.showAlert('alertBox', err.errors ? Object.values(err.errors)[0] : err.message);
  }
}
