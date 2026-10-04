document.addEventListener('DOMContentLoaded', () => {
  const schema = {
    name: V.name({ label: 'HR contact name' }),
    companyName: V.text({ label: 'Company name', required: true, min: 2, max: 100 }),
    email: V.email({ label: 'Work email' }),
    hrPhone: V.phone({ label: 'HR phone' }),
    industry: V.text({ label: 'Industry', max: 60 }),
    website: V.url({ label: 'Website' }),
    description: V.text({ label: 'Description', max: 1000 }),
    password: V.password(),
    confirmPassword: (v) => (isBlank(v) ? 'Please confirm your password' : v !== Validate.val('password') ? 'Passwords do not match' : ''),
  };
  Validate.live(schema);
  Validate.passwordChecklist('password', 'pwRules');
  Validate.eyeToggle('password');

  const form = document.getElementById('regForm');
  const btn = document.getElementById('regBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const { ok, values } = Validate.run(schema);
    if (!ok) return;

    await withButton(btn, '<span class="spinner-border spinner-border-sm me-2"></span>Creating account...', async () => {
      try {
        const payload = { ...values, password: document.getElementById('password').value, confirmPassword: document.getElementById('confirmPassword').value };
        ['hrPhone', 'industry', 'website', 'description'].forEach((k) => { if (!payload[k]) delete payload[k]; });
        const data = await Api.post('/auth/register/company', payload);
        Auth.saveSession(data.token, data.user);
        window.location.href = '/company/dashboard.html';
      } catch (err) {
        Validate.showServerErrors(err.errors);
        UI.showAlert('alertBox', err.message || 'Registration failed');
      }
    });
  });
});
