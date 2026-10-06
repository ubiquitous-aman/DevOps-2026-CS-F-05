/**
 * login.js — login form: validation, AJAX call, redirect.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();
    if (user) window.location.href = Auth.dashboardFor(user.role);
  }

  const schema = {
    email: V.email(),
    password: V.text({ label: 'Password', required: true, max: 200 }),
  };
  Validate.live(schema);
  Validate.eyeToggle('password');

  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const { ok, values } = Validate.run(schema);
    if (!ok) return;

    await withButton(btn, '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...', async () => {
      try {
        const data = await Api.post('/auth/login', {
          email: values.email,
          password: document.getElementById('password').value, // never trimmed
        });
        Auth.saveSession(data.token, data.user);
        window.location.href = Auth.dashboardFor(data.user.role);
      } catch (err) {
        if (!Validate.showServerErrors(err.errors)) UI.showAlert('alertBox', err.message || 'Login failed');
      }
    });
  });
});
