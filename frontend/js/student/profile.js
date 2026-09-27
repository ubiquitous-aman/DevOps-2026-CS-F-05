document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('branch').innerHTML = BRANCHES.map((b) => `<option>${b}</option>`).join('');
  const user = Layout.render({ role: 'student', active: 'profile', title: 'My Profile' });
  if (!user) return;

  const thisYear = new Date().getFullYear();
  const schema = {
    branch: V.select({ label: 'a branch', allowed: BRANCHES }),
    batch: V.int({ label: 'Batch', required: true, min: 2000, max: thisYear + 6 }),
    phone: V.phone({ required: true, label: 'Mobile number' }),
    tenthPercentage: V.number({ label: '10th percentage', min: 0, max: 100, decimals: 2 }),
    twelfthPercentage: V.number({ label: '12th / Diploma / Equivalent percentage', min: 0, max: 100, decimals: 2 }),
    cgpa: V.number({ label: 'CGPA', min: 0, max: 10, decimals: 2 }),
    activeBacklogs: V.int({ label: 'Active backlogs', min: 0, max: 50 }),
    skills: (v) => {
      const items = Validate.list(v);
      if (items.length > 30) return 'At most 30 skills';
      return items.find((s) => s.length > 30) ? 'Each skill must be at most 30 characters' : '';
    },
    github: V.url({ label: 'GitHub link' }),
    linkedin: V.url({ label: 'LinkedIn link' }),
    portfolio: V.url({ label: 'Portfolio link' }),
  };
  Validate.live(schema);
  const resumeRule = { resumeFile: V.file({ allowed: ['.pdf', '.doc', '.docx'], maxMB: 5 }) };
  Validate.live(resumeRule);

  if (new URLSearchParams(location.search).get('welcome')) {
    UI.showAlert('alertBox', 'Welcome! Complete your academic details and upload your resume so you can apply to drives.', 'info');
  }

  async function loadProfile() {
    try {
      const { student } = await Api.get('/student/profile');
      const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
      set('rollNumber', student.rollNumber);
      set('branch', student.branch);
      set('batch', student.batch);
      set('phone', student.phone);
      set('tenthPercentage', student.academics?.tenthPercentage);
      set('twelfthPercentage', student.academics?.twelfthPercentage);
      set('cgpa', student.academics?.cgpa);
      set('activeBacklogs', student.academics?.activeBacklogs ?? 0);
      set('skills', (student.skills || []).join(', '));
      set('github', student.links?.github);
      set('linkedin', student.links?.linkedin);
      set('portfolio', student.links?.portfolio);
      document.getElementById('acctName').textContent = student.user.name;
      document.getElementById('acctEmail').textContent = student.user.email;

      if (student.resume?.fileName) {
        document.getElementById('currentResume').innerHTML =
          `Current: <a href="#" onclick="openResumeFor('${student._id}'); return false;">${UI.escapeHtml(student.resume.fileName)}</a> (uploaded ${UI.formatDate(student.resume.uploadedAt)})`;
      }
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const { ok, values } = Validate.run(schema);
    if (!ok) return;

    const num = (v) => (v === '' || v === undefined ? undefined : Number(v));
    const payload = {
      branch: values.branch,
      batch: Number(values.batch),
      phone: values.phone,
      academics: {
        tenthPercentage: num(values.tenthPercentage),
        twelfthPercentage: num(values.twelfthPercentage),
        cgpa: num(values.cgpa),
        activeBacklogs: num(values.activeBacklogs) ?? 0,
      },
      links: { github: values.github, linkedin: values.linkedin, portfolio: values.portfolio },
      skills: Validate.list(values.skills),
    };
    await withButton(document.getElementById('saveBtn'), '<span class="spinner-border spinner-border-sm me-1"></span>Saving...', async () => {
      try {
        await Api.put('/student/profile', payload);
        UI.showAlert('alertBox', 'Profile updated successfully.', 'success');
      } catch (err) {
        Validate.showServerErrors(err.errors, { 'academics.cgpa': 'cgpa', 'academics.tenthPercentage': 'tenthPercentage', 'academics.twelfthPercentage': 'twelfthPercentage', 'academics.activeBacklogs': 'activeBacklogs' });
        UI.showAlert('alertBox', err.message);
      }
    });
  });

  document.getElementById('resumeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const { ok } = Validate.run(resumeRule);
    if (!ok) return;
    const fd = new FormData();
    fd.append('resume', document.getElementById('resumeFile').files[0]);
    await withButton(document.getElementById('uploadBtn'), '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...', async () => {
      try {
        await Api.post('/student/resume', fd, true);
        UI.showAlert('alertBox', 'Resume uploaded successfully.', 'success');
        document.getElementById('resumeFile').value = '';
        Validate.clear(document.getElementById('resumeForm'));
        await loadProfile();
      } catch (err) {
        UI.showAlert('alertBox', err.message);
      }
    });
  });

  await loadProfile();
});
