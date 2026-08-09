/**
 * set-password.js — Password setup page for student registration (Step 3 of 3).
 *
 * Reads reg_setupToken from sessionStorage (set by verify-email.js in Step 2).
 * On success, saves the JWT session and redirects to the student dashboard.
 * Clears all reg_* sessionStorage keys once done.
 */

document.addEventListener('DOMContentLoaded', () => {
  const setupToken = sessionStorage.getItem('reg_setupToken');

  // Guard: if no setup token, redirect back to registration
  if (!setupToken) {
    window.location.href = '/register-student.html';
    return;
  }

  // Password visibility toggles
  setupToggle('togglePass', 'password', 'togglePassIcon');
  setupToggle('toggleConfirm', 'confirmPassword', 'toggleConfirmIcon');

  // Real-time confirm-password match & complexity feedback
  document.getElementById('confirmPassword').addEventListener('input', checkMatch);
  document.getElementById('password').addEventListener('input', () => { checkPasswordRules(); checkMatch(); });

  document.getElementById('setPasswordForm').addEventListener('submit', handleSubmit);
});

function checkPasswordRules() {
  const val = document.getElementById('password')?.value || '';
  const rules = {
    ruleLen: val.length >= 8,
    ruleUpper: /[A-Z]/.test(val),
    ruleLower: /[a-z]/.test(val),
    ruleNum: /[0-9]/.test(val),
    ruleSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val),
  };

  if (document.getElementById('ruleLen')) document.getElementById('ruleLen').innerHTML = `<i class="bi ${rules.ruleLen ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>8+ characters`;
  if (document.getElementById('ruleUpper')) document.getElementById('ruleUpper').innerHTML = `<i class="bi ${rules.ruleUpper ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Uppercase (A-Z)`;
  if (document.getElementById('ruleLower')) document.getElementById('ruleLower').innerHTML = `<i class="bi ${rules.ruleLower ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Lowercase (a-z)`;
  if (document.getElementById('ruleNum')) document.getElementById('ruleNum').innerHTML = `<i class="bi ${rules.ruleNum ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Number (0-9)`;
  if (document.getElementById('ruleSpecial')) document.getElementById('ruleSpecial').innerHTML = `<i class="bi ${rules.ruleSpecial ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} me-1"></i>Special character (!@#$%^&*)`;

  return Object.values(rules).every(Boolean);
}

function setupToggle(btnId, inputId, iconId) {
  document.getElementById(btnId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
  });
}

function checkMatch() {
  const pass = document.getElementById('password').value;
  const confirm = document.getElementById('confirmPassword').value;
  const fb = document.getElementById('matchFeedback');
  if (!fb) return;
  if (!confirm) { fb.textContent = ''; return; }
  if (pass === confirm) {
    fb.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Passwords match</span>';
  } else {
    fb.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Passwords do not match</span>';
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  UI.clearAlert('alertBox');

  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const setupToken = sessionStorage.getItem('reg_setupToken');

  if (!checkPasswordRules()) {
    UI.showAlert('alertBox', 'Password does not meet all complexity requirements.');
    return;
  }
  if (password !== confirmPassword) {
    UI.showAlert('alertBox', 'Passwords do not match.');
    return;
  }

  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('submitBtnText');
  const spinner = document.getElementById('submitSpinner');
  btn.disabled = true;
  btnText.textContent = 'Creating account...';
  spinner.classList.remove('d-none');

  try {
    const data = await Api.post('/auth/register/set-password', { setupToken, password });

    // Save session exactly like a normal login
    Auth.saveSession(data.token, data.user);

    // Clean up all temporary registration keys
    ['reg_email', 'reg_name', 'reg_roll', 'reg_branch', 'reg_batch', 'reg_setupToken']
      .forEach(k => sessionStorage.removeItem(k));

    // Go straight to the student dashboard
    window.location.href = '/student/dashboard.html';
  } catch (err) {
    UI.showAlert('alertBox', err.message || 'Something went wrong. Please try again.');
    btn.disabled = false;
    btnText.textContent = 'Complete Registration';
    spinner.classList.add('d-none');
  }
}
