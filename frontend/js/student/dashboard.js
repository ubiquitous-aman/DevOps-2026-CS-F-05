document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'student', active: 'dashboard', title: 'Dashboard' });
  if (!user) return;

  try {
    const [profileRes, drivesRes, notifRes] = await Promise.all([
      Api.get('/student/profile'),
      Api.get('/student/drives'),
      Api.get('/student/notifications'),
    ]);

    const student = profileRes.student;
    const drives = drivesRes.drives;
    const eligibleOpen = drives.filter((d) => d.eligible && !d.applicationStatus);
    const applied = drives.filter((d) => d.applicationStatus);
    const notifs = notifRes.notifications;
    const unread = notifs.filter((n) => !n.isRead).length;

    // ---- Stat cards ----
    const cards = [
      { label: 'Eligible Open Drives', value: eligibleOpen.length, icon: 'bi-briefcase', color: '#1e3a8a' },
      { label: 'Applications Sent', value: applied.length, icon: 'bi-send', color: '#0891b2' },
      { label: 'Placement Status', value: student.isPlaced ? 'Placed' : 'Not Placed', icon: 'bi-trophy', color: student.isPlaced ? '#16a34a' : '#d97706' },
      { label: 'Unread Notifications', value: unread, icon: 'bi-bell', color: '#f59e0b' },
    ];
    document.getElementById('statCards').innerHTML = cards
      .map(
        (c) => `
        <div class="col-sm-6 col-xl-3">
          <div class="card stat-card">
            <div class="card-body d-flex align-items-center gap-3">
              <div class="stat-icon" style="background:${c.color}"><i class="bi ${c.icon}"></i></div>
              <div>
                <div class="stat-value">${c.value}</div>
                <div class="text-muted small">${c.label}</div>
              </div>
            </div>
          </div>
        </div>`
      )
      .join('');

    // ---- Recent eligible drives ----
    const recentDrivesEl = document.getElementById('recentDrives');
    if (eligibleOpen.length === 0) {
      recentDrivesEl.innerHTML = UI.empty('No new eligible drives right now. Check back soon!');
    } else {
      recentDrivesEl.innerHTML = eligibleOpen
        .slice(0, 4)
        .map(
          (d) => `
          <div class="d-flex justify-content-between align-items-center border-bottom py-2">
            <div>
              <div class="fw-semibold">${UI.escapeHtml(d.jobTitle)}</div>
              <div class="text-muted small">${UI.escapeHtml(d.company.companyName)} · ₹${d.packageLPA} LPA</div>
            </div>
            <a href="drives.html" class="btn btn-sm btn-outline-primary">View</a>
          </div>`
        )
        .join('');
    }

    // ---- Recent notifications ----
    const notifEl = document.getElementById('recentNotifs');
    if (notifs.length === 0) {
      notifEl.innerHTML = UI.empty('No notifications yet.');
    } else {
      notifEl.innerHTML = notifs
        .slice(0, 5)
        .map(
          (n) => `
          <div class="notif-item ${n.isRead ? '' : 'unread'}">
            <div class="fw-semibold small">${UI.escapeHtml(n.title)}</div>
            <div class="text-muted small">${UI.escapeHtml(n.message)}</div>
            <div class="text-muted" style="font-size:0.72rem;">${UI.formatDateTime(n.createdAt)}</div>
          </div>`
        )
        .join('');
    }
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }
});
