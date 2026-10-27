const nodemailer = require('nodemailer');
const brevo = require('@getbrevo/brevo');

const sendEmail = async ({ to, subject, html, text }) => {
  // 1. If running on Render, use Brevo API (bypasses blocked SMTP ports)
  if (process.env.RENDER && process.env.BREVO_API_KEY) {
    let apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

    let sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
    sendSmtpEmail.sender = { name: "Placement Portal", email: "soulmortal8090@gmail.com" };
    sendSmtpEmail.to = [{ email: to }];

    try {
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[EMAIL SENT] Successfully sent to ${to} via Brevo`);
      return { devMode: false };
    } catch (error) {
      console.error('[EMAIL ERROR] Brevo failed:', error);
      throw new Error('Failed to send email.');
    }
  }

  // 2. If not configured (e.g., local dev), log to console
  const configured = process.env.NODE_ENV !== 'test' && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (!configured) {
    console.log('\n========== [DEV EMAIL] ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html?.replace(/<[^>]+>/g, ' '));
    console.log('=================================\n');
    return { devMode: true };
  }

  // 3. Otherwise, send via SMTP (for local Docker)
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: Number(process.env.EMAIL_PORT) !== 587,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
    text,
  });

  return { devMode: false };
};

module.exports = sendEmail;
