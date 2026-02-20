import SystemConfig from '../models/SystemConfig.js';
import { decryptSecret } from './cryptoService.js';

function getConfigValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function getMailRuntimeConfig() {
  const config = await SystemConfig.findOne().lean();
  const tenantId = getConfigValue(config?.tenantId, process.env.GRAPH_TENANT_ID);
  const clientId = getConfigValue(config?.clientId, process.env.GRAPH_CLIENT_ID);
  const clientSecret = getConfigValue(config?.clientSecret, process.env.GRAPH_CLIENT_SECRET, process.env.CLIENT_SECRET, process.env.AZURE_CLIENT_SECRET);
  const serviceUsername = getConfigValue(config?.serviceUsername, config?.serviceEmail);
  const encryptedPassword = getConfigValue(config?.encryptedPassword);

  if (!tenantId || !clientId || !clientSecret || !serviceUsername || !encryptedPassword) {
    throw new Error('Microsoft Graph API integration is incomplete. tenantId/clientId/clientSecret/serviceUsername/password are required in Communication Center.');
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    serviceUsername,
    servicePassword: decryptSecret(encryptedPassword),
  };
}

export async function acquireTokenByUsernamePassword(runtime) {
  const tokenUrl = `https://login.microsoftonline.com/${runtime.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: runtime.clientId,
    client_secret: runtime.clientSecret,
    grant_type: 'password',
    username: runtime.serviceUsername,
    password: runtime.servicePassword,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const code = data?.error_codes?.[0] || data?.error || 'UNKNOWN';
    const message = data?.error_description || data?.error || 'Token request failed';
    const err = new Error(`Graph ROPC failed (${code}): ${message}`);
    err.code = code;
    throw err;
  }

  return data.access_token;
}

export async function sendMailWithRuntimeConfig({ to, subject, html }) {
  const runtime = await getMailRuntimeConfig();
  const accessToken = await acquireTokenByUsernamePassword(runtime);

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: html,
        },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    const graphCode = data?.error?.code || 'GRAPH_SEND_FAILED';
    const graphMsg = data?.error?.message || text || 'Unknown Graph sendMail error';
    const err = new Error(`${graphCode}: ${graphMsg}`);
    err.code = graphCode;
    throw err;
  }

  return { success: true };
}
