const nodemailer = require('nodemailer');

/**
 * sendEmail — sends via SMTP if EMAIL_USER/EMAIL_PASS are configured in .env.
 * If not configured, falls back to logging the email to the server console
 * so the whole OTP flow still works out-of-the-box in local development
 * and in Jenkins/CI without any real mailbox.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  // Never attempt a real SMTP send during the automated test suite — keeps
  // CI deterministic and offline-safe even if a developer's own .env has
  // real credentials configured.
  const configured = process.env.NODE_ENV !== 'test' && process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (!configured) {
    console.log('\n========== [DEV EMAIL — SMTP NOT CONFIGURED] ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html?.replace(/<[^>]+>/g, ' '));
    console.log('=========================================================\n');
    return { devMode: true };
  }

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
