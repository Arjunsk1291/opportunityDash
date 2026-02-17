import { Buffer } from 'buffer';
import crypto from 'crypto';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const requiredEnv = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
const DELEGATED_SCOPES = ['Files.Read.Selected', 'Sites.Selected', 'User.Read'];

function envValue(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function graphClientSecret() {
  return envValue('GRAPH_CLIENT_SECRET') || envValue('CLIENT_SECRET') || envValue('AZURE_CLIENT_SECRET');
}

function isGuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function debugEnabled() {
  return String(process.env.GRAPH_TOKEN_DEBUG || '').toLowerCase() === 'true';
}

function maskValue(value) {
  if (!value) return '❌ EMPTY';
  return `${String(value).slice(0, 10)}...`;
}

function validateEnv() {
  const values = {
    GRAPH_TENANT_ID: envValue('GRAPH_TENANT_ID'),
    GRAPH_CLIENT_ID: envValue('GRAPH_CLIENT_ID'),
    GRAPH_CLIENT_SECRET: graphClientSecret(),
  };

  const missing = requiredEnv.filter((name) => !values[name]);
  if (missing.length) {
    throw new Error(`Missing Graph env vars: ${missing.join(', ')}`);
  }

  if (isGuid(values.GRAPH_CLIENT_SECRET)) {
    throw new Error('GRAPH_CLIENT_SECRET appears to be a Secret ID (GUID). Use the Secret VALUE from Azure App Registration.');
  }
}

function encryptionKey() {
  const keySeed = envValue('GRAPH_TOKEN_ENCRYPTION_KEY') || graphClientSecret();
  return crypto.createHash('sha256').update(String(keySeed)).digest();
}

function encryptText(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptText(payload) {
  if (!payload) return '';
  const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function delegatedScopesString() {
  return DELEGATED_SCOPES.join(' ');
}

function logTokenDebug() {
  if (!debugEnabled()) return;

  console.log('[graph-token-debug] GRAPH_CLIENT_SECRET:', maskValue(envValue('GRAPH_CLIENT_SECRET')));
  console.log('[graph-token-debug] CLIENT_SECRET:', maskValue(envValue('CLIENT_SECRET')));
  console.log('[graph-token-debug] AZURE_CLIENT_SECRET:', maskValue(envValue('AZURE_CLIENT_SECRET')));
  console.log('[graph-token-debug] Final secret used:', maskValue(graphClientSecret()));
  console.log('[graph-token-debug] GRAPH_TENANT_ID:', maskValue(envValue('GRAPH_TENANT_ID')));
  console.log('[graph-token-debug] GRAPH_CLIENT_ID:', maskValue(envValue('GRAPH_CLIENT_ID')));
}

function logTokenRequestDetails(params, body) {
  if (!debugEnabled()) return;

  console.log('[graph-token-debug] postToken params:', {
    grant_type: params?.grant_type || '',
    hasDeviceCode: !!params?.device_code,
    hasClientSecret: !!graphClientSecret(),
  });

  const entries = {};
  for (const [key, value] of body.entries()) {
    if (key === 'client_secret') {
      entries[key] = maskValue(value);
    } else if (key === 'device_code') {
      entries[key] = `${String(value).slice(0, 20)}...`;
    } else {
      entries[key] = value;
    }
  }
  console.log('[graph-token-debug] postToken final body:', entries);
}

function buildTokenErrorMessage(responseStatus, data) {
  const description = data?.error_description || data?.error || `Token acquisition failed (${responseStatus})`;
  const code = data?.error || '';
  const trace = data?.trace_id || '';
  const correlation = data?.correlation_id || '';

  const parts = [description];
  if (code) parts.push(`code=${code}`);
  if (trace) parts.push(`trace_id=${trace}`);
  if (correlation) parts.push(`correlation_id=${correlation}`);
  return parts.join(' | ');
}


export function getGraphTokenDebugSnapshot() {
  return {
    GRAPH_CLIENT_SECRET: maskValue(envValue('GRAPH_CLIENT_SECRET')),
    CLIENT_SECRET: maskValue(envValue('CLIENT_SECRET')),
    AZURE_CLIENT_SECRET: maskValue(envValue('AZURE_CLIENT_SECRET')),
    RESOLVED_SECRET: maskValue(graphClientSecret()),
    RESOLVED_SECRET_IS_GUID: isGuid(graphClientSecret()),
    GRAPH_TENANT_ID: maskValue(envValue('GRAPH_TENANT_ID')),
    GRAPH_CLIENT_ID: maskValue(envValue('GRAPH_CLIENT_ID')),
  };
}

async function postToken(params) {
  validateEnv();
  logTokenDebug();

  const tokenUrl = `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/token`;
  const clientSecret = graphClientSecret();

  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.set(key, String(value));
  });
  body.set('client_id', envValue('GRAPH_CLIENT_ID'));
  body.set('client_secret', clientSecret);

  logTokenRequestDetails(params, body);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (debugEnabled()) {
    console.log('[graph-token-debug] raw token response:', { status: response.status, data });
  }

  if (!response.ok || !data.access_token) {
    throw new Error(buildTokenErrorMessage(response.status, data));
  }

  return data;
}

async function acquireAppToken() {
  const token = await postToken({
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  return token.access_token;
}

export async function startDeviceCodeFlow() {
  validateEnv();
  const deviceCodeUrl = `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/devicecode`;
  const body = new URLSearchParams({
    client_id: envValue('GRAPH_CLIENT_ID'),
    scope: delegatedScopesString(),
  });

  const response = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.device_code) {
    throw new Error(data.error_description || data.error || `Failed to start device code flow (${response.status})`);
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: Number(data.expires_in || 900),
    interval: Number(data.interval || 5),
    message: data.message,
  };
}

export async function exchangeDeviceCodeForToken(deviceCode) {
  if (!deviceCode) {
    throw new Error('deviceCode is required');
  }

  const token = await postToken({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    scope: delegatedScopesString(),
    device_code: deviceCode,
  });

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    expiresIn: Number(token.expires_in || 3600),
    scope: token.scope || delegatedScopesString(),
  };
}

export async function bootstrapDelegatedToken({ username, password }) {
  if (!username || !password) {
    throw new Error('username and password are required');
  }

  let token;
  try {
    token = await postToken({
      grant_type: 'password',
      scope: delegatedScopesString(),
      username,
      password,
    });
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('AADSTS50076')) {
      throw new Error('AADSTS50076: MFA required. Use Device Code Auth in Admin panel. Ensure delegated permissions include Files.Read.Selected, Sites.Selected, User.Read.');
    }
    throw error;
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    expiresIn: Number(token.expires_in || 3600),
    scope: token.scope || delegatedScopesString(),
  };
}

function shouldAllowAppFallback() {
  return String(process.env.GRAPH_ALLOW_APP_FALLBACK || '').toLowerCase() === 'true';
}

async function acquireTokenFromConfig(config) {
  const encryptedRefreshToken = config?.graphRefreshTokenEnc;
  if (encryptedRefreshToken) {
    try {
      const refreshToken = decryptText(encryptedRefreshToken);
      if (refreshToken) {
        const refreshed = await postToken({
          grant_type: 'refresh_token',
          scope: delegatedScopesString(),
          refresh_token: refreshToken,
        });

        return {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || refreshToken,
          expiresIn: Number(refreshed.expires_in || 3600),
          mode: 'delegated',
        };
      }
    } catch {
      // fall through to app token when explicitly allowed
    }
  }

  if (!shouldAllowAppFallback()) {
    throw new Error('No delegated refresh token configured. Complete Graph account bootstrap in Admin panel.');
  }

  const appToken = await acquireAppToken();
  return {
    accessToken: appToken,
    refreshToken: null,
    expiresIn: 3600,
    mode: 'application',
  };
}

export async function getAccessTokenWithConfig(config) {
  const tokenResult = await acquireTokenFromConfig(config);
  return tokenResult;
}

async function graphRequest(path, token) {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const statusDetail = `${response.status} ${response.statusText}`.trim();
    const graphError = data?.error?.message || data?.error?.code || text;
    throw new Error(`Graph request failed (${statusDetail}): ${graphError || 'Unknown error'}`);
  }

  return data;
}

function toShareToken(url) {
  return Buffer.from(url)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeSheetName(sheetName) {
  return sheetName.replace(/'/g, "''");
}

export async function resolveShareLink(shareLink, config) {
  if (!shareLink) throw new Error('shareLink is required');

  const { accessToken } = await acquireTokenFromConfig(config);
  const shareToken = toShareToken(shareLink);
  const item = await graphRequest(`/shares/u!${shareToken}/driveItem`, accessToken);

  return {
    driveId: item?.parentReference?.driveId || '',
    fileId: item?.id || '',
    fileName: item?.name || '',
    webUrl: item?.webUrl || '',
  };
}

export async function getWorksheets({ driveId, fileId, config }) {
  if (!driveId || !fileId) throw new Error('driveId and fileId are required');

  const { accessToken } = await acquireTokenFromConfig(config);
  const data = await graphRequest(`/drives/${driveId}/items/${fileId}/workbook/worksheets`, accessToken);
  return (data.value || []).map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    position: sheet.position,
  }));
}

export async function getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress, config }) {
  if (!driveId || !fileId || !worksheetName) {
    throw new Error('driveId, fileId and worksheetName are required');
  }

  const { accessToken } = await acquireTokenFromConfig(config);
  const sheet = encodeSheetName(worksheetName);

  if (rangeAddress && rangeAddress.trim()) {
    const range = encodeURIComponent(rangeAddress.trim());
    const rangeData = await graphRequest(
      `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/range(address='${range}')`,
      accessToken,
    );
    return rangeData.values || [];
  }

  const usedRange = await graphRequest(
    `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/usedRange`,
    accessToken,
  );
  return usedRange.values || [];
}

export async function getWorksheetRows({ driveId, fileId, worksheetName, rangeAddress, config }) {
  return getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress, config });
}

export function protectRefreshToken(rawToken) {
  return encryptText(rawToken);
}

export function unprotectRefreshToken(payload) {
  return decryptText(payload);
}
