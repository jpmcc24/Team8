const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${process.env.BASE_URL}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"AutoTrack" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your AutoTrack email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#1a1a1a;color:#ebe0d0;border-radius:8px;">
        <h2 style="font-size:22px;margin-bottom:8px;">Welcome to AutoTrack 🚗</h2>
        <p style="color:#aaa;margin-bottom:24px;">Click the button below to verify your email address. This link expires in 24 hours.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#c8a96e;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:.05em;">
          VERIFY EMAIL
        </a>
        <p style="margin-top:32px;font-size:12px;color:#666;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };