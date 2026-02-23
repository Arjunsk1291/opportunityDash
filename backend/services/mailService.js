import SystemConfig from '../models/SystemConfig.js';
import { decryptSecret, encryptSecret } from './cryptoService.js';

const TOKEN_ENDPOINT = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const MAIL_SCOPES = 'https://graph.microsoft.com/.default offline_access openid profile';

function getConfigValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function tokenExpiresSoon(expiresAt) {
  if (!expiresAt) return true;
  const target = new Date(expiresAt).getTime();
  return Number.isNaN(target) || target <= Date.now() + 60 * 1000;
}

function normalizeTokenResult(data) {
  return {
    accessToken: data.access_token || '',
    refreshToken: data.refresh_token || '',
    expiresIn: Number(data.expires_in || 3600),
  };
}

async function requestToken(tenantId, bodyParams) {
  const response = await fetch(TOKEN_ENDPOINT(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(bodyParams),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const code = data?.error || data?.error_codes?.[0] || 'UNKNOWN';
    const message = data?.error_description || data?.error || 'Token request failed';
    const err = new Error(`Graph token request failed (${code}): ${message}`);
    err.code = code;
    throw err;
  }

  return normalizeTokenResult(data);
}

export async function getMailRuntimeConfig() {
  const config = await SystemConfig.findOne().lean();
  const tenantId = getConfigValue(process.env.GRAPH_TENANT_ID, config?.tenantId);
  const clientId = getConfigValue(process.env.AZURE_CLIENT_ID, process.env.GRAPH_CLIENT_ID, config?.clientId);
  const clientSecret = getConfigValue(process.env.CLIENT_SECRET, process.env.AZURE_CLIENT_SECRET, process.env.GRAPH_CLIENT_SECRET, config?.clientSecret);
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

async function persistMailTokens({ accessToken, refreshToken, expiresIn, updatedBy = 'system' }) {
  let config = await SystemConfig.findOne();
  if (!config) config = await SystemConfig.create({});

  if (accessToken) config.mailAccessTokenEnc = encryptSecret(accessToken);
  if (refreshToken) config.mailRefreshTokenEnc = encryptSecret(refreshToken);
  if (Number.isFinite(expiresIn)) {
    config.mailTokenExpiresAt = new Date(Date.now() + Math.max(60, Number(expiresIn)) * 1000);
  }
  config.lastUpdatedBy = updatedBy;
  await config.save();
}

async function getStoredMailTokens() {
  const config = await SystemConfig.findOne().lean();
  if (!config) return { accessToken: '', refreshToken: '', expiresAt: null };

  let accessToken = '';
  let refreshToken = '';
  try {
    accessToken = config.mailAccessTokenEnc ? decryptSecret(config.mailAccessTokenEnc) : '';
  } catch {
    accessToken = '';
  }
  try {
    refreshToken = config.mailRefreshTokenEnc ? decryptSecret(config.mailRefreshTokenEnc) : '';
  } catch {
    refreshToken = '';
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: config.mailTokenExpiresAt || null,
  };
}

async function acquireTokenByRefreshToken(runtime, refreshToken) {
  return requestToken(runtime.tenantId, {
    client_id: runtime.clientId,
    client_secret: runtime.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MAIL_SCOPES,
  });
}

export async function acquireTokenByUsernamePassword(runtime) {
  const body = {
    client_id: runtime.clientId,
    client_secret: runtime.clientSecret,
    grant_type: 'password',
    username: runtime.serviceUsername,
    password: runtime.servicePassword,
    scope: MAIL_SCOPES,
  };

  return requestToken(runtime.tenantId, body);
}

export async function getValidGraphToken() {
  const runtime = await getMailRuntimeConfig();
  const stored = await getStoredMailTokens();

  if (stored.accessToken && !tokenExpiresSoon(stored.expiresAt)) {
    return stored.accessToken;
  }

  if (stored.refreshToken) {
    try {
      const refreshed = await acquireTokenByRefreshToken(runtime, stored.refreshToken);
      await persistMailTokens(refreshed);
      return refreshed.accessToken;
    } catch (error) {
      console.warn('Mail token refresh failed; falling back to ROPC:', error.code || error.message);
    }
  }

  const ropc = await acquireTokenByUsernamePassword(runtime);
  await persistMailTokens(ropc);
  return ropc.accessToken;
}

export async function sendMailWithRuntimeConfig({ to, subject, html }) {
  const accessToken = await getValidGraphToken();

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
