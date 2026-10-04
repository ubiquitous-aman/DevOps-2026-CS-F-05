let allUsers = [], currentRoleFilter = '', newUserModal, editModal, resetModal, deleteModal, currentAdminId, pendingDelete = null;
const STAFF_ROLES = ['tpo', 'admin'];

const newUserSchema = () => ({
  nuName: V.name({ label: 'Name' }),
  nuEmail: V.email(),
  nuPassword: V.password({ label: 'Password' }),
  nuRole: V.select({ label: 'a role', allowed: ['tpo', 'company'] }),
  ...(Validate.val('nuRole') === 'company' ? {
    nuCompanyName: V.text({ label: 'Company name', required: true, min: 2, max: 100 }),
    nuIndustry: V.text({ label: 'Industry', max: 60 }),
  } : {}),
});
const resetSchema = () => ({
  rpPassword: V.password({ label: 'New password' }),
  rpConfirm: V.matches('rpPassword'),
});

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'admin', active: 'users', title: 'Manage Users' });
  if (!user) return;

  newUserModal = new bootstrap.Modal(document.getElementById('newUserModal'));
  editModal = new bootstrap.Modal(document.getElementById('editUserModal'));
  resetModal = new bootstrap.Modal(document.getElementById('resetPwdModal'));
  deleteModal = new bootstrap.Modal(document.getElementById('deleteUserModal'));
  currentAdminId = user.id;
  document.getElementById('branchFilter').innerHTML += BRANCHES.map((b) => `<option>${b}</option>`).join('');
  Validate.live(newUserSchema());
  Validate.passwordChecklist('nuPassword', 'nuRules');
  Validate.passwordChecklist('rpPassword', 'rpRules');
  Validate.live(resetSchema());

  // Role filter tab clicks
  document.querySelectorAll('#roleFilter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#roleFilter button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoleFilter = btn.dataset.role;
      toggleStudentFilters();
      loadUsers(); // refetch: the Students tab needs the enriched profile data
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

function actionButtons(u, { student }) {
  const self = u._id === currentAdminId;
  const toggle = self ? '' : `<button class="btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'}"
      onclick="toggleStatus('${u._id}', ${!u.isActive})">${u.isActive ? '<i class="bi bi-slash-circle"></i> Deactivate' : '<i class="bi bi-check-circle"></i> Activate'}</button>`;
  const view = student && u.profile ? `<button class="btn btn-sm btn-outline-primary" title="Full student details" onclick="StudentView.open('/admin/students/${u.profile._id}')"><i class="bi bi-eye"></i> View</button>` : '';
  const edit = `<button class="btn btn-sm btn-outline-secondary" title="Edit name / email" onclick="openEditUser('${u._id}')"><i class="bi bi-pencil"></i></button>`;
  const reset = self ? '' : `<button class="btn btn-sm btn-outline-warning" title="Reset password" onclick="openResetPassword('${u._id}')"><i class="bi bi-key"></i></button>`;
  const role = !student && STAFF_ROLES.includes(u.role) && !self
    ? `<select class="form-select form-select-sm w-auto" title="Change role" onchange="changeRole('${u._id}', this.value, '${u.role}')">
         ${STAFF_ROLES.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : '';
  const del = self ? '' : `<button class="btn btn-sm btn-outline-danger" title="Delete" onclick="openDeleteUser('${u._id}')"><i class="bi bi-trash"></i></button>`;
  return `<div class="d-flex gap-1 flex-wrap">${view}${toggle}${role}${edit}${reset}${del}</div>`;
}

function renderUsers() {
  const tbody = document.getElementById('usersTbody');
  let filtered = currentRoleFilter ? allUsers.filter((u) => u.role === currentRoleFilter) : allUsers;

  if (currentRoleFilter === 'student') {
    const search = (document.getElementById('studentSearch')?.value || '').toLowerCase();
    const branch = document.getElementById('branchFilter')?.value || '';
    const placement = document.getElementById('placementFilter')?.value || '';
    const sort = document.getElementById('sortFilter')?.value || 'name';
    if (search) {
      filtered = filtered.filter((u) => (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search) || (u.profile?.roll || '').toLowerCase().includes(search));
    }
    if (branch) filtered = filtered.filter((u) => (u.profile?.branch || '') === branch);
    if (placement) filtered = filtered.filter((u) => u.placementStatus === placement);
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
  const status = (u) => (u.isActive ? '<span class="badge badge-status badge-approved">Active</span>' : '<span class="badge badge-status badge-rejected">Inactive</span>');

  if (currentRoleFilter === 'student') {
    tbody.innerHTML = filtered.map((u) => `
      <tr>
        <td>${UI.escapeHtml(u.name)}<div class="text-muted small">${UI.escapeHtml(u.email)}</div></td>
        <td class="small text-muted">${UI.escapeHtml(u.profile?.roll || '—')}</td>
        <td>${UI.escapeHtml(u.profile?.branch || '—')}</td>
        <td>${u.profile?.batch || '—'}</td>
        <td>${u.profile?.cgpa != null ? Number(u.profile.cgpa).toFixed(2) : '—'}</td>
        <td>${status(u)}</td>
        <td><span class="badge ${placementBadge(u.placementStatus)}">${u.placementStatus}</span></td>
        <td>${actionButtons(u, { student: true })}</td>
      </tr>`).join('');
  } else {
    tbody.innerHTML = filtered.map((u) => `
      <tr>
        <td>${UI.escapeHtml(u.name)}${u._id === currentAdminId ? ' <span class="badge bg-info text-dark">you</span>' : ''}</td>
        <td>${UI.escapeHtml(u.email)}</td>
        <td><span class="badge bg-secondary text-uppercase">${u.role}</span></td>
        <td>${status(u)}</td>
        <td class="small text-muted">${u.lastLogin ? UI.formatDateTime(u.lastLogin) : 'Never'}</td>
        <td>${actionButtons(u, { student: u.role === 'student' })}</td>
      </tr>`).join('');
  }
}

function placementBadge(status) {
  if (status === 'Placed') return 'badge-approved badge-status';
  if (status === 'Applied / In Process') return 'badge-status bg-info text-dark';
  return 'badge-status bg-secondary';
}

async function toggleStatus(id, isActive) {
  if (!isActive && !confirm('Deactivate this account? The user will be signed out and unable to log in.')) return;
  try {
    await Api.put(`/admin/users/${id}/status`, { isActive });
    UI.showAlert('alertBox', `User ${isActive ? 'activated' : 'deactivated'}.`, 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
    await loadUsers();
  }
}

async function changeRole(id, role, oldRole) {
  if (!confirm(`Change this user's role from '${oldRole}' to '${role}'?\n\nThey will get different permissions the next time they load a page.`)) {
    await loadUsers();
    return;
  }
  try {
    await Api.put(`/admin/users/${id}/role`, { role });
    UI.showAlert('alertBox', 'Role updated.', 'success');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
  await loadUsers();
}

// ---------------- edit ----------------
function openEditUser(id) {
  const u = allUsers.find((x) => x._id === id);
  if (!u) return;
  document.getElementById('euId').value = id;
  document.getElementById('euName').value = u.name;
  document.getElementById('euEmail').value = u.email;
  Validate.clear(document.getElementById('editUserForm'));
  UI.clearAlert('editUserAlert');
  editModal.show();
}
async function saveEditUser() {
  UI.clearAlert('editUserAlert');
  const { ok, values } = Validate.run({ euName: V.name({ label: 'Name' }), euEmail: V.email() });
  if (!ok) return;
  await withButton(document.getElementById('euSave'), 'Saving...', async () => {
    try {
      await Api.put(`/admin/users/${document.getElementById('euId').value}`, { name: values.euName, email: values.euEmail });
      editModal.hide();
      UI.showAlert('alertBox', 'User updated.', 'success');
      await loadUsers();
    } catch (err) {
      Validate.showServerErrors(err.errors, { name: 'euName', email: 'euEmail' });
      UI.showAlert('editUserAlert', err.message);
    }
  });
}

// ---------------- reset password ----------------
function openResetPassword(id) {
  const u = allUsers.find((x) => x._id === id);
  if (!u) return;
  document.getElementById('rpId').value = id;
  document.getElementById('rpName').textContent = u.name;
  document.getElementById('resetPwdForm').reset();
  Validate.clear(document.getElementById('resetPwdForm'));
  UI.clearAlert('resetPwdAlert');
  resetModal.show();
}
async function saveResetPassword() {
  UI.clearAlert('resetPwdAlert');
  const { ok } = Validate.run(resetSchema());
  if (!ok) return;
  await withButton(document.getElementById('rpSave'), 'Saving...', async () => {
    try {
      const res = await Api.put(`/admin/users/${document.getElementById('rpId').value}/password`, { newPassword: document.getElementById('rpPassword').value });
      resetModal.hide();
      UI.showAlert('alertBox', res.message, 'success');
    } catch (err) {
      Validate.showServerErrors(err.errors, { newPassword: 'rpPassword' });
      UI.showAlert('resetPwdAlert', err.message);
    }
  });
}

// ---------------- delete ----------------
function openDeleteUser(id) {
  const u = allUsers.find((x) => x._id === id);
  if (!u) return;
  pendingDelete = u;
  const effects = {
    student: 'Their profile, resume file, all applications and notifications will be deleted.',
    company: 'The company profile, ALL its drives, every application to those drives and related notifications will be deleted. Students placed through this company lose that placement.',
    tpo: 'The account and its notifications will be deleted. Drives it created are kept.',
    admin: 'The account and its notifications will be deleted.',
  }[u.role];
  document.getElementById('duText').innerHTML = `Permanently delete <strong>${UI.escapeHtml(u.name)}</strong> (${UI.escapeHtml(u.email)}, ${u.role})? This cannot be undone.`;
  document.getElementById('duEffects').textContent = effects;
  document.getElementById('duConfirm').value = '';
  Validate.clear(document.getElementById('deleteUserModal'));
  UI.clearAlert('deleteUserAlert');
  deleteModal.show();
}
async function confirmDeleteUser() {
  UI.clearAlert('deleteUserAlert');
  if (document.getElementById('duConfirm').value.trim() !== 'DELETE') {
    Validate.setError(document.getElementById('duConfirm'), 'Type DELETE to confirm');
    return;
  }
  await withButton(document.getElementById('duBtn'), 'Deleting...', async () => {
    try {
      await Api.delete(`/admin/users/${pendingDelete._id}`);
      deleteModal.hide();
      UI.showAlert('alertBox', `User "${pendingDelete.name}" has been deleted.`, 'success');
      await loadUsers();
    } catch (err) {
      UI.showAlert('deleteUserAlert', err.message);
    }
  });
}

// ---------------- create ----------------
function toggleCompanyFields() {
  const isCompany = document.getElementById('nuRole').value === 'company';
  document.getElementById('companyFields').classList.toggle('d-none', !isCompany);
}

async function createUser() {
  UI.clearAlert('newUserAlert');
  const { ok, values } = Validate.run(newUserSchema());
  if (!ok) return;
  const payload = { name: values.nuName, email: values.nuEmail, password: document.getElementById('nuPassword').value, role: values.nuRole };
  if (payload.role === 'company') {
    payload.companyName = values.nuCompanyName;
    if (values.nuIndustry) payload.industry = values.nuIndustry;
  }
  await withButton(document.getElementById('createUserBtn'), 'Creating...', async () => {
    try {
      await Api.post('/admin/users', payload);
      newUserModal.hide();
      document.getElementById('newUserForm').reset();
      Validate.clear(document.getElementById('newUserForm'));
      document.getElementById('companyFields').classList.add('d-none');
      UI.showAlert('alertBox', 'Account created successfully.', 'success');
      await loadUsers();
    } catch (err) {
      Validate.showServerErrors(err.errors, { name: 'nuName', email: 'nuEmail', password: 'nuPassword', role: 'nuRole', companyName: 'nuCompanyName', industry: 'nuIndustry' });
      UI.showAlert('newUserAlert', err.message);
    }
  });
}

/** Activate / deactivate all student accounts of one graduation year (e.g. after a batch has passed out). */
async function bulkBatchStatus(isActive) {
  const year = prompt(`Enter the batch (graduation year) whose student accounts should be ${isActive ? 'ACTIVATED' : 'DEACTIVATED'}:`, String(new Date().getFullYear() - (isActive ? 0 : 1)));
  if (year === null) return;
  const batch = Number(year);
  if (!Number.isInteger(batch) || batch < 2000 || batch > new Date().getFullYear() + 6) {
    UI.showAlert('alertBox', 'Please enter a valid 4-digit year.');
    return;
  }
  if (!confirm(`${isActive ? 'Activate' : 'Deactivate'} ALL student accounts of batch ${batch}?`)) return;
  try {
    const res = await Api.put('/admin/users/bulk-status', { batch, isActive });
    UI.showAlert('alertBox', res.message, 'success');
    await loadUsers();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
}
