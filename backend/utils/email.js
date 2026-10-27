const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, text }) => {
  // 1. If running on Render, use Brevo API (bypasses blocked SMTP ports)
  if (process.env.RENDER && process.env.BREVO_API_KEY) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: "Placement Portal", email: "utkarshgupta9549@gmail.com" },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html || `<p>${text}</p>`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[EMAIL ERROR] Brevo API rejected:', errorData);
        throw new Error('Failed to send email via Brevo.');
      }

      console.log(`[EMAIL SENT] Successfully sent to ${to} via Brevo`);
      return { devMode: false };
    } catch (error) {
      console.error('[EMAIL ERROR] Brevo fetch failed:', error.message);
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
