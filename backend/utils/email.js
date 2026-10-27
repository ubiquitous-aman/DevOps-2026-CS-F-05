const nodemailer = require('nodemailer');

/**
 * sendEmail ? sends via SMTP if EMAIL_USER/EMAIL_PASS are configured in .env.
 * If running on Render, it logs the email to the console to bypass Gmail SMTP timeout.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  // 1. If running on Render, bypass Gmail and just log to console
  if (process.env.RENDER) {
    console.log('\n========== [RENDER EMAIL MOCK] ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html?.replace(/<[^>]+>/g, ' '));
    console.log('=========================================\n');
    return { devMode: true };
  }

  // 2. If not configured (e.g., local dev), log to console
  const configured = process.env.NODE_ENV !== 'test' && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (!configured) {
    console.log('\n========== [DEV EMAIL ? SMTP NOT CONFIGURED] ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html?.replace(/<[^>]+>/g, ' '));
    console.log('=========================================================\n');
    return { devMode: true };
  }

  // 3. Otherwise, send via SMTP
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
