let currentApp = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'feedback', title: 'Recruitment Feedback' });
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const appId = params.get('appId');

  if (!appId) {
    document.getElementById('noAppSelected').classList.remove('d-none');
    return;
  }

  try {
    const { application } = await Api.get(`/company/applications/${appId}`);
    currentApp = application;
    renderApplication();
    document.getElementById('feedbackContent').classList.remove('d-none');
  } catch (err) {
    UI.showAlert('alertBox', err.message);
    document.getElementById('noAppSelected').classList.remove('d-none');
  }

  document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('feedbackText').value.trim();
    try {
      await Api.put(`/company/applications/${appId}/feedback`, { feedback });
      UI.showAlert('alertBox', 'Feedback saved.', 'success');
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  });
});

function renderApplication() {
  const app = currentApp;
  const student = app.student;

  document.getElementById('candidateName').textContent = student.user.name;
  document.getElementById('candidateMeta').textContent = `${student.rollNumber} · ${student.branch} · ${app.drive.jobTitle}`;
  document.getElementById('candidateStatus').className = UI.badgeClass(app.status);
  document.getElementById('candidateStatus').textContent = app.status;

  document.getElementById('stageTimeline').innerHTML = app.roundResults
    .map((r, idx) => {
      let cls = '';
      if (r.status === 'Cleared') cls = 'cleared';
      else if (r.status === 'Rejected') cls = 'rejected';
      else if (idx === app.currentRoundIndex) cls = 'current';
      return `<div class="stage-step ${cls}">${r.roundName}<div class="small fw-normal">${r.status}</div></div>`;
    })
    .join('<div class="px-1"><i class="bi bi-chevron-right text-muted"></i></div>');

  const currentRound = app.roundResults[app.currentRoundIndex];
  document.getElementById('feedbackText').value = currentRound?.feedback || '';
}
