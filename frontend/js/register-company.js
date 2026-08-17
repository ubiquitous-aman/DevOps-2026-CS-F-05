document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('regForm');
  const btn = document.getElementById('regBtn');
  const btnText = document.getElementById('regBtnText');
  const spinner = document.getElementById('regSpinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const payload = {
      name: document.getElementById('name').value.trim(),
      companyName: document.getElementById('companyName').value.trim(),
      email: document.getElementById('email').value.trim(),
      hrPhone: document.getElementById('hrPhone').value.trim(),
      industry: document.getElementById('industry').value.trim(),
      website: document.getElementById('website').value.trim(),
      description: document.getElementById('description').value.trim(),
      password: document.getElementById('password').value,
    };

    btn.disabled = true;
    btnText.textContent = 'Creating account...';
    spinner.classList.remove('d-none');

    try {
      const data = await Api.post('/auth/register/company', payload);
      Auth.saveSession(data.token, data.user);
      window.location.href = '/company/dashboard.html';
    } catch (err) {
      UI.showAlert('alertBox', err.message || 'Registration failed');
      btn.disabled = false;
      btnText.textContent = 'Create Company Account';
      spinner.classList.add('d-none');
    }
  });
});
