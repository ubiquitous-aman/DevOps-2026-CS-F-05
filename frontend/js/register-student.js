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
      rollNumber: document.getElementById('rollNumber').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      branch: document.getElementById('branch').value,
      batch: Number(document.getElementById('batch').value),
      // No password — that is collected after OTP verification
    };

    btn.disabled = true;
    btnText.textContent = 'Sending code...';
    spinner.classList.remove('d-none');

    try {
      await Api.post('/auth/register/student/initiate', payload);

      // Store registration data in sessionStorage for the verify/resend pages
      sessionStorage.setItem('reg_email', payload.email);
      sessionStorage.setItem('reg_name', payload.name);
      sessionStorage.setItem('reg_roll', payload.rollNumber);
      sessionStorage.setItem('reg_branch', payload.branch);
      sessionStorage.setItem('reg_batch', payload.batch);

      window.location.href = '/verify-email.html';
    } catch (err) {
      UI.showAlert('alertBox', err.message || 'Registration failed. Please try again.');
      btn.disabled = false;
      btnText.textContent = 'Send Verification Code';
      spinner.classList.add('d-none');
    }
  });
});
