document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'profile', title: 'My Profile' });
  if (!user) return;

  const form = document.getElementById('profileForm');

  async function loadProfile() {
    try {
      const { student } = await Api.get('/student/profile');
      document.getElementById('rollNumber').value = student.rollNumber;
      document.getElementById('branch').value = student.branch;
      document.getElementById('batch').value = student.batch;
      document.getElementById('phone').value = student.phone || '';
      document.getElementById('tenthPercentage').value = student.academics?.tenthPercentage ?? '';
      document.getElementById('twelfthPercentage').value = student.academics?.twelfthPercentage ?? '';
      document.getElementById('cgpa').value = student.academics?.cgpa ?? '';
      document.getElementById('activeBacklogs').value = student.academics?.activeBacklogs ?? 0;
      document.getElementById('skills').value = (student.skills || []).join(', ');
      document.getElementById('acctName').textContent = student.user.name;
      document.getElementById('acctEmail').textContent = student.user.email;

      if (student.resume?.fileName) {
        document.getElementById('currentResume').innerHTML =
          `Current: <a href="${student.resume.filePath}" target="_blank">${UI.escapeHtml(student.resume.fileName)}</a> (uploaded ${UI.formatDate(student.resume.uploadedAt)})`;
      }
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;

    const payload = {
      branch: document.getElementById('branch').value,
      batch: Number(document.getElementById('batch').value),
      phone: document.getElementById('phone').value,
      academics: {
        tenthPercentage: Number(document.getElementById('tenthPercentage').value) || 0,
        twelfthPercentage: Number(document.getElementById('twelfthPercentage').value) || 0,
        cgpa: Number(document.getElementById('cgpa').value) || 0,
        activeBacklogs: Number(document.getElementById('activeBacklogs').value) || 0,
      },
      skills: document.getElementById('skills').value.split(',').map((s) => s.trim()).filter(Boolean),
    };

    try {
      await Api.put('/student/profile', payload);
      UI.showAlert('alertBox', 'Profile updated successfully.', 'success');
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('resumeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const fileInput = document.getElementById('resumeFile');
    if (!fileInput.files.length) return;

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';

    const fd = new FormData();
    fd.append('resume', fileInput.files[0]);

    try {
      await Api.post('/student/resume', fd, true);
      UI.showAlert('alertBox', 'Resume uploaded successfully.', 'success');
      await loadProfile();
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Upload Resume';
    }
  });

  await loadProfile();
});
