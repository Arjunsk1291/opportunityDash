import { Buffer } from 'buffer';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const requiredEnv = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];

function validateEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing Graph env vars: ${missing.join(', ')}`);
  }
}

async function acquireAppToken() {
  validateEnv();

  const tokenUrl = `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to acquire Microsoft Graph token');
  }

  return data.access_token;
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

export async function resolveShareLink(shareLink) {
  if (!shareLink) throw new Error('shareLink is required');

  const token = await acquireAppToken();
  const shareToken = toShareToken(shareLink);
  const item = await graphRequest(`/shares/u!${shareToken}/driveItem`, token);

  return {
    driveId: item?.parentReference?.driveId || '',
    fileId: item?.id || '',
    fileName: item?.name || '',
    webUrl: item?.webUrl || '',
  };
}

export async function getWorksheets({ driveId, fileId }) {
  if (!driveId || !fileId) throw new Error('driveId and fileId are required');

  const token = await acquireAppToken();
  const data = await graphRequest(`/drives/${driveId}/items/${fileId}/workbook/worksheets`, token);
  return (data.value || []).map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    position: sheet.position,
  }));
}

export async function getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress }) {
  if (!driveId || !fileId || !worksheetName) {
    throw new Error('driveId, fileId and worksheetName are required');
  }

  const token = await acquireAppToken();
  const sheet = encodeSheetName(worksheetName);

  if (rangeAddress && rangeAddress.trim()) {
    const range = encodeURIComponent(rangeAddress.trim());
    const rangeData = await graphRequest(
      `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/range(address='${range}')`,
      token,
    );
    return rangeData.values || [];
  }

  const usedRange = await graphRequest(
    `/drives/${driveId}/items/${fileId}/workbook/worksheets('${sheet}')/usedRange`,
    token,
  );
  return usedRange.values || [];
}

export async function getWorksheetRows({ driveId, fileId, worksheetName, rangeAddress }) {
  return getWorksheetRangeValues({ driveId, fileId, worksheetName, rangeAddress });
}
