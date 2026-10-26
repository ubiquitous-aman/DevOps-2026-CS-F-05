/**
 * register-student.js ? 2-step student sign-up with email OTP verification.
 */
document.addEventListener('DOMContentLoaded', () => {
  const thisYear = new Date().getFullYear();
  const schema = {
    name: V.name({ label: 'Full name' }),
    rollNumber: V.rollNumber(),
    email: V.email(),
    phone: V.phone({ required: true, label: 'Mobile number' }),
    branch: V.select({ label: 'a branch', allowed: BRANCHES }),
    batch: V.int({ label: 'Batch', required: true, min: 2000, max: thisYear + 6 }),
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
        const data = await Api.post('/auth/register/student', {
          name: values.name,
          rollNumber: values.rollNumber,
          email: values.email,
          phone: values.phone,
          branch: values.branch,
          batch: Number(values.batch),
          password: document.getElementById('password').value,
          confirmPassword: document.getElementById('confirmPassword').value,
        });
        
        // Hide the registration form, show the OTP form
        form.classList.add('d-none');
        document.getElementById('verifyOtpForm').classList.remove('d-none');
        document.getElementById('otpEmailDisplay').textContent = values.email;
        
        // Save the token temporarily in case we need it
        window.tempRegToken = data.token;
        
      } catch (err) {
        if (!Validate.showServerErrors(err.errors)) UI.showAlert('alertBox', err.message || 'Registration failed. Please try again.');
        else UI.showAlert('alertBox', err.message);
      }
    });
  });

  // Handle OTP Verification
  const otpForm = document.getElementById('verifyOtpForm');
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      UI.clearAlert('alertBox');
      const otp = document.getElementById('otp').value;
      const email = document.getElementById('otpEmailDisplay').textContent;

      const otpBtn = document.getElementById('verifyOtpBtn');
      await withButton(otpBtn, '<span class="spinner-border spinner-border-sm me-2"></span>Verifying...', async () => {
        try {
          const data = await Api.post('/auth/register/verify-email', { email, otp });
          
          if (data.token) {
            Auth.saveSession(data.token, data.user);
            window.location.href = '/student/profile.html?welcome=1';
          } else {
            // Fallback if backend only returns success but no token
            Auth.saveSession(window.tempRegToken, data.user || { email });
            window.location.href = '/student/profile.html?welcome=1';
          }
        } catch (err) {
          UI.showAlert('alertBox', err.message || 'Invalid OTP.');
        }
      });
    });
  }
});
