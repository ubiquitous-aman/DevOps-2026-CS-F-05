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

  const schema = {
    companyName: V.text({ label: 'Company name', required: true, min: 2, max: 100 }),
    industry: V.text({ label: 'Industry', max: 60 }),
    website: V.url({ label: 'Website' }),
    description: V.text({ label: 'Description', max: 1000 }),
    hrName: V.name({ label: 'HR contact name', required: false }),
    hrPhone: V.phone({ label: 'HR phone' }),
    hrEmail: V.email({ label: 'HR email', required: false }),
  };
  Validate.live(schema);

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.clearAlert('alertBox');
    const { ok, values: v } = Validate.run(schema);
    if (!ok) return;
    const payload = {
      companyName: v.companyName, industry: v.industry, website: v.website, description: v.description,
      hrContact: { name: v.hrName || undefined, phone: v.hrPhone || undefined, email: v.hrEmail || undefined },
    };
    try {
      await Api.put('/company/profile', payload);
      UI.showAlert('alertBox', 'Profile updated successfully.', 'success');
    } catch (err) {
      Validate.showServerErrors(err.errors, { 'hrContact.name': 'hrName', 'hrContact.phone': 'hrPhone', 'hrContact.email': 'hrEmail' });
      UI.showAlert('alertBox', err.message);
    }
  });
});
