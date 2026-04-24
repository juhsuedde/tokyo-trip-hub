'use strict';

const { logger } = require('./logger');

let _smtpTransporter = null;

const getSmtpTransporter = () => {
  if (_smtpTransporter) return _smtpTransporter;
  const nodemailer = require('nodemailer');
  _smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _smtpTransporter;
};

async function sendViaSmtp(payload) {
  const transporter = getSmtpTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@tokyotriphub.com',
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  logger.info({ to: payload.to, subject: payload.subject }, 'Email sent via SMTP');
}

async function sendViaConsole(payload) {
  logger.info({ email: { to: payload.to, subject: payload.subject, body: payload.text } }, '[EMAIL] Would send email');
}

async function sendEmail(payload) {
  const provider = process.env.EMAIL_PROVIDER || 'console';
  try {
    if (provider === 'smtp') {
      await sendViaSmtp(payload);
    } else {
      await sendViaConsole(payload);
    }
  } catch (err) {
    logger.error({ err, to: payload.to, subject: payload.subject }, 'Failed to send email');
  }
}

module.exports = { sendEmail };