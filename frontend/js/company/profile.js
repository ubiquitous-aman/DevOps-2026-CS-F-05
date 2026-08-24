document.addEventListener('DOMContentLoaded', async () => {
  const user = Layout.render({ role: 'company', active: 'profile', title: 'Company Profile' });
  if (!user) return;

  try {
    const { company } = await Api.get('/company/profile');
    document.getElementById('companyName').value = company.companyName;
    document.getElementById('industry').value = company.industry || '';
    document.getElementById('website').value = company.website || '';
    document.getElementById('approvalStatus').value = company.approvalStatus;
    document.getElementById('description').value = company.description || '';
    document.getElementById('hrName').value = company.hrContact?.name || '';
    document.getElementById('hrPhone').value = company.hrContact?.phone || '';
    document.getElementById('hrEmail').value = company.hrContact?.email || '';
  } catch (err) {
    UI.showAlert('alertBox', err.message);
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      companyName: document.getElementById('companyName').value.trim(),
      industry: document.getElementById('industry').value.trim(),
      website: document.getElementById('website').value.trim(),
      description: document.getElementById('description').value.trim(),
      hrContact: {
        name: document.getElementById('hrName').value.trim(),
        phone: document.getElementById('hrPhone').value.trim(),
        email: document.getElementById('hrEmail').value.trim(),
      },
    };
    try {
      await Api.put('/company/profile', payload);
      UI.showAlert('alertBox', 'Profile updated successfully.', 'success');
    } catch (err) {
      UI.showAlert('alertBox', err.message);
    }
  });
});
