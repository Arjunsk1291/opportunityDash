import { Buffer } from 'buffer';
import crypto from 'crypto';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const requiredEnv = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
const DELEGATED_SCOPES = ['Files.Read.Selected', 'Sites.Selected', 'User.Read', 'Mail.Send', 'offline_access'];

function envValue(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function graphClientSecret() {
  return envValue('GRAPH_CLIENT_SECRET') || envValue('CLIENT_SECRET') || envValue('AZURE_CLIENT_SECRET');
}

function validateEnv() {
  const values = {
    GRAPH_TENANT_ID: envValue('GRAPH_TENANT_ID'),
    GRAPH_CLIENT_ID: envValue('GRAPH_CLIENT_ID'),
    GRAPH_CLIENT_SECRET: graphClientSecret(),
  };
  const missing = requiredEnv.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Missing Graph env vars: ${missing.join(', ')}`);
}

// Encryption Logic
function encryptionKey() {
  const keySeed = envValue('GRAPH_TOKEN_ENCRYPTION_KEY') || graphClientSecret();
  return crypto.createHash('sha256').update(String(keySeed)).digest();
}

export function protectRefreshToken(rawToken) {
  if (!rawToken) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function unprotectRefreshToken(payload) {
  if (!payload) return '';
  const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Unified Token Requester (Confidential Client Flow)
async function postToken(params) {
  validateEnv();
  const tokenUrl = `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v) body.set(k, String(v)); });
  
  body.set('client_id', envValue('GRAPH_CLIENT_ID'));
  body.set('client_secret', graphClientSecret());

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || 'Token Error');
  return data;
}

// EXPORTED FUNCTIONS
export function mailboxDelegatedScopesString() { return DELEGATED_SCOPES.join(' '); }

export function buildDelegatedConsentUrl({ loginHint } = {}) {
  const params = new URLSearchParams({
    client_id: envValue('GRAPH_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: envValue('GRAPH_CONSENT_REDIRECT_URI') || 'https://opportunitydash.onrender.com',
    scope: DELEGATED_SCOPES.join(' '),
    prompt: 'consent',
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function startDeviceCodeFlow(options = {}) {
  const response = await fetch(`https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: envValue('GRAPH_CLIENT_ID'), scope: options.scopes || DELEGATED_SCOPES.join(' ') }),
  });
  const data = await response.json();
  return { deviceCode: data.device_code, userCode: data.user_code, verificationUri: data.verification_uri };
}

export async function exchangeDeviceCodeForToken(deviceCode, options = {}) {
  const token = await postToken({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
  });
  return { accessToken: token.access_token, refreshToken: token.refresh_token || '' };
}

export async function bootstrapDelegatedToken({ username, password }) {
  const token = await postToken({
    grant_type: 'password',
    scope: DELEGATED_SCOPES.join(' '),
    username,
    password,
  });
  return { accessToken: token.access_token, refreshToken: token.refresh_token || '' };
}

export async function getAccessTokenWithConfig(config) {
  const encrypted = config?.graphRefreshTokenEnc;
  if (encrypted) {
    try {
      const rt = unprotectRefreshToken(encrypted);
      const res = await postToken({ grant_type: 'refresh_token', refresh_token: rt, scope: DELEGATED_SCOPES.join(' ') });
      return { accessToken: res.access_token, refreshToken: res.refresh_token || rt };
    } catch (e) { /* fallback to app token */ }
  }
  const appRes = await postToken({ grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' });
  return { accessToken: appRes.access_token };
}

// Excel Resolvers
export async function resolveShareLink(shareLink, config) {
  const { accessToken } = await getAccessTokenWithConfig(config);
  const shareToken = 'u!' + Buffer.from(shareLink).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${GRAPH_BASE_URL}/shares/${shareToken}/driveItem`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const item = await res.json();
  if (!res.ok) throw new Error(item.error?.message || 'Link resolution failed');
  return { driveId: item.parentReference.driveId, fileId: item.id };
}

export async function getWorksheets({ driveId, fileId, config }) {
  const { accessToken } = await getAccessTokenWithConfig(config);
  const res = await fetch(`${GRAPH_BASE_URL}/drives/${driveId}/items/${fileId}/workbook/worksheets`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  return (data.value || []).map(s => ({ id: s.id, name: s.name }));
}

export async function getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress, config }) {
  const { accessToken } = await getAccessTokenWithConfig(config);
  const sheet = worksheetName.replace(/'/g, "''");
  const path = rangeAddress ? `worksheets('${sheet}')/range(address='${encodeURIComponent(rangeAddress)}')` : `worksheets('${sheet}')/usedRange`;
  const res = await fetch(`${GRAPH_BASE_URL}/drives/${driveId}/items/${fileId}/workbook/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  return data.values || [];
}

// THE MISSING ALIAS
export async function getWorksheetRows(params) {
  return getWorksheetRangeValues(params);
}
