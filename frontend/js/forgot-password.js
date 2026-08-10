/**
 * forgot-password.js — 3-step wizard: email -> OTP -> new password.
 * Demonstrates step-based DOM manipulation (swapping form visibility)
 * plus sequential AJAX calls tied together by a short-lived reset token.
 */
let userEmail = '';
let resetToken = '';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('emailForm').addEventListener('submit', handleSendOtp);
  document.getElementById('otpForm').addEventListener('submit', handleVerifyOtp);
  document.getElementById('resetForm').addEventListener('submit', handleResetPassword);
  document.getElementById('resendBtn').addEventListener('click', () => handleSendOtp(null, true));

  const newPassEl = document.getElementById('newPassword');
  const confPassEl = document.getElementById('confirmPassword');
  if (newPassEl) newPassEl.addEventListener('input', () => { checkPasswordRules(); checkPasswordMatch(); });
  if (confPassEl) confPassEl.addEventListener('input', checkPasswordMatch);
});

function checkPasswordRules() {
  const val = document.getElementById('newPassword')?.value || '';
  const rules = {
    ruleLen: val.length >= 8,
    ruleUpper: /[A-Z]/.test(val),
    ruleLower: /[a-z]/.test(val),
    ruleNum: /[0-9]/.test(val),
    ruleSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val),
  };

  for (const [id, ok] of Object.entries(rules)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (ok) {
      el.className = 'col-6 text-success fw-semibold';
      if (id === 'ruleSpecial') el.className = 'col-12 text-success fw-semibold';
      el.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>${el.textContent.replace(/^[✓•\s]*|.*(?=8\+|Upper|Lower|Num|Special)/, '')}`;
    } else {
      el.className = 'col-6 text-muted';
      if (id === 'ruleSpecial') el.className = 'col-12 text-muted';
      el.innerHTML = `<i class="bi bi-circle me-1"></i>${el.textContent.replace(/^[✓•\s]*|.*(?=8\+|Upper|Lower|Num|Special)/, '')}`;
    }
  }

  // Restore readable text if needed
  if (document.getElementById('ruleLen')) document.getElementById('ruleLen').innerHTML = `<i class="bi ${rules.ruleLen ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>8+ characters`;
  if (document.getElementById('ruleUpper')) document.getElementById('ruleUpper').innerHTML = `<i class="bi ${rules.ruleUpper ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Uppercase (A-Z)`;
  if (document.getElementById('ruleLower')) document.getElementById('ruleLower').innerHTML = `<i class="bi ${rules.ruleLower ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Lowercase (a-z)`;
  if (document.getElementById('ruleNum')) document.getElementById('ruleNum').innerHTML = `<i class="bi ${rules.ruleNum ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Number (0-9)`;
  if (document.getElementById('ruleSpecial')) document.getElementById('ruleSpecial').innerHTML = `<i class="bi ${rules.ruleSpecial ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Special character (!@#$%^&*)`;

  return Object.values(rules).every(Boolean);
}

function checkPasswordMatch() {
  const pass = document.getElementById('newPassword')?.value || '';
  const confirm = document.getElementById('confirmPassword')?.value || '';
  const fb = document.getElementById('matchFeedback');
  if (!fb) return;
  if (!confirm) { fb.textContent = ''; return; }
  if (pass === confirm) {
    fb.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Passwords match</span>';
  } else {
    fb.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Passwords do not match</span>';
  }
}

function goToStep(step) {
  document.getElementById('emailForm').classList.toggle('d-none', step !== 1);
  document.getElementById('otpForm').classList.toggle('d-none', step !== 2);
  document.getElementById('resetForm').classList.toggle('d-none', step !== 3);
  document.getElementById('doneState').classList.toggle('d-none', step !== 4);
  document.getElementById('stepIndicator').classList.toggle('d-none', step === 4);

  ['dot1', 'dot2', 'dot3'].forEach((id, idx) => {
    document.getElementById(id).className = `badge rounded-pill ${idx + 1 <= step ? 'bg-primary' : 'bg-secondary'}`;
  });

  const subtitles = {
    1: 'Enter your account email to receive a verification code',
    2: 'Enter the 6-digit code sent to your email',
    3: 'Choose a new password for your account',
  };
  if (subtitles[step]) document.getElementById('stepSubtitle').textContent = subtitles[step];
}

async function handleSendOtp(e, isResend = false) {
  if (e) e.preventDefault();
  UI.clearAlert('alertBox');

  const email = isResend ? userEmail : document.getElementById('email').value.trim();
  if (!email) return;

  const btn = document.getElementById('sendOtpBtn');
  const btnText = document.getElementById('sendOtpBtnText');
  const spinner = document.getElementById('sendOtpSpinner');
  btn.disabled = true;
  btnText.textContent = 'Sending...';
  spinner.classList.remove('d-none');

  try {
    await Api.post('/auth/forgot-password', { email });
    userEmail = email;
    document.getElementById('otpEmailDisplay').textContent = email;
    document.getElementById('otp').value = '';
    UI.showAlert('alertBox', isResend ? 'A new code has been sent.' : 'Verification code sent — check your inbox.', 'success');
    goToStep(2);
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Send Verification Code';
    spinner.classList.add('d-none');
  }
}

async function handleVerifyOtp(e) {
  e.preventDefault();
  UI.clearAlert('alertBox');

  const otp = document.getElementById('otp').value.trim();
  const btn = document.getElementById('verifyOtpBtn');
  const btnText = document.getElementById('verifyOtpBtnText');
  const spinner = document.getElementById('verifyOtpSpinner');
  btn.disabled = true;
  btnText.textContent = 'Verifying...';
  spinner.classList.remove('d-none');

  try {
    const data = await Api.post('/auth/verify-otp', { email: userEmail, otp });
    resetToken = data.resetToken;
    goToStep(3);
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Verify Code';
    spinner.classList.add('d-none');
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  UI.clearAlert('alertBox');

  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!checkPasswordRules()) {
    UI.showAlert('alertBox', 'Password does not meet all complexity requirements.');
    return;
  }

  if (newPassword !== confirmPassword) {
    UI.showAlert('alertBox', 'Passwords do not match.');
    return;
  }

  const btn = document.getElementById('resetBtn');
  const btnText = document.getElementById('resetBtnText');
  const spinner = document.getElementById('resetSpinner');
  btn.disabled = true;
  btnText.textContent = 'Resetting...';
  spinner.classList.remove('d-none');

  try {
    await Api.post('/auth/reset-password', { resetToken, newPassword });
    goToStep(4);
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Reset Password';
    spinner.classList.add('d-none');
  }
}
