const requiredEnv = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
let _mailTokenCache = null;
function envValue(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}
function graphClientSecret() {
  return envValue('GRAPH_CLIENT_SECRET') || envValue('CLIENT_SECRET') || envValue('AZURE_CLIENT_SECRET');
}
function mailTenantId() {
  return envValue('GRAPH_TENANT_ID') || envValue('AZURE_TENANT_ID');
}
function mailClientId() {
  return envValue('GRAPH_CLIENT_ID') || envValue('AZURE_CLIENT_ID');
}
function validateMailEnv() {
  const values = {
    GRAPH_TENANT_ID: mailTenantId(),
    GRAPH_CLIENT_ID: mailClientId(),
    GRAPH_CLIENT_SECRET: graphClientSecret(),
  };
  const missing = requiredEnv.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Missing Graph env vars: ${missing.join(', ')}`);
}
async function postMailToken(params) {
  validateMailEnv();
  const tokenUrl = `https://login.microsoftonline.com/${mailTenantId()}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v) body.set(k, String(v)); });
  body.set('client_id', mailClientId());
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
export async function getMailAccessToken() {
  const now = Date.now();
  const refreshSkewMs = 5 * 60 * 1000;
  if (_mailTokenCache?.accessToken && _mailTokenCache?.expiresAtMs && now + refreshSkewMs < _mailTokenCache.expiresAtMs) {
    return { accessToken: _mailTokenCache.accessToken };
  }

  const token = await postMailToken({
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const expiresInSec = Number(token?.expires_in || 0);
  const expiresAtMs = now + Math.max(0, expiresInSec) * 1000;
  _mailTokenCache = {
    accessToken: token.access_token,
    expiresAtMs,
  };
  return { accessToken: token.access_token };
}
