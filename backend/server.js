import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import approvalDb from './approvalDb.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import LoginLog from './models/LoginLog.js';
import Client from './models/Client.js';
import { syncTendersFromGraph, transformTendersToOpportunities } from './services/dataSyncService.js';
import GraphSyncConfig from './models/GraphSyncConfig.js';
import { resolveShareLink, getWorksheets, getWorksheetRangeValues, bootstrapDelegatedToken, protectRefreshToken, buildDelegatedConsentUrl, getAccessTokenWithConfig } from './services/graphExcelService.js';
import { initializeBootSync } from './services/bootSyncService.js';
import SystemConfig from './models/SystemConfig.js';
import { encryptSecret } from './services/cryptoService.js';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';
console.log('Debug flags:', { MAIL_DEBUG: String(process.env.MAIL_DEBUG || '').toLowerCase() === 'true', NOTIFICATION_DEBUG: String(process.env.NOTIFICATION_DEBUG || '').toLowerCase() === 'true', GRAPH_TOKEN_DEBUG: String(process.env.GRAPH_TOKEN_DEBUG || '').toLowerCase() === 'true' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    ok: dbReady,
    service: 'backend',
    dbState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/msal-config', (_req, res) => {
  const tenantId = process.env.AZURE_TENANT_ID || '';
  const clientId = process.env.AZURE_CLIENT_ID || '';
  const redirectUri = process.env.AZURE_REDIRECT_URI || 'https://opportunitydash.onrender.com/auth/callback';
  const redirectUriDev = process.env.AZURE_REDIRECT_URI_DEV || 'http://localhost:5173';
  const useDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

  res.json({
    tenantId,
    clientId,
    redirectUri: useDev ? redirectUriDev : redirectUri,
  });
});

console.log('[mongo.connect.start]', JSON.stringify({ uriConfigured: Boolean(MONGODB_URI), timestamp: new Date().toISOString() }));
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('[mongo.connect.success]', JSON.stringify({ timestamp: new Date().toISOString() }));
  })
  .then(async () => {
    await initializeBootSync();
    await scheduleGraphAutoSync();
    scheduleDailyNotificationCheck();
  })
  .catch(err => {
    console.error('[mongo.connect.failure]', JSON.stringify({
      timestamp: new Date().toISOString(),
      name: err?.name || 'Error',
      message: err?.message || String(err),
      stack: err?.stack || null,
    }));
  });

const mapIdField = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc._id?.toString() || doc._id || null,
  };
};

const calculateSummaryStats = (data = []) => {
  const awardedCount = data.filter((item) => item.status === 'Awarded').length;
  const lostCount = data.filter((item) => item.status === 'Lost').length;
  const regrettedCount = data.filter((item) => item.status === 'Regretted').length;
  const workingCount = data.filter((item) => item.status === 'Working').length;
  const toStartCount = data.filter((item) => item.status === 'To Start').length;
  const atRiskCount = data.filter((item) => item.atRisk).length;
  const totalActive = workingCount + toStartCount;

  return {
    awardedCount,
    wonCount: awardedCount,
    lostCount,
    regrettedCount,
    workingCount,
    toStartCount,
    atRiskCount,
    totalActive,
  };
};

const calculateFunnelData = (data = []) => {
  const stages = ['To Start', 'Working', 'Awarded', 'Lost', 'Regretted'];
  return stages.map((stage) => {
    const stageItems = data.filter((item) => item.status === stage);
    const value = stageItems.reduce((sum, item) => sum + Number(item.submittedValue || item.opportunityValue || 0), 0);

    return {
      stage,
      count: stageItems.length,
      value,
    };
  });
};

const getClientData = (data = []) => {
  const byClient = data.reduce((acc, item) => {
    const name = item.clientName || 'Unknown Client';
    if (!acc[name]) {
      acc[name] = { name, count: 0, value: 0 };
    }

    acc[name].count += 1;
    acc[name].value += Number(item.submittedValue || item.opportunityValue || 0);
    return acc;
  }, {});

  return Object.values(byClient)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
};

const buildTroubleshootingFromMessage = (message = '') => {
  const text = String(message || '').toLowerCase();
  const hints = [];
  if (text.includes('access denied') || text.includes('accessdenied')) {
    hints.push('Graph permissions may be insufficient. Validate Files.Read.Selected/Sites.Selected/Mail.Send permissions and admin consent.');
    hints.push('Grant resource-level site/file access for Sites.Selected/Files.Read.Selected.');
    hints.push('Verify service mailbox user can access the target workbook and worksheet.');
  }
  if (text.includes('config is incomplete') || text.includes('missing driveid/fileid/worksheetname')) {
    hints.push('Open Admin > Data Sync and complete Share Link, Drive ID, File ID, and Worksheet Name.');
  }
  return hints;
};

const toApiError = (error, fallbackCode = 'SERVER_ERROR') => {
  const message = String(error?.message || 'Unexpected server error');
  const troubleshooting = [
    ...(Array.isArray(error?.details?.troubleshooting) ? error.details.troubleshooting : []),
    ...buildTroubleshootingFromMessage(message),
  ];

  return {
    error: message,
    code: error?.code || error?.details?.code || fallbackCode,
    status: error?.status || error?.details?.status || null,
    details: error?.details || null,
    troubleshooting: [...new Set(troubleshooting)].filter(Boolean),
  };
};

const getGraphConfig = async () => {
  let config = await GraphSyncConfig.findOne();
  if (!config) {
    config = await GraphSyncConfig.create({});
  }
  return config;
};

const REQUIRED_NEW_ROW_COLUMNS = ['YEAR', 'TENDER NO', 'TENDER NAME', 'CLIENT', 'GDS/GES', 'TENDER TYPE', 'DATE TENDER RECD'];
const TELECAST_RECENT_WINDOW_DAYS = 28;
const MAX_ALERTED_TRACKED_KEYS = 50000;
const MAX_ALERTED_TRACKED_REFS = 50000;

const normalizeColumnKey = (value = '') => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeCompanyName = (name = '') => {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const normalizeCompanyKey = (name = '') => normalizeCompanyName(name).toLowerCase();

const contactKey = (contact = {}) => {
  const first = String(contact.firstName || '').trim().toLowerCase();
  const last = String(contact.lastName || '').trim().toLowerCase();
  const email = String(contact.email || '').trim().toLowerCase();
  const phone = String(contact.phone || '').trim().replace(/\s+/g, '');
  if (!first && !last && !email && !phone) return '';
  return `${email}|${phone}|${first}|${last}`;
};

const mergeContacts = (existing = [], incoming = []) => {
  const seen = new Set(existing.map((contact) => contactKey(contact)).filter(Boolean));
  const merged = [...existing];
  incoming.forEach((contact) => {
    const key = contactKey(contact);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({
      firstName: String(contact.firstName || '').trim(),
      lastName: String(contact.lastName || '').trim(),
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
    });
  });
  return merged;
};

const getSubmitterFromOpportunity = (opportunity = {}) => {
  const snapshot = opportunity?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  const normalizedEntries = Object.entries(snapshot).reduce((acc, [key, value]) => {
    acc[normalizeColumnKey(key)] = String(value || '').trim();
    return acc;
  }, {});
  return normalizedEntries['SUBMITTED BY'] || normalizedEntries['SUBMITTER'] || normalizedEntries['SUBMITTEDBY'] || '';
};

const normalizeFilterValue = (value = '') => String(value || '').trim().toLowerCase();

const matchFilterValue = (source = '', target = '') => {
  if (!target) return true;
  return normalizeFilterValue(source) === normalizeFilterValue(target);
};

const filterOpportunitiesForBulkApprove = (opportunities = [], filters = {}) => {
  const dateFromRaw = filters?.dateFrom ? parseDateValue(filters.dateFrom) : null;
  const dateToRaw = filters?.dateTo ? parseDateValue(filters.dateTo) : null;
  const dateFrom = dateFromRaw && !Number.isNaN(dateFromRaw.getTime()) ? dateFromRaw : null;
  const dateTo = dateToRaw && !Number.isNaN(dateToRaw.getTime()) ? dateToRaw : null;

  const group = normalizeFilterValue(filters.group || '');
  const lead = normalizeFilterValue(filters.lead || '');
  const client = normalizeFilterValue(filters.client || '');
  const submitter = normalizeFilterValue(filters.submitter || '');

  return opportunities.filter((opportunity) => {
    if (group && normalizeFilterValue(opportunity.groupClassification || '') !== group) return false;
    if (lead && normalizeFilterValue(opportunity.internalLead || '') !== lead) return false;
    if (client && normalizeFilterValue(opportunity.clientName || '') !== client) return false;
    if (submitter) {
      const submittedBy = getSubmitterFromOpportunity(opportunity);
      if (normalizeFilterValue(submittedBy) !== submitter) return false;
    }

    if (dateFrom || dateTo) {
      const received = getTenderReceivedDate(opportunity);
      if (!received) return false;
      if (dateFrom && received < dateFrom) return false;
      if (dateTo && received > dateTo) return false;
    }

    return true;
  });
};

const buildClientSeedFromOpportunity = (opportunity = {}) => {
  const rawName = opportunity?.clientName || opportunity?.rawGraphData?.rowSnapshot?.CLIENT || '';
  const companyName = normalizeCompanyName(rawName);
  if (!companyName) return null;
  const companyKey = normalizeCompanyKey(companyName);
  const group = String(opportunity?.groupClassification || '').trim();
  return { companyName, companyKey, group };
};

const syncClientsFromOpportunities = async (opportunities = []) => {
  const clientMap = new Map();
  opportunities.forEach((opportunity) => {
    const seed = buildClientSeedFromOpportunity(opportunity);
    if (!seed) return;
    clientMap.set(seed.companyKey, seed);
  });

  const keys = Array.from(clientMap.keys());
  if (!keys.length) return { created: 0, updated: 0 };

  const existing = await Client.find({ companyKey: { $in: keys } }).lean();
  const existingKeys = new Set(existing.map((client) => client.companyKey));

  const ops = [];
  keys.forEach((key) => {
    const seed = clientMap.get(key);
    if (!seed) return;
    const companyName = seed.companyName;
    const group = seed.group || '';
    if (!existingKeys.has(key)) {
      ops.push({
        insertOne: {
          document: {
            companyName,
            companyKey: key,
            group,
            domain: '',
            location: { city: '', country: '' },
            contacts: [],
          },
        },
      });
    } else {
      const update = { companyName };
      if (group) update.group = group;
      ops.push({
        updateOne: {
          filter: { companyKey: key },
          update: { $set: update },
        },
      });
    }
  });

  if (!ops.length) return { created: 0, updated: 0 };
  const result = await Client.bulkWrite(ops, { ordered: false });
  return {
    created: result.insertedCount || 0,
    updated: result.modifiedCount || 0,
  };
};

const getNormalizedRowSnapshot = (opportunity) => {
  const snapshot = opportunity?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return {};
  return Object.entries(snapshot).reduce((acc, [key, value]) => {
    acc[normalizeColumnKey(key)] = String(value || '').trim();
    return acc;
  }, {});
};

const hasRequiredRowValues = (opportunity) => {
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  return REQUIRED_NEW_ROW_COLUMNS.every((col) => Boolean(normalizedEntries[col]));
};

const buildRowSignature = (opportunity) => {
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  const parts = REQUIRED_NEW_ROW_COLUMNS.map((col) => normalizedEntries[col] || '');
  return parts.map((part) => String(part).trim().toUpperCase()).join('||');
};

const normalizeRefNo = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getTenderRefNo = (opportunity) => {
  const direct = normalizeRefNo(opportunity?.opportunityRefNo || '');
  if (direct) return direct;
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  return normalizeRefNo(normalizedEntries['TENDER NO'] || '');
};

const buildNotificationKey = (opportunity) => {
  const ref = getTenderRefNo(opportunity);
  if (ref) return `REF::${ref}`;
  const signature = buildRowSignature(opportunity);
  return signature ? `SIG::${signature}` : '';
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const yearRaw = Number(dmyMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    const asDmy = new Date(Date.UTC(year, month - 1, day));
    if (
      asDmy.getUTCFullYear() === year
      && asDmy.getUTCMonth() === month - 1
      && asDmy.getUTCDate() === day
    ) {
      return asDmy;
    }

    const asMdy = new Date(Date.UTC(year, day - 1, month));
    if (
      asMdy.getUTCFullYear() === year
      && asMdy.getUTCMonth() === day - 1
      && asMdy.getUTCDate() === month
    ) {
      return asMdy;
    }
  }

  return null;
};

const getTenderReceivedDate = (opportunity) => (
  parseDateValue(opportunity?.dateTenderReceived)
  || parseDateValue(opportunity?.rawGraphData?.rowSnapshot?.['DATE TENDER RECD'])
);

const isTenderRecentForTelecast = (opportunity, now = new Date()) => {
  const received = getTenderReceivedDate(opportunity);
  if (!received) return false;
  const ageMs = now.getTime() - received.getTime();
  if (ageMs < 0) return false;
  return ageMs <= TELECAST_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

const TELECAST_TEMPLATE_KEYWORDS = [
  '{{TENDER_NO}}', '{{TENDER_NAME}}', '{{CLIENT}}', '{{GROUP}}', '{{TENDER_TYPE}}', '{{DATE_TENDER_RECD}}', '{{YEAR}}', '{{LEAD}}', '{{VALUE}}', '{{OPPORTUNITY_ID}}', '{{COMMENTS}}',
];

const normalizeEmailList = (value) => {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[\n,;]+/g);
  return [...new Set(parts.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
};

const getGroupFromOpportunity = (opportunity) => {
  const raw = String(opportunity?.groupClassification || opportunity?.rawGraphData?.rowSnapshot?.['GDS/GES'] || '').toUpperCase().trim();
  if (raw.includes('GES')) return 'GES';
  if (raw.includes('GDS')) return 'GDS';
  if (raw.includes('GTS')) return 'GTS';
  return 'UNKNOWN';
};

const getTemplateValues = (opportunity) => {
  const row = opportunity?.rawGraphData?.rowSnapshot || {};
  const tenderNo = opportunity?.opportunityRefNo || row['TENDER NO'] || '';
  const tenderName = opportunity?.tenderName || row['TENDER NAME'] || '';
  const client = opportunity?.clientName || row.CLIENT || '';
  const group = getGroupFromOpportunity(opportunity);
  const tenderType = opportunity?.opportunityClassification || row['TENDER TYPE'] || '';
  const dateTenderRecd = opportunity?.dateTenderReceived || row['DATE TENDER RECD'] || '';
  const year = row.YEAR || opportunity?.rawGraphData?.year || '';
  const lead = opportunity?.internalLead || row.LEAD || '';
  const value = opportunity?.opportunityValue ?? row['TENDER VALUE'] ?? '';
  const comments = opportunity?.comments || row.COMMENTS || '';

  return {
    TENDER_NO: String(tenderNo || ''),
    TENDER_NAME: String(tenderName || ''),
    CLIENT: String(client || ''),
    GROUP: String(group || ''),
    TENDER_TYPE: String(tenderType || ''),
    DATE_TENDER_RECD: String(dateTenderRecd || ''),
    YEAR: String(year || ''),
    LEAD: String(lead || ''),
    VALUE: String(value || ''),
    OPPORTUNITY_ID: String(opportunity?.id || ''),
    COMMENTS: String(comments || ''),
  };
};

const renderTemplate = (template = '', values = {}) => {
  let output = String(template || '');
  Object.entries(values).forEach(([key, value]) => {
    const token = `{{${key}}}`;
    output = output.split(token).join(String(value ?? ''));
  });
  return output;
};



const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

const getWeekWindow = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const weekKey = `${start.getUTCFullYear()}-W${Math.ceil((((start - new Date(Date.UTC(start.getUTCFullYear(),0,1))) / 86400000) + 1) / 7)}`;
  return { weekKey, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
};

const pushWeeklyTelecastStats = (config, newRows = []) => {
  const { weekKey, startDate, endDate } = getWeekWindow(new Date());
  const byGroup = newRows.reduce((acc, row) => {
    const g = getGroupFromOpportunity(row);
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  const history = Array.isArray(config.telecastWeeklyStats) ? [...config.telecastWeeklyStats] : [];
  const idx = history.findIndex((item) => item?.weekKey === weekKey);
  if (idx >= 0) {
    history[idx].newRowsCount = Number(history[idx].newRowsCount || 0) + newRows.length;
    history[idx].byGroup = { ...(history[idx].byGroup || {}), ...Object.fromEntries(Object.entries(byGroup).map(([k,v]) => [k, Number(v) + Number(history[idx].byGroup?.[k] || 0)])) };
    history[idx].updatedAt = new Date();
  } else {
    history.push({ weekKey, startDate, endDate, newRowsCount: newRows.length, byGroup, updatedAt: new Date() });
  }
  config.telecastWeeklyStats = history.slice(-12);
};

const getExistingTelecastStateFromSyncedOpportunities = async () => {
  const rows = await SyncedOpportunity.find(
    {},
    {
      telecastAlerted: 1,
      telecastAlertedKey: 1,
      telecastAlertedRefNo: 1,
      telecastAlertedAt: 1,
      telecastAlertSource: 1,
      opportunityRefNo: 1,
      rawGraphData: 1,
    }
  ).lean();

  const alertedKeySet = new Set();
  const refSet = new Set();
  const keyAlertedAt = new Map();
  const keyState = new Map();

  rows.forEach((row) => {
    const key = String(row?.telecastAlertedKey || '').trim() || buildNotificationKey(row);
    const ref = normalizeRefNo(String(row?.telecastAlertedRefNo || '').trim() || getTenderRefNo(row));
    const telecastAlerted = Boolean(row?.telecastAlerted);
    const alertedAt = row?.telecastAlertedAt || null;
    const telecastAlertSource = String(row?.telecastAlertSource || '').trim();

    if (key) {
      keyState.set(key, {
        telecastAlerted,
        alertedAt,
        telecastAlertSource,
      });
      if (telecastAlerted) alertedKeySet.add(key);
      if (alertedAt) keyAlertedAt.set(key, alertedAt);
    }
    if (ref && telecastAlerted) refSet.add(ref);
  });

  return { keyState, alertedKeySet, refSet, keyAlertedAt, count: rows.length };
};

const sendTelecastForRows = async ({ systemConfig, rowsToSend = [] }) => {
  if (!rowsToSend.length) {
    return {
      sent: 0,
      skipped: 'no_rows_to_send',
      staleCount: 0,
      eligibleCount: 0,
      skippedNoRecipients: 0,
      dispatchedKeys: [],
      dispatchedRefNos: [],
    };
  }
  if (!systemConfig?.telecastGraphRefreshTokenEnc) {
    return {
      sent: 0,
      skipped: 'telecast_not_connected',
      staleCount: 0,
      eligibleCount: 0,
      skippedNoRecipients: 0,
      dispatchedKeys: [],
      dispatchedRefNos: [],
    };
  }

  const groupRecipients = {
    GES: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GES || []),
    GDS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GDS || []),
    GTS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GTS || []),
  };

  const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc: systemConfig.telecastGraphRefreshTokenEnc });
  const subjectTemplate = systemConfig.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = systemConfig.telecastTemplateBody || 'New row detected for {{TENDER_NO}}';
  const staleCount = 0;
  let sent = 0;
  let skippedNoRecipients = 0;
  const dispatchedKeys = [];
  const dispatchedRefNos = [];

  for (const row of rowsToSend) {
    const group = getGroupFromOpportunity(row);
    const recipients = groupRecipients[group] || [];
    if (!recipients.length) {
      skippedNoRecipients += 1;
      continue;
    }

    const values = getTemplateValues(row);
    const subject = renderTemplate(subjectTemplate, values);
    const content = renderTemplate(bodyTemplate, values);

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content },
          toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (graphResponse.ok) {
      sent += 1;
      const key = buildNotificationKey(row);
      if (key) dispatchedKeys.push(key);
      const refNo = getTenderRefNo(row);
      if (refNo) dispatchedRefNos.push(refNo);
    }
  }

  return {
    sent,
    skipped: null,
    staleCount,
    eligibleCount: rowsToSend.length,
    skippedNoRecipients,
    dispatchedKeys: [...new Set(dispatchedKeys)],
    dispatchedRefNos: [...new Set(dispatchedRefNos)],
  };
};

const syncFromConfiguredGraph = async ({ source = 'manual_sync' } = {}) => {
  const config = await getGraphConfig();
  if (!config.driveId || !config.fileId || !config.worksheetName) {
    throw new Error('Graph config is incomplete. Please configure Share Link / Drive / File / Worksheet in admin panel.');
  }

  let tenders;
  try {
    tenders = await syncTendersFromGraph(config);
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      driveId: config.driveId || '',
      fileId: config.fileId || '',
      worksheetName: config.worksheetName || '',
      dataRange: config.dataRange || '',
      syncIntervalMinutes: config.syncIntervalMinutes || 10,
    };
    throw error;
  }
  const opportunities = await transformTendersToOpportunities(tenders);

  const systemConfig = await getSystemConfig();
  const existingTelecastState = await getExistingTelecastStateFromSyncedOpportunities();
  const previousKeys = new Set(systemConfig.notificationRowSignatures || []);
  const eligibleSignatures = opportunities
    .filter(hasRequiredRowValues)
    .map(buildNotificationKey)
    .filter(Boolean);

  const uniqueCurrentSignatures = [...new Set(eligibleSignatures)];
  const newRowSignatures = uniqueCurrentSignatures.filter((signature) => !previousKeys.has(signature));
  const signatureToOpportunity = new Map(
    opportunities
      .filter(hasRequiredRowValues) // stable key prevents "old row edited" from being treated as new
      .map((item) => [buildNotificationKey(item), item])
      .filter(([sig]) => Boolean(sig))
  );
  const newRows = newRowSignatures.map((sig) => signatureToOpportunity.get(sig)).filter(Boolean);
  const newRowsPreview = newRows.slice(0, 50).map((row) => ({
    signature: buildRowSignature(row),
    tenderNo: row?.opportunityRefNo || '',
    tenderName: row?.tenderName || '',
    client: row?.clientName || '',
    group: getGroupFromOpportunity(row),
    type: row?.opportunityClassification || '',
    dateTenderReceived: row?.dateTenderReceived || '',
    value: row?.opportunityValue ?? null,
  }));
  const now = new Date();
  const alertedKeySet = new Set([
    ...(systemConfig.telecastAlertedKeys || []),
    ...Array.from(existingTelecastState.alertedKeySet),
  ]);
  const alertedRefSet = new Set([
    ...(systemConfig.telecastAlertedRefNos || []).map((ref) => normalizeRefNo(ref)).filter(Boolean),
    ...Array.from(existingTelecastState.refSet),
  ]);
  let seededAlertBaseline = false;

  if (!systemConfig.telecastAlertSeededAt) {
    uniqueCurrentSignatures.forEach((key) => alertedKeySet.add(key));
    opportunities.forEach((opportunity) => {
      const ref = getTenderRefNo(opportunity);
      if (ref) alertedRefSet.add(ref);
    });
    systemConfig.telecastAlertSeededAt = now;
    systemConfig.telecastAlertSeededCount = uniqueCurrentSignatures.length;
    seededAlertBaseline = true;
  }

  systemConfig.notificationRowSignatures = uniqueCurrentSignatures;
  systemConfig.notificationLastCheckedAt = now;
  systemConfig.notificationLastNewRowsCount = newRowSignatures.length;
  systemConfig.notificationLastNewRows = newRowSignatures.slice(0, 50);
  systemConfig.notificationLastNewRowsPreview = newRowsPreview;
  systemConfig.telecastKeywordHelp = TELECAST_TEMPLATE_KEYWORDS;
  systemConfig.updatedBy = source;

  const telecastCandidates = newRows;
  const recentRows = telecastCandidates.filter((row) => isTenderRecentForTelecast(row, now));
  const staleCount = telecastCandidates.length - recentRows.length;
  const telecastEligiblePreview = recentRows.slice(0, 50).map((row) => ({
    signature: buildRowSignature(row),
    tenderNo: row?.opportunityRefNo || '',
    tenderName: row?.tenderName || '',
    client: row?.clientName || '',
    group: getGroupFromOpportunity(row),
    type: row?.opportunityClassification || '',
    dateTenderReceived: row?.dateTenderReceived || '',
    value: row?.opportunityValue ?? null,
  }));
  systemConfig.telecastLastEligibleRowsPreview = telecastEligiblePreview;
  const rowsToSend = recentRows.filter((row) => {
    const key = buildNotificationKey(row);
    if (!key) return false;
    const previousState = existingTelecastState.keyState.get(key);
    return !previousState?.telecastAlerted;
  });
  const alreadyAlertedCount = recentRows.length - rowsToSend.length;

  let telecastDispatch = {
    sent: 0,
    skipped: seededAlertBaseline ? 'baseline_seeded_existing_rows' : 'not_attempted',
    staleCount,
    alreadyAlertedCount,
    eligibleCount: 0,
    skippedNoRecipients: 0,
    dispatchedKeys: [],
    dispatchedRefNos: [],
  };
  try {
    if (!seededAlertBaseline) {
      telecastDispatch = await sendTelecastForRows({ systemConfig, rowsToSend });
      telecastDispatch.staleCount = staleCount;
      telecastDispatch.alreadyAlertedCount = alreadyAlertedCount;
      telecastDispatch.dispatchedKeys.forEach((key) => alertedKeySet.add(key));
      telecastDispatch.dispatchedRefNos.forEach((ref) => alertedRefSet.add(ref));
    }
  } catch (telecastError) {
    console.error('[telecast.dispatch.error]', telecastError?.message || telecastError);
    telecastDispatch = { ...telecastDispatch, sent: 0, skipped: 'error' };
  }

  const opportunitiesForInsert = opportunities.map((opportunity) => {
    const key = buildNotificationKey(opportunity);
    const ref = getTenderRefNo(opportunity);
    const previousState = key ? existingTelecastState.keyState.get(key) : null;
    const isDispatchedNow = Boolean(key && telecastDispatch.dispatchedKeys.includes(key));
    const isAlerted = seededAlertBaseline || isDispatchedNow || Boolean(previousState?.telecastAlerted) || Boolean(key && alertedKeySet.has(key));
    const historicalAlertedAt = key ? existingTelecastState.keyAlertedAt.get(key) : null;
    const telecastAlertedAt = isAlerted ? (historicalAlertedAt || now) : null;
    let telecastAlertSource = '';

    if (isAlerted) {
      if (isDispatchedNow) telecastAlertSource = 'telecast_dispatch';
      else if (seededAlertBaseline) telecastAlertSource = 'baseline_seed';
      else telecastAlertSource = previousState?.telecastAlertSource || 'history_preserved';
    }

    return {
      ...opportunity,
      telecastAlerted: isAlerted,
      telecastAlertedAt,
      telecastAlertedKey: key || '',
      telecastAlertedRefNo: ref || '',
      telecastAlertSource,
    };
  });

  await SyncedOpportunity.deleteMany({});
  const inserted = await SyncedOpportunity.insertMany(opportunitiesForInsert);
  const clientSyncResult = await syncClientsFromOpportunities(opportunities);

  config.lastSyncAt = now;
  await config.save();

  systemConfig.telecastAlertedKeys = Array.from(alertedKeySet).slice(-MAX_ALERTED_TRACKED_KEYS);
  systemConfig.telecastAlertedRefNos = Array.from(alertedRefSet).slice(-MAX_ALERTED_TRACKED_REFS);
  pushWeeklyTelecastStats(systemConfig, newRows);

  await systemConfig.save();

  console.log('[sync.new-row-detection]', JSON.stringify({
    source,
    checkedAt: now.toISOString(),
    eligibleRows: uniqueCurrentSignatures.length,
    newRows: newRowSignatures.length,
    seededAlertBaseline,
    alertedKeyCount: systemConfig.telecastAlertedKeys.length,
    alertedRefCount: systemConfig.telecastAlertedRefNos.length,
    telecastEligibleRows: telecastDispatch.eligibleCount,
    telecastStaleRows: telecastDispatch.staleCount,
    telecastAlreadyAlertedRows: telecastDispatch.alreadyAlertedCount,
    telecastNoRecipientsRows: telecastDispatch.skippedNoRecipients,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    clientsSeeded: clientSyncResult?.created || 0,
    clientsUpdated: clientSyncResult?.updated || 0,
  }));

  return {
    insertedCount: inserted.length,
    newRowsCount: newRowSignatures.length,
    newRowSignatures: newRowSignatures.slice(0, 50),
    eligibleRows: uniqueCurrentSignatures.length,
    seededAlertBaseline,
    alertedKeysTracked: systemConfig.telecastAlertedKeys.length,
    alertedRefNosTracked: systemConfig.telecastAlertedRefNos.length,
    telecastEligibleRows: telecastDispatch.eligibleCount,
    telecastStaleRows: telecastDispatch.staleCount,
    telecastAlreadyAlertedRows: telecastDispatch.alreadyAlertedCount,
    telecastNoRecipientsRows: telecastDispatch.skippedNoRecipients,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    clientsSeeded: clientSyncResult?.created || 0,
    clientsUpdated: clientSyncResult?.updated || 0,
    newRowsPreview,
  };
};

let graphAutoSyncTimer = null;
let graphAutoSyncRunning = false;

const scheduleGraphAutoSync = async () => {
  try {
    const config = await getGraphConfig();
    const intervalMinutes = Math.max(1, Number(config.syncIntervalMinutes) || 10);

    if (graphAutoSyncTimer) {
      clearInterval(graphAutoSyncTimer);
      graphAutoSyncTimer = null;
    }

    graphAutoSyncTimer = setInterval(async () => {
      if (graphAutoSyncRunning) return;
      graphAutoSyncRunning = true;
      try {
        const liveConfig = await getGraphConfig();
        if (!liveConfig.driveId || !liveConfig.fileId || !liveConfig.worksheetName) {
          console.log('ℹ️ AUTO-SYNC skipped: Graph config incomplete.');
          return;
        }
        const syncResult = await syncFromConfiguredGraph({ source: 'auto_interval' });
        console.log(`✅ AUTO-SYNC completed (${syncResult.insertedCount} records, ${syncResult.newRowsCount} new rows)`);
      } catch (error) {
        console.error('❌ AUTO-SYNC failed:', error.message);
      } finally {
        graphAutoSyncRunning = false;
      }
    }, intervalMinutes * 60 * 1000);

    console.log(`⏱️ Graph auto-sync scheduler active: every ${intervalMinutes} minute(s).`);
  } catch (error) {
    console.error('Failed to schedule graph auto-sync:', error.message);
  }
};

let dailyNotificationTimer = null;
let lastDailyNotificationRunKey = '';

const scheduleDailyNotificationCheck = () => {
  if (dailyNotificationTimer) {
    clearInterval(dailyNotificationTimer);
    dailyNotificationTimer = null;
  }

  dailyNotificationTimer = setInterval(async () => {
    const now = new Date();
    const runKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (now.getHours() !== 17 || now.getMinutes() !== 0 || lastDailyNotificationRunKey === runKey) {
      return;
    }

    try {
      const syncResult = await syncFromConfiguredGraph({ source: 'daily_5pm_notification' });
      lastDailyNotificationRunKey = runKey;
      console.log('[notification.daily-check.success]', JSON.stringify({
        runKey,
        insertedCount: syncResult.insertedCount,
        newRowsCount: syncResult.newRowsCount,
      }));
    } catch (error) {
      console.error('[notification.daily-check.failure]', JSON.stringify({
        runKey,
        message: error?.message || String(error),
      }));
    }
  }, 60 * 1000);

  console.log('⏰ Daily notification check scheduler active (17:00 server time).');
};

const getUsernameFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim().toLowerCase();
  }

  const headerUsername = req.headers['x-username'];
  if (typeof headerUsername === 'string') {
    return headerUsername.trim().toLowerCase();
  }

  return null;
};

const BOOTSTRAP_MASTER_EMAILS = new Set(
  [
    ...String(process.env.MASTER_USERS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    'arjun.s@avenirengineering.com',
  ],
);

function isBootstrapMaster(email) {
  return BOOTSTRAP_MASTER_EMAILS.has(String(email || '').trim().toLowerCase());
}

const verifyToken = async (req, res, next) => {
  try {
    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ error: 'Missing username authorization' });
    }

    const user = await AuthorizedUser.findOne({ email: username });
    if (!user) {
      return res.status(403).json({ error: 'User not authorized' });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'User access has been rejected' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'User access pending approval' });
    }

    req.user = {
      email: user.email,
      displayName: user.displayName || user.email,
      role: user.role,
      status: user.status,
      assignedGroup: user.assignedGroup || null,
      userId: user._id,
    };

    next();
  } catch (error) {
    console.error('Username verification error:', error.message);
    res.status(401).json({ error: 'Username verification failed' });
  }
};

app.post('/api/auth/verify-token', async (req, res) => {
  const requestMeta = {
    endpoint: '/api/auth/verify-token',
    method: req.method,
    ip: req.ip,
    requestId: req.headers['x-request-id'] || null,
    timestamp: new Date().toISOString(),
  };

  try {
    const rawUsername = req.body?.username || req.body?.token;
    const username = rawUsername?.toString().trim().toLowerCase();
    if (!username) {
      console.warn('[auth.verify-token.invalid-request]', JSON.stringify({
        ...requestMeta,
        reason: 'missing_username',
      }));
      return res.status(400).json({ error: 'Username is required' });
    }

    let user = await AuthorizedUser.findOne({ email: username });

    if (!user) {
      console.warn('[auth.verify-token.user-not-found]', JSON.stringify({
        ...requestMeta,
        username,
      }));

      const bootstrapMaster = isBootstrapMaster(username);
      user = new AuthorizedUser({
        email: username,
        displayName: username,
        role: bootstrapMaster ? 'Master' : 'Basic',
        status: bootstrapMaster ? 'approved' : 'pending',
      });
      await user.save();

      return res.json({
        success: true,
        user: {
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          assignedGroup: user.assignedGroup,
        },
        message: bootstrapMaster
          ? 'Login successful as bootstrap Master user.'
          : 'User pending approval. Please wait for Master to approve your access.',
      });
    }

    if (user.status === 'rejected') {
      console.warn('[auth.verify-token.user-rejected]', JSON.stringify({
        ...requestMeta,
        username,
      }));
      return res.status(403).json({ error: 'User access rejected', status: 'rejected' });
    }

    if (isBootstrapMaster(username) && (user.role !== 'Master' || user.status !== 'approved')) {
      user.role = 'Master';
      user.status = 'approved';
      await user.save();
    }

    return res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
      },
      message: user.status === 'pending' ? 'User pending approval. Master will review your request.' : 'Login successful',
    });
  } catch (error) {
    console.error('[auth.verify-token.failure]', JSON.stringify({
      ...requestMeta,
      username: req.body?.username || req.body?.token || null,
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || null,
    }));
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', verifyToken, async (req, res) => {
  try {
    const loginLog = new LoginLog({
      email: req.user.email,
      role: req.user.role,
      ipAddress: req.ip,
    });

    await loginLog.save();

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (user) {
      user.lastLogin = new Date();
      await user.save();
    }

    res.json({ success: true, message: 'Login recorded' });
  } catch (error) {
    console.error('Login record error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/user', verifyToken, async (req, res) => {
  res.json({
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role,
    status: req.user.status,
    assignedGroup: req.user.assignedGroup,
  });
});

app.get('/api/users/authorized', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin users can view this' });
    }

    const users = await AuthorizedUser.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(mapIdField));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/users/add', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can add users' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const role = String(req.body?.role || 'Basic');
    const assignedGroupRaw = req.body?.assignedGroup ? String(req.body?.assignedGroup).toUpperCase().trim() : null;
    const status = String(req.body?.status || 'approved');

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (role === 'Master') {
      return res.status(403).json({ error: 'Assigning Master is not allowed' });
    }

    if (role === 'SVP' && !assignedGroupRaw) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    if (assignedGroupRaw && !['GES', 'GDS', 'GTS'].includes(assignedGroupRaw)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
    }

    const existing = await AuthorizedUser.findOne({ email });
    if (existing?.role === 'Master' || existing?.role === 'MASTER') {
      return res.status(403).json({ error: 'Modifying Master users is not allowed' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        email,
        displayName: displayName || email,
        role,
        assignedGroup: role === 'SVP' ? assignedGroupRaw : null,
        status: ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, user: mapIdField(user.toObject ? user.toObject() : user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/approve', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can approve' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        status: 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_WORKSHEETS_FAILED'));
  }
});

app.post('/api/users/reject', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can reject' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        status: 'rejected',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_PREVIEW_FAILED'));
  }
});

app.post('/api/users/change-role', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can change roles' });
    }

    const { email, newRole, assignedGroup } = req.body;
    if (!email || !newRole) {
      return res.status(400).json({ error: 'Email and newRole are required' });
    }

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic', 'MASTER', 'PROPOSAL_HEAD'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (newRole === 'Master' || newRole === 'MASTER') {
      return res.status(403).json({ error: 'Assigning Master is not allowed' });
    }

    if (newRole === 'SVP' && !assignedGroup) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    const normalizedGroup = assignedGroup ? String(assignedGroup).toUpperCase() : null;
    if (normalizedGroup && !['GES', 'GDS', 'GTS'].includes(normalizedGroup)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
    }

    const existing = await AuthorizedUser.findOne({ email: email.toLowerCase() });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (existing.role === 'Master' || existing.role === 'MASTER') {
      return res.status(403).json({ error: 'Modifying Master users is not allowed' });
    }

    const update = { role: newRole, assignedGroup: newRole === 'SVP' ? normalizedGroup : null };
    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      update,
      { new: true }
    );

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/remove', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can remove users' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const target = await AuthorizedUser.findOne({ email: email.toLowerCase() });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'Master' || target.role === 'MASTER') {
      return res.status(403).json({ error: 'Removing Master users is not allowed' });
    }

    const result = await AuthorizedUser.deleteOne({ email: email.toLowerCase() });

    res.json({ success: true, message: 'User removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logs/cleanup', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can cleanup logs' });
    }

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const result = await LoginLog.deleteMany({ loginTime: { $lt: fifteenDaysAgo } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approvals', verifyToken, async (req, res) => {
  try {
    const approvals = await approvalDb.getApprovals();
    const approvalStates = await approvalDb.getApprovalStates();
    res.json({ approvals, approvalStates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve-proposal-head', verifyToken, async (req, res) => {
  try {
    if (!['ProposalHead', 'Master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Proposal Head or Master can approve step 1' });
    }

    const { opportunityRefNo } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    const result = await approvalDb.approveAsProposalHead(opportunityRefNo, req.user.displayName, req.user.role);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve-svp', verifyToken, async (req, res) => {
  try {
    if (!['SVP', 'Master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only SVP or Master can approve step 2' });
    }

    const { opportunityRefNo, group } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    if (req.user.role === 'SVP' && req.user.assignedGroup && group && req.user.assignedGroup !== group) {
      return res.status(403).json({ error: 'SVP can only approve assigned group tenders' });
    }

    const result = await approvalDb.approveAsSVP(opportunityRefNo, req.user.displayName, req.user.role, group || req.user.assignedGroup);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/bulk-approve', verifyToken, async (req, res) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const filters = req.body?.filters || {};

    if (action === 'proposal_head') {
      if (!['ProposalHead', 'Master'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only Tender Manager or Master can bulk approve step 1' });
      }
    } else if (action === 'svp') {
      if (!['SVP', 'Master'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only SVP or Master can bulk approve step 2' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid bulk approve action' });
    }

    const opportunities = await SyncedOpportunity.find().lean();
    let scoped = filterOpportunitiesForBulkApprove(opportunities, filters);

    if (action === 'svp' && req.user.role !== 'Master') {
      const assignedGroup = String(req.user.assignedGroup || '').toUpperCase();
      scoped = scoped.filter((opp) => String(opp.groupClassification || '').toUpperCase() === assignedGroup);
    }

    const refs = scoped.map((opp) => opp.opportunityRefNo).filter(Boolean);

    if (action === 'proposal_head') {
      const result = await approvalDb.bulkApproveAsProposalHead(refs, req.user.displayName, req.user.role);
      return res.json({ success: true, updated: result.updatedCount || 0, approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
    }

    const result = await approvalDb.bulkApproveAsSVP(refs, req.user.displayName, req.user.role, req.user.assignedGroup);
    return res.json({ success: true, updated: result.updatedCount || 0, skipped: result.skipped || [], approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/bulk-revert', verifyToken, async (req, res) => {
  try {
    if (!['ProposalHead', 'Master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Tender Manager or Master can bulk revert' });
    }

    const filters = req.body?.filters || {};
    const opportunities = await SyncedOpportunity.find().lean();
    const scoped = filterOpportunitiesForBulkApprove(opportunities, filters);
    const refs = scoped.map((opp) => opp.opportunityRefNo).filter(Boolean);

    const result = await approvalDb.bulkRevert(refs, req.user.displayName, req.user.role);
    return res.json({ success: true, updated: result.updatedCount || 0, approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/revert', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can revert approvals' });
    }

    const { opportunityRefNo } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    const result = await approvalDb.revertApproval(opportunityRefNo, req.user.displayName, req.user.role);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approval-logs', verifyToken, async (req, res) => {
  try {
    const logs = await approvalDb.getApprovalLogs();
    res.json(logs.map((log) => ({
      id: log._id?.toString(),
      opportunityRefNo: log.opportunityRefNo,
      action: log.action,
      performedBy: log.performedBy,
      performedByRole: log.performedByRole,
      group: log.group,
      timestamp: log.createdAt,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/graph/config', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view graph config' });
    }

    const config = await getGraphConfig();
    res.json(mapIdField(config.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/graph/config', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can update graph config' });
    }

    const config = await getGraphConfig();
    const { shareLink, driveId, fileId, worksheetName, dataRange, headerRowOffset, syncIntervalMinutes, fieldMapping } = req.body || {};

    if (shareLink !== undefined) config.shareLink = String(shareLink || '');
    if (driveId !== undefined) config.driveId = String(driveId || '');
    if (fileId !== undefined) config.fileId = String(fileId || '');
    if (worksheetName !== undefined) config.worksheetName = String(worksheetName || '');
    if (dataRange !== undefined) config.dataRange = String(dataRange || '');
    if (headerRowOffset !== undefined) config.headerRowOffset = Math.max(0, Number(headerRowOffset) || 0);
    if (syncIntervalMinutes !== undefined) config.syncIntervalMinutes = Number(syncIntervalMinutes) || 10;
    if (fieldMapping !== undefined && typeof fieldMapping === 'object') config.fieldMapping = fieldMapping;

    config.updatedBy = req.user.email;
    await config.save();
    await scheduleGraphAutoSync();

    res.json({ success: true, config: mapIdField(config.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/resolve-share-link', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can resolve links' });
    }

    const { shareLink } = req.body || {};
    if (!shareLink) {
      return res.status(400).json({ error: 'shareLink is required' });
    }

    const config = await getGraphConfig();
    const resolved = await resolveShareLink(shareLink, config);

    config.shareLink = shareLink;
    config.driveId = resolved.driveId;
    config.fileId = resolved.fileId;
    config.lastResolvedAt = new Date();
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, ...resolved, config: mapIdField(config.toObject()) });
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      troubleshooting: [
        ...((error.details && Array.isArray(error.details.troubleshooting)) ? error.details.troubleshooting : []),
        'Microsoft blocks resolution for personal OneDrives. Please paste Drive ID and File ID manually from the Python diagnostic tool.',
      ],
    };
    res.status(500).json(toApiError(error, 'GRAPH_RESOLVE_FAILED'));
  }
});

app.post('/api/graph/worksheets', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can list worksheets' });
    }

    const { driveId, fileId } = req.body || {};
    if (!driveId || !fileId) {
      return res.status(400).json({ error: 'driveId and fileId are required' });
    }

    const config = await getGraphConfig();
    const sheets = await getWorksheets({ driveId, fileId, config });
    res.json({ success: true, sheets });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_WORKSHEETS_FAILED'));
  }
});

app.post('/api/graph/preview-rows', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can preview worksheet rows' });
    }

    const { driveId, fileId, worksheetName, dataRange } = req.body || {};
    if (!driveId || !fileId || !worksheetName) {
      return res.status(400).json({ error: 'driveId, fileId and worksheetName are required' });
    }

    const config = await getGraphConfig();
    const rows = await getWorksheetRangeValues({
      driveId,
      fileId,
      worksheetName,
      rangeAddress: dataRange || 'B4:Z60',
      config,
    });

    res.json({
      success: true,
      rowCount: rows.length,
      previewRows: rows.slice(0, 20),
    });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_PREVIEW_FAILED'));
  }
});

app.get('/api/graph/auth/consent-url', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view consent URL' });
    }

    const loginHint = req.query?.loginHint ? String(req.query.loginHint) : '';
    const consentUrl = buildDelegatedConsentUrl({ loginHint });
    res.json({ success: true, consentUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/graph/auth/status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view auth status' });
    }

    const config = await getGraphConfig();
    res.json({
      success: true,
      authMode: config.graphAuthMode || 'application',
      accountUsername: config.graphAccountUsername || '',
      hasRefreshToken: !!config.graphRefreshTokenEnc,
      tokenUpdatedAt: config.graphTokenUpdatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/auth/bootstrap', verifyToken, async (req, res) => {
  const username = req.body?.username || '';
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can bootstrap Graph auth' });
    }

    const { password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const tokenResult = await bootstrapDelegatedToken({ username, password });
    if (!tokenResult.refreshToken) {
      return res.status(500).json({ error: 'No refresh token returned. Check Azure app delegated permissions and token settings.' });
    }

    const config = await getGraphConfig();
    config.graphAuthMode = 'delegated';
    config.graphAccountUsername = String(username).toLowerCase();
    config.graphRefreshTokenEnc = protectRefreshToken(tokenResult.refreshToken);
    config.graphTokenUpdatedAt = new Date();
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Bootstrap complete. Delegated token cached securely.', scope: tokenResult.scope, mode: 'delegated' });
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('AADSTS50076') || msg.toLowerCase().includes('mfa')) {
      return res.status(400).json({ error: 'MFA_REQUIRED', message: 'MFA is enabled. Use a non-MFA service account for bootstrap.' });
    }
    if (msg.includes('AADSTS50126')) {
      return res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }
    if (msg.includes('AADSTS50034')) {
      return res.status(400).json({ error: 'USER_NOT_FOUND', message: 'User not found in this tenant.' });
    }
    if (msg.includes('AADSTS65001')) {
      const consentUrl = buildDelegatedConsentUrl({ loginHint: username });
      return res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'This account has not granted consent to the app yet. Open consent URL and accept once, then retry bootstrap.',
        consentUrl,
      });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/graph/auth/clear', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can clear Graph auth' });
    }

    const config = await getGraphConfig();
    config.graphAuthMode = 'application';
    config.graphAccountUsername = '';
    config.graphRefreshTokenEnc = '';
    config.graphTokenUpdatedAt = null;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Delegated token cleared. Falling back to application auth.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PAGE_KEYS = [
  'dashboard',
  'opportunities',
  'clients',
  'analytics',
  'master',
  'master_general',
  'master_users',
  'master_data_sync',
  'master_telecast',
];
const ROLE_KEYS = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
const DEFAULT_PAGE_ROLE_ACCESS = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
};

const sanitizePageRoleAccess = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    const list = Array.isArray(input?.[page]) ? input[page] : DEFAULT_PAGE_ROLE_ACCESS[page];
    normalized[page] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
    if (!normalized[page].length) normalized[page] = [...DEFAULT_PAGE_ROLE_ACCESS[page]];
  }
  return normalized;
};

const getSystemConfig = async () => {
  let config = await SystemConfig.findOne();
  if (!config) config = await SystemConfig.create({});
  return config;
};

const refreshSystemConfigAlertTrackingFromSyncedOpportunities = async (config, updatedBy = '') => {
  const [keys, refs] = await Promise.all([
    SyncedOpportunity.distinct('telecastAlertedKey', { telecastAlerted: true, telecastAlertedKey: { $ne: '' } }),
    SyncedOpportunity.distinct('telecastAlertedRefNo', { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } }),
  ]);

  config.telecastAlertedKeys = keys.slice(-MAX_ALERTED_TRACKED_KEYS);
  config.telecastAlertedRefNos = refs.map((ref) => normalizeRefNo(ref)).filter(Boolean).slice(-MAX_ALERTED_TRACKED_REFS);
  if (updatedBy) config.updatedBy = updatedBy;
  await config.save();
};


app.get('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    const config = await getSystemConfig();
    const permissions = sanitizePageRoleAccess(config.pageRoleAccess || {});
    if (!config.pageRoleAccess || Object.keys(config.pageRoleAccess).length === 0) {
      config.pageRoleAccess = permissions;
      await config.save();
    }
    res.json({ success: true, permissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can update page permissions' });
    }

    const permissions = sanitizePageRoleAccess(req.body?.permissions || {});
    const config = await getSystemConfig();
    config.pageRoleAccess = permissions;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, permissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/telecast/config', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view telecast config' });
    }
    const config = await getSystemConfig();
    const groupRecipients = {
      GES: normalizeEmailList(config?.telecastGroupRecipients?.GES || []),
      GDS: normalizeEmailList(config?.telecastGroupRecipients?.GDS || []),
      GTS: normalizeEmailList(config?.telecastGroupRecipients?.GTS || []),
    };
    res.json({
      success: true,
      templateSubject: config.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}',
      templateBody: config.telecastTemplateBody || '',
      groupRecipients,
      keywords: TELECAST_TEMPLATE_KEYWORDS,
      weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/telecast/config', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can update telecast config' });
    }

    const templateSubject = String(req.body?.templateSubject || '').trim();
    const templateBody = String(req.body?.templateBody || '').trim();
    const groupRecipientsInput = req.body?.groupRecipients || {};
    const groupRecipients = {
      GES: normalizeEmailList(groupRecipientsInput.GES || []),
      GDS: normalizeEmailList(groupRecipientsInput.GDS || []),
      GTS: normalizeEmailList(groupRecipientsInput.GTS || []),
    };

    const config = await getSystemConfig();
    config.telecastTemplateSubject = templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
    config.telecastTemplateBody = templateBody || 'New row detected for {{TENDER_NO}}';
    config.telecastGroupRecipients = groupRecipients;
    config.telecastKeywordHelp = TELECAST_TEMPLATE_KEYWORDS;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, templateSubject: config.telecastTemplateSubject, templateBody: config.telecastTemplateBody, groupRecipients, keywords: TELECAST_TEMPLATE_KEYWORDS });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/telecast/auth/status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view telecast auth status' });
    }

    const config = await getSystemConfig();
    res.json({
      success: true,
      authMode: config.telecastGraphAuthMode || 'application',
      accountUsername: config.telecastGraphAccountUsername || '',
      hasRefreshToken: !!config.telecastGraphRefreshTokenEnc,
      tokenUpdatedAt: config.telecastGraphTokenUpdatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/telecast/auth/bootstrap', verifyToken, async (req, res) => {
  const username = req.body?.username || '';
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can bootstrap telecast auth' });
    }

    const { password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const tokenResult = await bootstrapDelegatedToken({ username, password });
    if (!tokenResult.refreshToken) {
      return res.status(500).json({ error: 'No refresh token returned. Check Azure app delegated permissions and token settings.' });
    }

    const config = await getSystemConfig();
    config.telecastGraphAuthMode = 'delegated';
    config.telecastGraphAccountUsername = String(username).toLowerCase();
    config.telecastGraphRefreshTokenEnc = protectRefreshToken(tokenResult.refreshToken);
    config.telecastGraphTokenUpdatedAt = new Date();
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Telecast auth connected successfully.', mode: 'delegated' });
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('AADSTS50076') || msg.toLowerCase().includes('mfa')) {
      return res.status(400).json({ error: 'MFA_REQUIRED', message: 'MFA is enabled. Use a non-MFA service account for telecast bootstrap.' });
    }
    if (msg.includes('AADSTS50126')) {
      return res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }
    if (msg.includes('AADSTS50034')) {
      return res.status(400).json({ error: 'USER_NOT_FOUND', message: 'User not found in this tenant.' });
    }
    if (msg.includes('AADSTS65001')) {
      const consentUrl = buildDelegatedConsentUrl({ loginHint: username });
      return res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'This account has not granted consent to the app yet. Open consent URL and accept once, then retry telecast connect.',
        consentUrl,
      });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/telecast/auth/clear', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can clear telecast auth' });
    }

    const config = await getSystemConfig();
    config.telecastGraphAuthMode = 'application';
    config.telecastGraphAccountUsername = '';
    config.telecastGraphRefreshTokenEnc = '';
    config.telecastGraphTokenUpdatedAt = null;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Telecast delegated token cleared.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view notification status' });
    }

    const config = await getSystemConfig();
    const alertedTracked = await SyncedOpportunity.countDocuments({ telecastAlerted: true });
    const alertedKeysTracked = await SyncedOpportunity.distinct('telecastAlertedKey', { telecastAlerted: true, telecastAlertedKey: { $ne: '' } });
    const alertedPreviewRows = await SyncedOpportunity.find(
      { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } },
      { telecastAlertedRefNo: 1, telecastAlertedAt: 1 }
    ).sort({ telecastAlertedAt: -1 }).limit(50).lean();
    const alertedRefNosPreview = alertedPreviewRows
      .map((row) => normalizeRefNo(row?.telecastAlertedRefNo || ''))
      .filter(Boolean);

    res.json({
      success: true,
      lastCheckedAt: config.notificationLastCheckedAt || null,
      lastNewRowsCount: Number(config.notificationLastNewRowsCount || 0),
      lastNewRows: Array.isArray(config.notificationLastNewRows) ? config.notificationLastNewRows : [],
      lastNewRowsPreview: Array.isArray(config.notificationLastNewRowsPreview) ? config.notificationLastNewRowsPreview : [],
      trackedRows: Array.isArray(config.notificationRowSignatures) ? config.notificationRowSignatures.length : 0,
      alertWindowDays: TELECAST_RECENT_WINDOW_DAYS,
      alertSeededAt: config.telecastAlertSeededAt || null,
      alertSeededCount: Number(config.telecastAlertSeededCount || 0),
      alertedKeysTracked: alertedKeysTracked.length,
      alertedRefNosTracked: alertedTracked,
      alertedRefNosPreview,
      telecastEligibleRowsPreview: Array.isArray(config.telecastLastEligibleRowsPreview) ? config.telecastLastEligibleRowsPreview : [],
      weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/alerted', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view alerted tenders' });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 200));
    const q = normalizeRefNo(req.query?.q || '');
    const config = await getSystemConfig();
    const rows = await SyncedOpportunity.find(
      { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } },
      { telecastAlertedRefNo: 1, telecastAlertedAt: 1 }
    ).sort({ telecastAlertedAt: -1 }).lean();

    let refs = rows.map((row) => normalizeRefNo(row?.telecastAlertedRefNo || '')).filter(Boolean);
    refs = [...new Set(refs)];
    if (q) refs = refs.filter((ref) => ref.includes(q));

    res.json({
      success: true,
      total: refs.length,
      limit,
      alertSeededAt: config.telecastAlertSeededAt || null,
      refs: refs.slice(-limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/mark-all-alerted', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can bulk update telecast alert flags' });
    }

    const now = new Date();
    const result = await SyncedOpportunity.updateMany(
      {},
      {
        $set: {
          telecastAlerted: true,
          telecastAlertedAt: now,
          telecastAlertSource: 'manual_bulk_true',
        },
      }
    );

    const config = await getSystemConfig();
    config.telecastAlertSeededAt = config.telecastAlertSeededAt || now;
    config.telecastAlertSeededCount = Math.max(Number(config.telecastAlertSeededCount || 0), Number(result.modifiedCount || 0));
    await refreshSystemConfigAlertTrackingFromSyncedOpportunities(config, `mark_all_alerted:${req.user.email}`);

    res.json({
      success: true,
      matchedCount: Number(result.matchedCount || 0),
      modifiedCount: Number(result.modifiedCount || 0),
      message: 'All synced tenders marked as telecastAlerted=true',
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to mark all tenders as alerted' });
  }
});

app.post('/api/notifications/mark-unalerted', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can selectively mark telecast alerts false' });
    }

    const inputRefNos = Array.isArray(req.body?.refNos) ? req.body.refNos : [];
    const refNos = [...new Set(inputRefNos.map((ref) => normalizeRefNo(ref)).filter(Boolean))];
    if (!refNos.length) {
      return res.status(400).json({ error: 'refNos array is required' });
    }

    const result = await SyncedOpportunity.updateMany(
      { telecastAlertedRefNo: { $in: refNos } },
      {
        $set: {
          telecastAlerted: false,
          telecastAlertedAt: null,
          telecastAlertSource: 'manual_selective_false',
        },
      }
    );

    const config = await getSystemConfig();
    await refreshSystemConfigAlertTrackingFromSyncedOpportunities(config, `mark_unalerted:${req.user.email}`);

    res.json({
      success: true,
      selectedRefNos: refNos.length,
      matchedCount: Number(result.matchedCount || 0),
      modifiedCount: Number(result.modifiedCount || 0),
      message: 'Selected tenders marked as telecastAlerted=false',
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to selectively mark tenders unalerted' });
  }
});

app.post('/api/notifications/force-refresh', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can force notification refresh' });
    }

    const syncResult = await syncFromConfiguredGraph({ source: `force_refresh:${req.user.email}` });
    res.json({
      success: true,
      message: `Force refresh complete. ${syncResult.newRowsCount} new rows detected.`,
      insertedCount: syncResult.insertedCount,
      newRowsCount: syncResult.newRowsCount,
      newRowSignatures: syncResult.newRowSignatures,
      eligibleRows: syncResult.eligibleRows,
    });
  } catch (error) {
    res.status(500).json(toApiError(error, 'NOTIFICATION_FORCE_REFRESH_FAILED'));
  }
});

app.post('/api/telecast/test-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send test mail' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    if (!config.telecastGraphRefreshTokenEnc) {
      return res.status(400).json({ error: 'Telecast account not connected. Configure Telecast auth first.' });
    }

    const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc: config.telecastGraphRefreshTokenEnc });
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: 'Hello from Dashboard',
          body: {
            contentType: 'Text',
            content: 'Hello from Dashboard',
          },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, message: `Test mail sent to ${recipientEmail}` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send test mail' });
  }
});

app.post('/api/issue-reports', verifyToken, async (req, res) => {
  try {
    const issueTypes = Array.isArray(req.body?.issueTypes) ? req.body.issueTypes.filter(Boolean) : [];
    const feature = String(req.body?.feature || '').trim();
    const featureOther = String(req.body?.featureOther || '').trim();
    const summary = String(req.body?.summary || '').trim();
    const steps = String(req.body?.steps || '').trim();
    const comments = String(req.body?.comments || '').trim();
    const page = String(req.body?.page || '').trim();

    if (!issueTypes.length) {
      return res.status(400).json({ error: 'At least one issue type is required' });
    }
    if (!feature) {
      return res.status(400).json({ error: 'Feature is required' });
    }
    if (feature.toLowerCase() === 'other' && !featureOther) {
      return res.status(400).json({ error: 'Feature (other) is required' });
    }
    if (!comments) {
      return res.status(400).json({ error: 'Comments are required' });
    }

    const masters = await AuthorizedUser.find({
      role: { $in: ['Master', 'MASTER'] },
      status: 'approved',
    }).lean();
    const recipients = masters.map((user) => String(user.email || '').trim()).filter(Boolean);
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No Master recipients configured' });
    }

    const config = await getSystemConfig();
    const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
    if (!graphRefreshTokenEnc) {
      return res.status(400).json({ error: 'Mail service is not configured' });
    }

    const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });
    const featureLabel = feature.toLowerCase() === 'other' ? featureOther : feature;
    const subject = `Issue report: ${featureLabel} · ${issueTypes.join(', ')}`;
    const reportedAt = new Date().toISOString();
    const escapeHtml = (value = '') => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const safeReporter = escapeHtml(req.user.displayName || req.user.email || 'Unknown');
    const safeRole = escapeHtml(req.user.role || 'Unknown');
    const safeEmail = escapeHtml(req.user.email || 'Unknown');
    const safePage = escapeHtml(page || 'Unknown');
    const safeTime = escapeHtml(reportedAt);
    const safeIssueTypes = issueTypes.map((item) => escapeHtml(item)).join(', ');
    const safeFeature = escapeHtml(featureLabel);
    const safeSummary = escapeHtml(summary);
    const safeSteps = escapeHtml(steps);
    const safeComments = escapeHtml(comments);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="margin: 0 0 12px; color: #0f172a;">Issue Report</h2>
        <p style="margin: 0 0 16px;">A new issue report was submitted.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 680px;">
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Reporter</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeReporter} (${safeRole})</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Email</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeEmail}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Page</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safePage}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Time (UTC)</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeTime}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Issue Type(s)</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeIssueTypes}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Feature</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeFeature}</td>
          </tr>
          ${summary ? `<tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Summary</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${safeSummary}</td>
          </tr>` : ''}
          ${steps ? `<tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Steps to Reproduce</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${safeSteps}</pre></td>
          </tr>` : ''}
          <tr>
            <th style="text-align: left; padding: 8px; background: #f1f5f9; border: 1px solid #e2e8f0;">Comments</th>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${safeComments}</pre></td>
          </tr>
        </table>
      </div>
    `;

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, recipients: recipients.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send issue report' });
  }
});

app.post('/api/opportunities/sync-graph', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_SYNC_FAILED'));
  }
});

app.post('/api/opportunities/sync-graph/auto', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_AUTOSYNC_FAILED'));
  }
});

// Backward-compatible aliases
app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }
    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_SYNC_FAILED'));
  }
});

app.post('/api/opportunities/sync-sheets/auto', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }
    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_AUTOSYNC_FAILED'));
  }
});

app.get('/api/opportunities', async (req, res) => {
  try {
    const opportunities = await SyncedOpportunity.find().sort({ createdAt: -1 }).lean();
    const mapped = opportunities.map(opp => mapIdField(opp));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients', async (_req, res) => {
  try {
    const clients = await Client.find().sort({ updatedAt: -1 }).lean();
    res.json(clients.map((client) => mapIdField(client)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const payload = req.body || {};
    const companyName = normalizeCompanyName(payload.companyName || '');
    if (!companyName) return res.status(400).json({ error: 'Company name is required' });
    const companyKey = normalizeCompanyKey(companyName);
    const incomingContacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const group = String(payload.group || payload.groupClassification || '').trim();

    const existing = await Client.findOne({ companyKey });
    if (!existing) {
      const created = await Client.create({
        companyName,
        companyKey,
        group,
        domain: String(payload.domain || '').trim(),
        location: {
          city: String(payload.city || payload.location?.city || '').trim(),
          country: String(payload.country || payload.location?.country || '').trim(),
        },
        contacts: mergeContacts([], incomingContacts),
      });
      return res.json(mapIdField(created.toObject()));
    }

    existing.companyName = companyName;
    if (group) existing.group = group;
    existing.domain = String(payload.domain || existing.domain || '').trim();
    existing.location = {
      city: String(payload.city || existing.location?.city || '').trim(),
      country: String(payload.country || existing.location?.country || '').trim(),
    };
    existing.contacts = mergeContacts(existing.contacts, incomingContacts);
    await existing.save();

    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients/import', async (req, res) => {
  try {
    const inputs = Array.isArray(req.body?.clients) ? req.body.clients : [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const input of inputs) {
      const companyName = normalizeCompanyName(input?.companyName || '');
      if (!companyName) continue;
      const companyKey = normalizeCompanyKey(companyName);
      const incomingContacts = Array.isArray(input?.contacts) ? input.contacts : [];
      const group = String(input?.group || input?.groupClassification || '').trim();
      const existing = await Client.findOne({ companyKey });
      if (!existing) {
        await Client.create({
          companyName,
          companyKey,
          group,
          domain: String(input?.domain || '').trim(),
          location: {
            city: String(input?.city || input?.location?.city || '').trim(),
            country: String(input?.country || input?.location?.country || '').trim(),
          },
          contacts: mergeContacts([], incomingContacts),
        });
        createdCount += 1;
      } else {
        existing.companyName = companyName;
        if (group) existing.group = group;
        existing.domain = String(input?.domain || existing.domain || '').trim();
        existing.location = {
          city: String(input?.city || existing.location?.city || '').trim(),
          country: String(input?.country || existing.location?.country || '').trim(),
        };
        existing.contacts = mergeContacts(existing.contacts, incomingContacts);
        await existing.save();
        updatedCount += 1;
      }
    }

    res.json({ success: true, created: createdCount, updated: updatedCount, imported: createdCount + updatedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients/seed', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can seed clients' });
    }
    const opportunities = await SyncedOpportunity.find().lean();
    const result = await syncClientsFromOpportunities(opportunities);
    res.json({ success: true, created: result.created || 0, updated: result.updated || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/stats', verifyToken, async (req, res) => {
  try {
    const opportunities = await SyncedOpportunity.find().lean();
    const totalTenders = opportunities.length;
    const totalValue = opportunities.reduce((sum, opp) => sum + (opp.opportunityValue || 0), 0);
    const lastSync = opportunities[0]?.syncedAt || null;
    const statusDistribution = opportunities.reduce((acc, opp) => {
      const key = opp.avenirStatus || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({ totalTenders, totalValue, lastSync, statusDistribution });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/generate-report', async (req, res) => {
  try {
    const body = req.body || {};
    const data = Array.isArray(body.data) ? body.data : [];
    const filters = body.filters || {};

    const summary = calculateSummaryStats(data);
    const funnel = calculateFunnelData(data);
    const clients = getClientData(data);

    const totalOpportunities = data.length;
    const generatedAt = new Date().toLocaleString();

    const activeFilters = [
      filters.search ? `Search: ${filters.search}` : '',
      Array.isArray(filters.statuses) && filters.statuses.length ? `Statuses: ${filters.statuses.join(', ')}` : '',
      Array.isArray(filters.groups) && filters.groups.length ? `Verticals: ${filters.groups.join(', ')}` : '',
      Array.isArray(filters.leads) && filters.leads.length ? `Leads: ${filters.leads.join(', ')}` : '',
      Array.isArray(filters.clients) && filters.clients.length ? `Clients: ${filters.clients.join(', ')}` : '',
      filters.datePreset && filters.datePreset !== 'all' ? `Date preset: ${filters.datePreset}` : '',
      filters.showAtRisk ? 'At risk only' : '',
      filters.showMissDeadline ? 'Miss deadline only' : '',
    ].filter(Boolean);

    const children = [
      new Paragraph({
        text: 'SALES PIPELINE ANALYTICS REPORT',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: 'Comprehensive Sales Intelligence & Market Insights',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: `Generated: ${generatedAt} | Total Opportunities: ${totalOpportunities}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: 'Report Filters',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        text: `Applied Filters: ${activeFilters.length ? activeFilters.join(' • ') : 'None (all data shown)'}`,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: 'Key Business Metrics',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Total Opportunities' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Won' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Lost' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'At Risk' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Active Pipeline' })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders, children: [new Paragraph({ text: String(totalOpportunities) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(summary.wonCount) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(summary.lostCount) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(summary.atRiskCount) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(summary.totalActive) })] }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({
        text: `Executive Summary: Currently tracking ${summary.totalActive} active opportunities. Successfully closed ${summary.wonCount} deals while ${summary.lostCount} opportunities were lost. ${summary.atRiskCount} opportunities require immediate attention due to approaching submission deadlines.`,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: 'Opportunity Status Breakdown',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Status' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Count' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Description' })] }),
            ],
          }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '✅ Working' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.workingCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Active Negotiations' })] })] }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '🏆 Awarded' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.awardedCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Won Deals' })] })] }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '❌ Lost' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.lostCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Lost Opportunities' })] })] }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '📋 Regretted' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.regrettedCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Declined Bids' })] })] }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '🚀 To Start' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.toStartCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Pipeline Queue' })] })] }),
          new TableRow({ children: [new TableCell({ borders, children: [new Paragraph({ text: '⏱️ At Risk' })] }), new TableCell({ borders, children: [new Paragraph({ text: String(summary.atRiskCount) })] }), new TableCell({ borders, children: [new Paragraph({ text: 'Urgent Action' })] })] }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({ text: 'Sales Funnel Analysis', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Pipeline Stage' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Opportunities' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Total Value' })] }),
            ],
          }),
          ...funnel.map((row) => new TableRow({
            children: [
              new TableCell({ borders, children: [new Paragraph({ text: row.stage })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(row.count) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: `$${(row.value / 1000000).toFixed(2)}M` })] }),
            ],
          })),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({ text: 'Top 10 Clients by Pipeline Value', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Client Name' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Opportunities' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Submitted Value' })] }),
              new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Ranking' })] }),
            ],
          }),
          ...clients.map((row, i) => new TableRow({
            children: [
              new TableCell({ borders, children: [new Paragraph({ text: row.name })] }),
              new TableCell({ borders, children: [new Paragraph({ text: String(row.count) })] }),
              new TableCell({ borders, children: [new Paragraph({ text: `$${(row.value / 1000000).toFixed(2)}M` })] }),
              new TableCell({ borders, children: [new Paragraph({ text: `#${i + 1}` })] }),
            ],
          })),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({
        text: 'This report is generated automatically from your Sales Pipeline Management System.',
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
      }),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="sales-analytics-report-${new Date().toISOString().slice(0, 10)}.docx"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('✅ Server running on http://localhost:' + PORT);
});
