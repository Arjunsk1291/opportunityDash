import { Buffer } from 'buffer';
import crypto from 'crypto';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const requiredEnv = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
const DELEGATED_SCOPES = ['Files.Read.Selected', 'Sites.Selected', 'User.Read', 'offline_access'];

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

// Encryption Utilities for DB Storage
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
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// Scope Helpers
function delegatedConsentScopesString() {
  return [...DELEGATED_SCOPES, 'Mail.Send'].join(' ');
}

export function mailboxDelegatedScopesString() {
  return delegatedConsentScopesString();
}

// Auth URL Builder
export function buildDelegatedConsentUrl({ loginHint } = {}) {
  validateEnv();
  const params = new URLSearchParams({
    client_id: envValue('GRAPH_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: envValue('GRAPH_CONSENT_REDIRECT_URI') || 'https://opportunitydash.onrender.com',
    scope: delegatedConsentScopesString(),
    prompt: 'consent',
  });

  if (loginHint) {
    params.set('login_hint', String(loginHint).trim().toLowerCase());
  }

  return `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/authorize?${params.toString()}`;
}

// Token Logic
async function postToken(params) {
  validateEnv();
  const tokenUrl = `https://login.microsoftonline.com/${envValue('GRAPH_TENANT_ID')}/oauth2/v2.0/token`;
  
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) body.set(key, String(value));
  });
  
  // Always include credentials for Confidential Client flow
  body.set('client_id', envValue('GRAPH_CLIENT_ID'));
  body.set('client_secret', graphClientSecret());

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const description = data?.error_description || data?.error || `Token acquisition failed (${response.status})`;
    throw new Error(`${description} | code=${data?.error || ''}`);
  }
  return data;
}

export async function bootstrapDelegatedToken({ username, password }) {
  const token = await postToken({
    grant_type: 'password',
    scope: DELEGATED_SCOPES.join(' '),
    username,
    password,
  });
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
  };
}

async function acquireTokenFromConfig(config) {
  // 1. Try Refresh Token from DB
  const encryptedRefreshToken = config?.graphRefreshTokenEnc;
  if (encryptedRefreshToken) {
    try {
      const refreshToken = unprotectRefreshToken(encryptedRefreshToken);
      const refreshed = await postToken({
        grant_type: 'refresh_token',
        scope: DELEGATED_SCOPES.join(' '),
        refresh_token: refreshToken,
      });
      return {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || refreshToken,
        mode: 'delegated',
      };
    } catch (e) { /* ignore and fallback */ }
  }

  // 2. Fallback to App-Only Token if permitted
  const appToken = await postToken({
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  return { accessToken: appToken.access_token, mode: 'application' };
}

export async function getAccessTokenWithConfig(config) {
  return await acquireTokenFromConfig(config);
}

// Graph Requests
async function graphRequest(path, token) {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Graph error: ${data?.error?.message || 'Unknown'}`);
  return data;
}

export async function resolveShareLink(shareLink, config) {
  const { accessToken } = await acquireTokenFromConfig(config);
  const shareToken = 'u!' + Buffer.from(shareLink).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const item = await graphRequest(`/shares/${shareToken}/driveItem`, accessToken);
  return {
    driveId: item?.parentReference?.driveId || '',
    fileId: item?.id || '',
    fileName: item?.name || '',
  };
}

export async function getWorksheets({ driveId, fileId, config }) {
  const { accessToken } = await acquireTokenFromConfig(config);
  const data = await graphRequest(`/drives/${driveId}/items/${fileId}/workbook/worksheets`, accessToken);
  return (data.value || []).map(s => ({ id: s.id, name: s.name }));
}

export async function getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress, config }) {
  const { accessToken } = await acquireTokenFromConfig(config);
  const sheet = worksheetName.replace(/'/g, "''");
  const path = rangeAddress 
    ? `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/range(address='${encodeURIComponent(rangeAddress)}')`
    : `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/usedRange`;
  
  const data = await graphRequest(path, accessToken);
  return data.values || [];
}

export async function getWorksheetRows(params) {
  return getWorksheetRangeValues(params);
}
