/**
 * student-view.js — shared "full student details" modal (used by T&P and Admin).
 * StudentView.open('/tpo/students/<id>')  or  StudentView.open('/admin/students/<id>')
 */
const StudentView = {
  modal: null,
  ensure() {
    if (document.getElementById('studentViewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="studentViewModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title"><i class="bi bi-person-vcard me-2"></i>Student details</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="studentViewBody"></div>
      </div></div>
    </div>`);
    StudentView.modal = new bootstrap.Modal(document.getElementById('studentViewModal'));
  },
  async open(path) {
    StudentView.ensure();
    const body = document.getElementById('studentViewBody');
    body.innerHTML = UI.spinner();
    StudentView.modal.show();
    try {
      const { student: s, applications } = await Api.get(path);
      const a = s.academics || {};
      const link = (u) => (u ? `<a href="${UI.escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${UI.escapeHtml(u)}</a>` : '—');
      body.innerHTML = `
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="company-avatar">${UI.initials(s.user.name)}</div>
          <div>
            <h5 class="mb-0">${UI.escapeHtml(s.user.name)}
              ${s.isPlaced ? '<span class="badge bg-success ms-1">Placed</span>' : ''}
              ${s.user.isActive ? '' : '<span class="badge bg-danger ms-1">Inactive</span>'}</h5>
            <div class="text-muted small">${UI.escapeHtml(s.user.email)} · ${UI.escapeHtml(s.phone || 'no phone')}</div>
          </div>
        </div>
        <div class="row g-3 small">
          <div class="col-md-4"><strong>Roll no.</strong><br>${UI.escapeHtml(s.rollNumber)}</div>
          <div class="col-md-4"><strong>Branch</strong><br>${UI.escapeHtml(s.branch)}</div>
          <div class="col-md-4"><strong>Batch</strong><br>${s.batch}</div>
          <div class="col-md-3"><strong>CGPA</strong><br>${a.cgpa ?? '—'}</div>
          <div class="col-md-3"><strong>10th %</strong><br>${a.tenthPercentage ?? '—'}</div>
          <div class="col-md-3"><strong>12th / Diploma %</strong><br>${a.twelfthPercentage ?? '—'}</div>
          <div class="col-md-3"><strong>Active backlogs</strong><br>${a.activeBacklogs ?? 0}</div>
          <div class="col-12"><strong>Skills</strong><br>${(s.skills || []).map((k) => `<span class="badge bg-light text-dark border me-1">${UI.escapeHtml(k)}</span>`).join('') || '—'}</div>
          <div class="col-md-4"><strong>GitHub</strong><br>${link(s.links?.github)}</div>
          <div class="col-md-4"><strong>LinkedIn</strong><br>${link(s.links?.linkedin)}</div>
          <div class="col-md-4"><strong>Portfolio</strong><br>${link(s.links?.portfolio)}</div>
          <div class="col-md-6"><strong>Resume</strong><br>${s.resume?.filePath ? `<a href="#" onclick="openResumeFor('${s._id}'); return false;">${UI.escapeHtml(s.resume.fileName)}</a>` : 'Not uploaded'}</div>
          <div class="col-md-6"><strong>Placement</strong><br>${s.isPlaced ? `${UI.escapeHtml(s.placedCompany || '')} · ₹${s.placedPackage ?? '—'} LPA` : 'Not placed'}</div>
          <div class="col-md-6"><strong>Registered</strong><br>${UI.formatDate(s.user.createdAt)}</div>
          <div class="col-md-6"><strong>Last login</strong><br>${s.user.lastLogin ? UI.formatDateTime(s.user.lastLogin) : 'Never'}</div>
        </div>
        <hr>
        <h6 class="fw-bold">Applications (${applications.length})</h6>
        ${applications.length ? `<div class="table-responsive"><table class="table table-sm align-middle">
          <thead><tr><th>Drive</th><th>Company</th><th>Applied</th><th>Status</th></tr></thead><tbody>
          ${applications.map((ap) => `<tr>
            <td>${UI.escapeHtml(ap.drive?.jobTitle || '(deleted drive)')}</td>
            <td>${UI.escapeHtml(ap.drive?.company?.companyName || '—')}</td>
            <td>${UI.formatDate(ap.appliedAt)}</td>
            <td><span class="${UI.badgeClass(ap.status)}">${ap.status}</span></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="text-muted small">No applications yet.</div>'}`;
    } catch (err) {
      body.innerHTML = `<div class="alert alert-danger">${UI.escapeHtml(err.message)}</div>`;
    }
  },
};
