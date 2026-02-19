import SystemConfig from '../models/SystemConfig.js';
import { decryptSecret } from './cryptoService.js';

export async function getMailRuntimeConfig() {
  const config = await SystemConfig.findOne().lean();
  if (!config?.serviceEmail || !config?.smtpHost || !config?.smtpPort || !config?.encryptedPassword) {
    throw new Error('Mail server configuration is incomplete. Configure it in Communication Center.');
  }

  return {
    serviceEmail: config.serviceEmail,
    smtpHost: config.smtpHost,
    smtpPort: Number(config.smtpPort),
    smtpPassword: decryptSecret(config.encryptedPassword),
  };
}

export async function sendMailWithRuntimeConfig({ to, subject, html }) {
  const runtime = await getMailRuntimeConfig();
  const { default: nodemailer } = await import('nodemailer');

  const transporter = nodemailer.createTransport({
    host: runtime.smtpHost,
    port: runtime.smtpPort,
    secure: runtime.smtpPort === 465,
    auth: {
      user: runtime.serviceEmail,
      pass: runtime.smtpPassword,
    },
  });

  return transporter.sendMail({
    from: runtime.serviceEmail,
    to,
    subject,
    html,
  });
}
