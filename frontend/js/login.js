/**
 * login.js — handles the login form: validation, event handling, AJAX call, redirect.
 */
document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, skip straight to the dashboard.
  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();
    if (user) window.location.href = Auth.dashboardFor(user.role);
  }

  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  const spinner = document.getElementById('loginSpinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');

    if (!form.checkValidity()) {
      e.stopPropagation();
      form.classList.add('was-validated');
      return;
    }

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    btn.disabled = true;
    btnText.textContent = 'Signing in...';
    spinner.classList.remove('d-none');

    try {
      const data = await Api.post('/auth/login', { email, password });
      Auth.saveSession(data.token, data.user);
      window.location.href = Auth.dashboardFor(data.user.role);
    } catch (err) {
      UI.showAlert('alertBox', err.message || 'Login failed');
      btn.disabled = false;
      btnText.textContent = 'Sign In';
      spinner.classList.add('d-none');
    }
  });
});
