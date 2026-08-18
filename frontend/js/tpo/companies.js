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
        <td>
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
  document.getElementById('revMinCgpa').textContent = req.eligibility?.minCgpa != null ? `${req.eligibility.minCgpa} CGPA` : '0';
  document.getElementById('revMaxBacklogs').textContent = req.eligibility?.maxBacklogs != null ? req.eligibility.maxBacklogs : '0';
  document.getElementById('revMinMarks').textContent = `10th: ${req.eligibility?.min10th || 0}%, 12th: ${req.eligibility?.min12th || 0}%`;

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

  const isApproved = c.approvalStatus === 'approved';
  document.getElementById('approveBtn').style.display = isApproved ? 'none' : 'inline-block';
  document.getElementById('rejectBtn').style.display = isApproved ? 'none' : 'inline-block';

  reviewModal.show();
}

async function submitDecision(decision) {
  if (!selectedCompanyId) return;
  UI.clearAlert('reviewAlert');

  const payload = {
    decision,
    collegeRequirements: document.getElementById('collegeRequirements').value.trim(),
  };

  const branchOverride = document.getElementById('overrideBranches').value.trim();
  const cgpaOverride = document.getElementById('overrideCgpa').value;
  const backlogsOverride = document.getElementById('overrideBacklogs').value;

  const eligibility = {};
  if (branchOverride) eligibility.branches = branchOverride.split(',').map((b) => b.trim()).filter(Boolean);
  if (cgpaOverride) eligibility.minCgpa = parseFloat(cgpaOverride);
  if (backlogsOverride) eligibility.maxBacklogs = parseInt(backlogsOverride, 10);

  if (Object.keys(eligibility).length > 0) {
    payload.eligibility = eligibility;
  }

  try {
    const res = await Api.put(`/tpo/companies/${selectedCompanyId}/approve`, payload);
    reviewModal.hide();
    const msg = decision === 'approved'
      ? `Company approved! Placement drive published and ${res.eligibleStudentsNotified || 0} eligible students notified on their dashboards.`
      : 'Company application rejected.';
    UI.showAlert('alertBox', msg, decision === 'approved' ? 'success' : 'warning');
    await loadCompanies();
  } catch (err) {
    UI.showAlert('reviewAlert', err.message);
  }
}
