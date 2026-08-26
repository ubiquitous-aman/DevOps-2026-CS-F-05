let allUsers = [], currentRoleFilter = '', newUserModal;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'admin', active: 'users', title: 'Manage Users' });
  if (!user) return;

  newUserModal = new bootstrap.Modal(document.getElementById('newUserModal'));

  // Role filter tab clicks
  document.querySelectorAll('#roleFilter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#roleFilter button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoleFilter = btn.dataset.role;
      toggleStudentFilters();
      renderUsers();
    });
  });

  // Student filter / sort / search live update
  ['studentSearch', 'branchFilter', 'placementFilter', 'sortFilter'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderUsers);
  });

  await loadUsers();
});

function toggleStudentFilters() {
  const card = document.getElementById('studentFiltersCard');
  if (currentRoleFilter === 'student') {
    card.classList.remove('d-none');
    // Switch to extended student table header
    document.getElementById('usersTableHead').innerHTML =
      '<tr><th>Name</th><th>Roll</th><th>Branch</th><th>Batch</th><th>CGPA</th><th>Status</th><th>Placement</th><th>Actions</th></tr>';
  } else {
    card.classList.add('d-none');
    document.getElementById('usersTableHead').innerHTML =
      '<tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>';
  }
}

async function loadUsers() {
  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = `<tr><td colspan="8">${UI.spinner()}</td></tr>`;
  try {
    // Fetch all users; when student tab is active fetch with ?role=student for enriched data
    const role = currentRoleFilter || '';
    const { users } = await Api.get(`/admin/users${role ? `?role=${role}` : ''}`);
    allUsers = users;
    renderUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTbody');
  let filtered = currentRoleFilter ? allUsers.filter((u) => u.role === currentRoleFilter) : allUsers;

  // --- Student-specific filtering ---
  if (currentRoleFilter === 'student') {
    const search = (document.getElementById('studentSearch')?.value || '').toLowerCase();
    const branch = document.getElementById('branchFilter')?.value || '';
    const placement = document.getElementById('placementFilter')?.value || '';
    const sort = document.getElementById('sortFilter')?.value || 'name';

    if (search) {
      filtered = filtered.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(search) ||
          (u.profile?.roll || '').toLowerCase().includes(search)
      );
    }
    if (branch) {
      filtered = filtered.filter((u) => (u.profile?.branch || '') === branch);
    }
    if (placement) {
      filtered = filtered.filter((u) => u.placementStatus === placement);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (sort === 'cgpa') return (b.profile?.cgpa || 0) - (a.profile?.cgpa || 0);
      if (sort === 'batch') return (b.profile?.batch || 0) - (a.profile?.batch || 0);
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">${UI.empty('No users found.')}</td></tr>`;
    return;
  }

  if (currentRoleFilter === 'student') {
    tbody.innerHTML = filtered
      .map(
        (u) => `
      <tr>
        <td>${UI.escapeHtml(u.name)}</td>
        <td class="small text-muted">${UI.escapeHtml(u.profile?.roll || '—')}</td>
        <td>${UI.escapeHtml(u.profile?.branch || '—')}</td>
        <td>${u.profile?.batch || '—'}</td>
        <td>${u.profile?.cgpa != null ? u.profile.cgpa.toFixed(2) : '—'}</td>
        <td>${u.isActive
          ? '<span class="badge badge-status badge-approved">Active</span>'
          : '<span class="badge badge-status badge-rejected">Inactive</span>'}</td>
        <td><span class="badge ${placementBadge(u.placementStatus)}">${u.placementStatus}</span></td>
        <td>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'}"
              onclick="toggleStatus('${u._id}', ${!u.isActive})">
              ${u.isActive
                ? '<i class="bi bi-slash-circle"></i> Deactivate'
                : '<i class="bi bi-check-circle"></i> Activate'}
            </button>
            <button class="btn btn-sm btn-outline-danger"
              onclick="deleteUser('${u._id}', '${UI.escapeHtml(u.name)}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join('');
  } else {
    tbody.innerHTML = filtered
      .map(
        (u) => `
      <tr>
        <td>${UI.escapeHtml(u.name)}</td>
        <td>${UI.escapeHtml(u.email)}</td>
        <td><span class="badge bg-secondary text-uppercase">${u.role}</span></td>
        <td>${u.isActive
          ? '<span class="badge badge-status badge-approved">Active</span>'
          : '<span class="badge badge-status badge-rejected">Inactive</span>'}</td>
        <td class="small text-muted">${u.lastLogin ? UI.formatDateTime(u.lastLogin) : 'Never'}</td>
        <td>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'}"
              onclick="toggleStatus('${u._id}', ${!u.isActive})">
              ${u.isActive
                ? '<i class="bi bi-slash-circle"></i> Deactivate'
                : '<i class="bi bi-check-circle"></i> Activate'}
            </button>
            <select class="form-select form-select-sm w-auto" onchange="changeRole('${u._id}', this.value)">
              ${['student', 'tpo', 'company'].map((r) =>
                `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline-danger"
              onclick="deleteUser('${u._id}', '${UI.escapeHtml(u.name)}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join('');
  }
}

function placementBadge(status) {
  if (status === 'Placed') return 'badge-approved badge-status';
  if (status === 'Applied / In Process') return 'badge-status bg-info text-dark';
  return 'badge-status bg-secondary';
}

async function toggleStatus(id, isActive) {
  try {
    await Api.put(`/admin/users/${id}/status`, { isActive });
    UI.showAlert('alertBox', `User ${isActive ? 'activated' : 'deactivated'}.`, 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function changeRole(id, role) {
  if (!confirm(`Change this user's role to '${role}'?`)) {
    await loadUsers();
    return;
  }
  try {
    await Api.put(`/admin/users/${id}/role`, { role });
    UI.showAlert('alertBox', 'Role updated.', 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

async function deleteUser(id, name) {
  if (!confirm(`⚠️ Permanently delete "${name}"?\n\nThis will also delete their profile, applications, and notifications. This action CANNOT be undone.`)) return;
  try {
    await Api.delete(`/admin/users/${id}`);
    UI.showAlert('alertBox', `User "${name}" has been deleted.`, 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}

function toggleCompanyFields() {
  const role = document.getElementById('nuRole').value;
  const fields = document.getElementById('companyFields');
  if (role === 'company') {
    fields.classList.remove('d-none');
    document.getElementById('nuCompanyName').required = true;
  } else {
    fields.classList.add('d-none');
    document.getElementById('nuCompanyName').required = false;
  }
}

async function createUser() {
  UI.clearAlert('newUserAlert');
  const role = document.getElementById('nuRole').value;
  const payload = {
    name: document.getElementById('nuName').value.trim(),
    email: document.getElementById('nuEmail').value.trim(),
    password: document.getElementById('nuPassword').value,
    role,
  };
  if (role === 'company') {
    payload.companyName = document.getElementById('nuCompanyName').value.trim();
    payload.industry = document.getElementById('nuIndustry').value.trim();
    if (!payload.companyName) {
      UI.showAlert('newUserAlert', 'Company Name is required.');
      return;
    }
  }
  if (!payload.name || !payload.email || !payload.password) {
    UI.showAlert('newUserAlert', 'Please fill all required fields.');
    return;
  }
  try {
    await Api.post('/admin/users', payload);
    newUserModal.hide();
    document.getElementById('newUserForm').reset();
    document.getElementById('companyFields').classList.add('d-none');
    UI.showAlert('alertBox', 'Account created successfully.', 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('newUserAlert', err.message);
  }
}
