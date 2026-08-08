/**
 * verify-email.js — OTP entry page for student registration (Step 2 of 3).
 *
 * Reads reg_email from sessionStorage (set by register-student.js in Step 1).
 * On successful OTP verification, stores setupToken in sessionStorage and
 * redirects to set-password.html (Step 3).
 *
 * Security:
 *  - If sessionStorage has no email, redirect back to registration.
 *  - Resend button is rate-limited by a 60-second cooldown on the frontend
 *    (backend enforces its own OTP expiry and attempt limits).
 */

const RESEND_COOLDOWN_SECONDS = 60;
let resendTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const email = sessionStorage.getItem('reg_email');
  const name  = sessionStorage.getItem('reg_name') || 'there';

  // Guard: if no email in session, user navigated here directly — send back
  if (!email) {
    window.location.href = '/register-student.html';
    return;
  }

  // Populate the email display
  document.getElementById('emailDisplay').textContent = email;

  // Wire up form submit and resend button
  document.getElementById('otpForm').addEventListener('submit', handleVerify);
  document.getElementById('resendBtn').addEventListener('click', handleResend);

  // Start resend cooldown immediately (code was just sent from Step 1)
  startResendCooldown();
});

async function handleVerify(e) {
  e.preventDefault();
  UI.clearAlert('alertBox');

  const otp   = document.getElementById('otp').value.trim();
  const email = sessionStorage.getItem('reg_email');

  if (!otp || otp.length !== 6) {
    UI.showAlert('alertBox', 'Please enter the 6-digit code.');
    return;
  }

  const btn      = document.getElementById('verifyBtn');
  const btnText  = document.getElementById('verifyBtnText');
  const spinner  = document.getElementById('verifySpinner');
  btn.disabled   = true;
  btnText.textContent = 'Verifying...';
  spinner.classList.remove('d-none');

  try {
    const data = await Api.post('/auth/register/verify-email', { email, otp });

    // Store the setup token for Step 3
    sessionStorage.setItem('reg_setupToken', data.setupToken);

    window.location.href = '/set-password.html';
  } catch (err) {
    UI.showAlert('alertBox', err.message || 'Verification failed. Please try again.');
    // Clear the OTP input so the user can type a fresh code
    document.getElementById('otp').value = '';
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Verify & Continue';
    spinner.classList.add('d-none');
  }
}

async function handleResend() {
  UI.clearAlert('alertBox');

  const email = sessionStorage.getItem('reg_email');
  if (!email) return;

  const btn = document.getElementById('resendBtn');
  btn.disabled = true;

  try {
    // Re-use the initiate endpoint — it detects the unverified account and
    // simply generates + sends a fresh OTP without creating a duplicate.
    await Api.post('/auth/register/student/initiate', {
      name:       sessionStorage.getItem('reg_name') || '',
      email,
      // Remaining fields are not re-submitted on resend; the backend already
      // has the student record. Provide minimal placeholders so the endpoint's
      // required-field check passes — it will not overwrite existing data
      // because the user record already exists.
      rollNumber: sessionStorage.getItem('reg_roll')   || '',
      branch:     sessionStorage.getItem('reg_branch') || 'CSE',
      batch:      Number(sessionStorage.getItem('reg_batch')) || new Date().getFullYear() + 1,
    });

    document.getElementById('otp').value = '';
    UI.showAlert('alertBox', 'A new verification code has been sent.', 'success');
    startResendCooldown();
  } catch (err) {
    UI.showAlert('alertBox', err.message || 'Failed to resend code.');
    btn.disabled = false;
  }
}

function startResendCooldown() {
  const btn       = document.getElementById('resendBtn');
  const countdown = document.getElementById('resendCountdown');

  btn.disabled = true;
  let seconds  = RESEND_COOLDOWN_SECONDS;

  const tick = () => {
    countdown.textContent = `(${seconds}s)`;
    if (seconds <= 0) {
      clearInterval(resendTimer);
      btn.disabled        = false;
      countdown.textContent = '';
    }
    seconds--;
  };

  tick(); // run immediately
  clearInterval(resendTimer);
  resendTimer = setInterval(tick, 1000);
}
