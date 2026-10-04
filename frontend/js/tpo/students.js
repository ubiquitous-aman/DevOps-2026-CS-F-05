let allStudents = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'tpo', active: 'students', title: 'Students' });
  if (!user) return;
  document.getElementById('branchFilter').innerHTML += BRANCHES.map((b) => `<option>${b}</option>`).join('');
  ['search', 'branchFilter', 'placedFilter'].forEach((id) => document.getElementById(id).addEventListener('input', render));
  document.getElementById('exportStudentsBtn').addEventListener('click', () => {
    const p = new URLSearchParams();
    if (document.getElementById('branchFilter').value) p.set('branch', document.getElementById('branchFilter').value);
    if (document.getElementById('placedFilter').value) p.set('placed', document.getElementById('placedFilter').value);
    downloadFile(`/tpo/export/students${p.toString() ? `?${p}` : ''}`, 'students.csv');
  });
  document.getElementById('importStudentsBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importStudents);
  try {
    allStudents = (await Api.get('/tpo/students')).students;
    render();
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});

function render() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const branch = document.getElementById('branchFilter').value;
  const placed = document.getElementById('placedFilter').value;
  const rows = allStudents.filter((s) =>
    (!q || [s.user?.name, s.rollNumber, s.user?.email].some((x) => (x || '').toLowerCase().includes(q))) &&
    (!branch || s.branch === branch) &&
    (!placed || (placed === 'placed') === !!s.isPlaced));
  document.getElementById('studentsTbody').innerHTML = rows.length
    ? rows.map((s) => `<tr>
        <td>${UI.escapeHtml(s.user?.name || '—')}<div class="text-muted small">${UI.escapeHtml(s.user?.email || '')}</div></td>
        <td>${UI.escapeHtml(s.rollNumber)}</td><td>${UI.escapeHtml(s.branch)}</td><td>${s.batch}</td>
        <td>${s.academics?.cgpa ?? '—'}</td><td>${s.academics?.activeBacklogs ?? 0}</td>
        <td>${s.isPlaced ? `<span class="badge bg-success">Placed</span> <span class="small text-muted">${UI.escapeHtml(s.placedCompany || '')}</span>` : '<span class="badge bg-secondary">Not placed</span>'}</td>
        <td><button class="btn btn-sm btn-outline-primary" onclick="StudentView.open('/tpo/students/${s._id}')"><i class="bi bi-eye"></i> View</button></td></tr>`).join('')
    : `<tr><td colspan="8">${UI.empty('No students match.')}</td></tr>`;
}

/** Minimal CSV parser (quotes, commas and line breaks inside quoted cells). */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

async function importStudents(e) {
  const input = e.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) { UI.showAlert('alertBox', 'File is too large (max 1 MB).'); return; }
  const table = parseCsv(await file.text());
  if (table.length < 2) { UI.showAlert('alertBox', 'The file has no student rows.'); return; }
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ''));
  const col = (name) => header.indexOf(name.toLowerCase());
  const need = ['name', 'email', 'rollnumber', 'branch', 'batch'];
  const missing = need.filter((n) => col(n) === -1);
  if (missing.length) { UI.showAlert('alertBox', `Missing column(s): ${missing.join(', ')}. Expected: name, email, phone, rollNumber, branch, batch.`); return; }
  const rows = table.slice(1).map((r) => ({
    name: (r[col('name')] || '').trim(), email: (r[col('email')] || '').trim(),
    phone: col('phone') === -1 ? '' : (r[col('phone')] || '').trim(),
    rollNumber: (r[col('rollnumber')] || '').trim(), branch: (r[col('branch')] || '').trim(),
    batch: (r[col('batch')] || '').trim(),
  }));
  rows.forEach((r) => { if (!r.phone) delete r.phone; });
  if (!confirm(`Create ${rows.length} student account(s) from "${file.name}"?`)) return;
  try {
    const res = await Api.post('/tpo/students/bulk', { rows });
    showImportResult(res);
    await reloadStudents();
  } catch (err) {
    if (err.status === 400 && err.message) UI.showAlert('alertBox', err.message);
    else UI.showAlert('alertBox', err.message);
  }
}

function showImportResult(res) {
  const errs = (res.errors || []).slice(0, 10).map((x) => `<li>Row ${x.line}: ${UI.escapeHtml(x.message)}</li>`).join('');
  UI.showAlert('alertBox', `${UI.escapeHtml(res.message)}. ${res.created ? 'A file with the temporary passwords was downloaded — share them with the students (they must change it on first login).' : ''}${errs ? `<ul class="mb-0 mt-2">${errs}</ul>` : ''}`, res.created ? 'success' : 'warning');
  if (!res.created) return;
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = ['Name,Email,Roll Number,Temporary Password', ...res.credentials.map((c) => [c.name, c.email, c.rollNumber, c.tempPassword].map(q).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'new-student-credentials.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function reloadStudents() {
  allStudents = (await Api.get('/tpo/students')).students;
  render();
}
