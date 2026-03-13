import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import approvalDb from './approvalDb.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import Approval from './models/Approval.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import LoginLog from './models/LoginLog.js';
import Client from './models/Client.js';
import Vendor from './models/Vendor.js';
import MailSchedule from './models/MailSchedule.js';
import MailScheduleRun from './models/MailScheduleRun.js';
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

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://opportunitydash.onrender.com',
];
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = configuredCorsOrigins.length ? configuredCorsOrigins : DEFAULT_CORS_ORIGINS;

const isCorsOriginAllowed = (origin, req) => {
  if (!origin) return true; // Non-browser clients or same-origin requests without Origin header.
  if (allowedCorsOrigins.includes(origin)) return true;
  const host = req.headers.host;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  return false;
};

app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  const allowed = isCorsOriginAllowed(origin, req);
  callback(null, { origin: allowed });
}));

const createRateLimiter = ({ windowMs, max, keyPrefix }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}`;
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    if (Math.random() < 0.01) {
      for (const [storedKey, stored] of hits.entries()) {
        if (now - stored.start >= windowMs) hits.delete(storedKey);
      }
    }
    return next();
  };
};

const authRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, keyPrefix: 'auth' });
const privilegedRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120, keyPrefix: 'priv' });

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (req.path.startsWith('/api/health') || req.path.startsWith('/healthz')) return next();
  if (req.method === 'GET') return next();
  return privilegedRateLimiter(req, res, next);
});

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
    scheduleMailDispatch();
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

const getMergedReportStatus = (item = {}) => {
  const rawStatus = item.tenderResult || item.avenirStatus || item.canonicalStage || item.status || '';
  return String(rawStatus || '').trim().toUpperCase();
};

const calculateSummaryStats = (data = []) => {
  const canonicalStage = (item) => String(item?.canonicalStage || '').trim().toUpperCase();
  const awardedCount = data.filter((item) => canonicalStage(item) === 'AWARDED').length;
  const lostCount = data.filter((item) => getMergedReportStatus(item) === 'LOST').length;
  const regrettedCount = data.filter((item) => canonicalStage(item) === 'REGRETTED').length;
  const workingCount = data.filter((item) => canonicalStage(item) === 'WORKING').length;
  const toStartCount = data.filter((item) => canonicalStage(item) === 'TO START').length;
  const atRiskCount = data.filter((item) => Boolean(item?.isAtRisk || item?.atRisk)).length;
  const totalActive = data.filter((item) => ['WORKING', 'SUBMITTED', 'AWARDED'].includes(canonicalStage(item))).length;

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

const getRecentTenderData = (data = []) => {
  return [...data]
    .sort((a, b) => {
      const aTime = parseDateValue(a?.dateTenderReceived || a?.createdAt)?.getTime() || 0;
      const bTime = parseDateValue(b?.dateTenderReceived || b?.createdAt)?.getTime() || 0;
      return bTime - aTime;
    })
    .map((item) => ({
      refNo: item?.opportunityRefNo || item?.tenderNo || '—',
      tenderName: item?.tenderName || 'Untitled Tender',
      clientName: item?.clientName || '—',
      receivedDate: item?.dateTenderReceived || item?.createdAt || '',
      status: getMergedReportStatus(item) || 'UNSPECIFIED',
      lead: item?.internalLead || '—',
    }))
    .slice(0, 5);
};

const formatDateForReport = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return String(value || '—');
  return parsed.toLocaleDateString('en-GB');
};

const REPORT_COLORS = {
  navy: '0f172a',
  blue: '1d4ed8',
  blueSoft: 'dbeafe',
  slate: 'e2e8f0',
  slateSoft: 'f8fafc',
  greenSoft: 'dcfce7',
  amberSoft: 'fef3c7',
  redSoft: 'fee2e2',
  white: 'ffffff',
};

const createReportHeaderCell = (text, fill = REPORT_COLORS.slate) => new TableCell({
  borders,
  shading: { fill, type: ShadingType.CLEAR },
  children: [new Paragraph({ text })],
});

const createReportValueCell = (text, fill) => new TableCell({
  borders,
  ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
  children: [new Paragraph({ text: String(text) })],
});

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

const splitStringList = (value = []) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((entry) => String(entry || '').trim()).filter(Boolean))];
};

const normalizeAgreementStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'nda') return 'NDA';
  if (normalized === 'association agreement' || normalized === 'association') return 'Association Agreement';
  return 'Pending';
};

const buildVendorPayload = (input = {}) => {
  const companyName = normalizeCompanyName(input.companyName || '');
  return {
    companyName,
    companyKey: normalizeCompanyKey(companyName),
    primaryIndustries: splitStringList(input.primaryIndustries),
    confirmedServices: splitStringList(input.confirmedServices),
    confirmedTechStack: splitStringList(input.confirmedTechStack),
    nonSpecializedTechStack: splitStringList(input.nonSpecializedTechStack),
    sampleProjects: splitStringList(input.sampleProjects),
    certifications: splitStringList(input.certifications),
    partners: splitStringList(input.partners),
    companySize: String(input.companySize || '').trim(),
    sources: splitStringList(input.sources),
    focusArea: String(input.focusArea || '').trim(),
    agreementStatus: normalizeAgreementStatus(input.agreementStatus),
    agreementDocuments: splitStringList(input.agreementDocuments),
    contactPerson: String(input.contactPerson || '').trim(),
    emails: splitStringList(input.emails).map((email) => email.toLowerCase()),
  };
};

const DUMMY_VENDOR_KEYS = [
  'blue ridge analytics',
  'northstar systems',
  'crescent cyber labs',
  'vertex automation works',
  'helix cloud engineering',
  'atlas gis solutions',
];

let vendorCleanupPromise = null;
const cleanupDummyVendors = async () => {
  if (!vendorCleanupPromise) {
    vendorCleanupPromise = Vendor.deleteMany({ companyKey: { $in: DUMMY_VENDOR_KEYS } }).catch((error) => {
      vendorCleanupPromise = null;
      throw error;
    });
  }
  return vendorCleanupPromise;
};

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
  const status = normalizeFilterValue(filters.status || '');

  return opportunities.filter((opportunity) => {
    if (group && normalizeFilterValue(opportunity.groupClassification || '') !== group) return false;
    if (lead && normalizeFilterValue(opportunity.internalLead || '') !== lead) return false;
    if (client && normalizeFilterValue(opportunity.clientName || '') !== client) return false;
    if (submitter) {
      const submittedBy = getSubmitterFromOpportunity(opportunity);
      if (normalizeFilterValue(submittedBy) !== submitter) return false;
    }

    if (status) {
      const mergedStatus = normalizeFilterValue(getMergedReportStatus(opportunity));
      const canonicalStage = normalizeFilterValue(opportunity?.canonicalStage || opportunity?.status || '');
      if (mergedStatus !== status && canonicalStage !== status) return false;
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
  '{{TENDER_NO}}', '{{TENDER_NAME}}', '{{CLIENT}}', '{{GROUP}}', '{{TENDER_TYPE}}', '{{DATE_TENDER_RECD}}', '{{YEAR}}', '{{LEAD}}', '{{OPPORTUNITY_ID}}', '{{COMMENTS}}',
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

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const nl2br = (value = '') => escapeHtml(value).replace(/\n/g, '<br />');

const TELECAST_TEMPLATE_STYLES = {
  avenir_blue: {
    key: 'avenir_blue',
    label: 'Avenir Blue',
    description: 'Deep navy header with blue summary styling.',
    colors: {
      pageBg: '#f8fafc',
      cardBorder: '#dbeafe',
      headerBg: '#0f172a',
      headerGradient: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%)',
      summaryBg: '#eff6ff',
      summaryBorder: '#bfdbfe',
      summaryText: '#1e3a8a',
      tableHeaderBg: '#f8fafc',
      tableHeaderText: '#475569',
      tableRowAlt: '#f8fafc',
    },
  },
  emerald_signal: {
    key: 'emerald_signal',
    label: 'Emerald Signal',
    description: 'Green alert palette for softer operational notifications.',
    colors: {
      pageBg: '#f0fdf4',
      cardBorder: '#bbf7d0',
      headerBg: '#14532d',
      headerGradient: 'linear-gradient(135deg,#14532d 0%,#059669 100%)',
      summaryBg: '#ecfdf5',
      summaryBorder: '#86efac',
      summaryText: '#166534',
      tableHeaderBg: '#f0fdf4',
      tableHeaderText: '#166534',
      tableRowAlt: '#f7fee7',
    },
  },
  sunset_alert: {
    key: 'sunset_alert',
    label: 'Sunset Alert',
    description: 'Warm amber/orange palette for high-visibility tender alerts.',
    colors: {
      pageBg: '#fff7ed',
      cardBorder: '#fed7aa',
      headerBg: '#7c2d12',
      headerGradient: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 100%)',
      summaryBg: '#ffedd5',
      summaryBorder: '#fdba74',
      summaryText: '#9a3412',
      tableHeaderBg: '#fff7ed',
      tableHeaderText: '#9a3412',
      tableRowAlt: '#fffaf0',
    },
  },
};

const getTelecastTemplateStyle = (styleKey = '') =>
  TELECAST_TEMPLATE_STYLES[String(styleKey || '').trim()] || TELECAST_TEMPLATE_STYLES.avenir_blue;

const buildTelecastEmailHtml = ({ values, renderedBody = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = [
    ['Tender Ref', values.TENDER_NO || '—'],
    ['Tender Name', values.TENDER_NAME || '—'],
    ['Client', values.CLIENT || '—'],
    ['Group', values.GROUP || '—'],
    ['Tender Type', values.TENDER_TYPE || '—'],
    ['Date Received', values.DATE_TENDER_RECD || '—'],
    ['Lead', values.LEAD || '—'],
  ];

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">&#9888; Tender Alert</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A new tender row was detected and matched your telecast rules.</p>
        </div>
        <div style="padding:24px 28px;">
          ${renderedBody ? `<div style="margin-bottom:18px;font-size:14px;line-height:1.7;color:#334155;">${nl2br(renderedBody)}</div>` : ''}
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:10px;">Summary</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <tbody>
                ${rows.map(([label, value], index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <th style="width:32%;padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};background:${colors.tableHeaderBg};border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(label)}</th>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(value)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
};

const buildIssueReportEmailHtml = ({
  styleKey = 'avenir_blue',
  reporter = '',
  role = '',
  email = '',
  page = '',
  reportedAt = '',
  issueTypes = '',
  feature = '',
  summary = '',
  steps = '',
  comments = '',
}) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Reporting</div>
          <h2 style="margin:0;font-size:24px;line-height:1.2;">Issue Report</h2>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A new issue report was submitted from the dashboard.</p>
        </div>
        <div style="padding:24px 28px;">
          <table style="border-collapse:collapse;width:100%;max-width:704px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Reporter</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${reporter} (${role})</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Email</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${email}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Page</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${page}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Time (UTC)</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${reportedAt}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Issue Type(s)</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${issueTypes}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Feature</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${feature}</td>
            </tr>
            ${summary ? `<tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Summary</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${summary}</td>
            </tr>` : ''}
            ${steps ? `<tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Steps to Reproduce</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;"><div style="white-space:pre-wrap;line-height:1.7;">${steps}</div></td>
            </tr>` : ''}
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Comments</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;"><div style="white-space:pre-wrap;line-height:1.7;">${comments}</div></td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
};

const buildApprovalAlertEmailHtml = ({ values, renderedBody = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = [
    ['Tender Ref', values.TENDER_NO || '—'],
    ['Tender Name', values.TENDER_NAME || '—'],
    ['Client', values.CLIENT || '—'],
    ['Group', values.GROUP || '—'],
    ['Tender Type', values.TENDER_TYPE || '—'],
    ['Date Received', values.DATE_TENDER_RECD || '—'],
    ['Lead', values.LEAD || '—'],
  ];

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Approval Alert</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A tender has been approved by the Tender Manager and is ready for SVP review.</p>
        </div>
        <div style="padding:24px 28px;">
          ${renderedBody ? `<div style="margin-bottom:18px;font-size:14px;line-height:1.7;color:#334155;">${nl2br(renderedBody)}</div>` : ''}
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:10px;">Summary</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <tbody>
                ${rows.map(([label, value], index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <th style="width:32%;padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};background:${colors.tableHeaderBg};border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(label)}</th>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(value)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
};

const formatIsoDate = (value) => {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toISOString().slice(0, 10) : '—';
};

const buildBulkApprovalAlertEmailHtml = ({ group = '', opportunities = [], summaryText = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = opportunities.map((opp) => ({
    tenderNo: opp?.opportunityRefNo || opp?.rawGraphData?.rowSnapshot?.['TENDER NO'] || '—',
    tenderName: opp?.tenderName || opp?.rawGraphData?.rowSnapshot?.['TENDER NAME'] || '—',
    client: opp?.clientName || opp?.rawGraphData?.rowSnapshot?.CLIENT || '—',
    lead: opp?.internalLead || opp?.rawGraphData?.rowSnapshot?.LEAD || '—',
    received: formatIsoDate(getTenderReceivedDate(opp)),
  }));

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Bulk Approval</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">${summaryText || `Tenders approved for ${escapeHtml(group || 'Group')}`}</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:12px;">Approved Tenders (${rows.length})</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Ref</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Name</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Client</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Lead</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Date Received</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row, index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.tenderNo)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.tenderName)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.client)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.lead)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.received)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
};

const sendApprovalAlertForOpportunity = async ({ opportunity, approvedBy = '' }) => {
  const config = await getSystemConfig();
  if (!config.approvalAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const group = getGroupFromOpportunity(opportunity);
  if (!group) {
    return { success: true, skipped: 'no_group' };
  }

  const recipients = await AuthorizedUser.find({
    role: { $in: ['SVP'] },
    status: 'approved',
    assignedGroup: group,
  }).lean();
  const recipientEmails = normalizeEmailList(recipients.map((user) => user.email));
  if (!recipientEmails.length) {
    return { success: true, skipped: 'no_recipients' };
  }

  const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
  if (!graphRefreshTokenEnc) {
    return { success: true, skipped: 'mail_not_configured' };
  }

  const values = {
    ...getTemplateValues(opportunity),
    COMMENTS: approvedBy ? `Approved by Tender Manager: ${approvedBy}` : getTemplateValues(opportunity).COMMENTS,
  };
  const subjectTemplate = config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.';
  const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
  const subject = renderTemplate(subjectTemplate, values);
  const renderedBody = renderTemplate(bodyTemplate, values);
  const html = buildApprovalAlertEmailHtml({ values, renderedBody, styleKey: style.key });
  const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });

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
        toRecipients: recipientEmails.map((email) => ({ emailAddress: { address: email } })),
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const payload = await graphResponse.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
  }

  return { success: true, recipients: recipientEmails.length };
};

const buildDateRangeForOpportunities = (opportunities = [], filters = {}) => {
  const explicitFrom = parseDateValue(filters?.dateFrom);
  const explicitTo = parseDateValue(filters?.dateTo);
  const receivedDates = opportunities
    .map((opp) => getTenderReceivedDate(opp))
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const start = explicitFrom || receivedDates[0] || null;
  const end = explicitTo || (receivedDates.length ? receivedDates[receivedDates.length - 1] : null);
  const format = (value) => (value ? value.toISOString().slice(0, 10) : '—');

  return {
    start,
    end,
    text: start || end ? `${format(start)} to ${format(end || start)}` : 'recent period',
  };
};

const sendBulkApprovalAlerts = async ({ opportunities = [], approvedBy = '', filters = {} }) => {
  if (!opportunities.length) return { success: true, skipped: 'no_new_opportunities' };

  const config = await getSystemConfig();
  if (!config.approvalAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
  if (!graphRefreshTokenEnc) {
    return { success: true, skipped: 'mail_not_configured' };
  }

  const grouped = opportunities.reduce((acc, opp) => {
    const group = getGroupFromOpportunity(opp);
    if (!group || group === 'UNKNOWN') return acc;
    if (!acc[group]) acc[group] = [];
    acc[group].push(opp);
    return acc;
  }, {});

  const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });
  const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
  const results = {};

  for (const [group, groupOpps] of Object.entries(grouped)) {
    const recipients = await AuthorizedUser.find({
      role: { $in: ['SVP'] },
      status: 'approved',
      assignedGroup: group,
    }).lean();
    const recipientEmails = normalizeEmailList(recipients.map((user) => user.email));
    if (!recipientEmails.length) {
      results[group] = { success: true, skipped: 'no_recipients' };
      continue;
    }

    const { text: rangeText } = buildDateRangeForOpportunities(groupOpps, filters);
    const count = groupOpps.length;
    const subject = `Tender Manager Bulk Approval: ${group} (${count} tenders)`;

    let html;
    if (count > 10) {
      const summary = `${approvedBy || 'Tender Manager'} approved ${count} tenders for ${group} (received ${rangeText}).`;
      html = `
        <div style="margin:0;padding:24px;background:${style.colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${style.colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
            <div style="padding:24px 28px;background-color:${style.colors.headerBg};background:${style.colors.headerGradient};color:#ffffff;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
              <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Bulk Approval</h1>
            </div>
            <div style="padding:24px 28px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(summary)}</div>
          </div>
        </div>
      `;
    } else {
      const summaryText = `${approvedBy || 'Tender Manager'} approved ${count} tender${count === 1 ? '' : 's'} for ${group} (received ${rangeText}).`;
      html = buildBulkApprovalAlertEmailHtml({ group, opportunities: groupOpps, summaryText, styleKey: style.key });
    }

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
          toRecipients: recipientEmails.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
    }

    results[group] = { success: true, recipients: recipientEmails.length, tenders: count };
  }

  return { success: true, results };
};

const MAIL_SCHEDULE_TEMPLATE_KEYS = [
  '{{SCHEDULE_NAME}}',
  '{{DATE_RANGE}}',
  '{{COUNT}}',
  '{{OWNER}}',
];

const normalizeRecipientList = (value) => normalizeEmailList(value);

const parseSendTime = (value = '') => {
  const [h, m] = String(value || '').split(':').map((part) => Number(part));
  const hours = Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0;
  const minutes = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0;
  return { hours, minutes };
};

const weekdayIndex = (weekday = '') => {
  const normalized = String(weekday || '').trim().toLowerCase();
  const lookup = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return lookup[normalized] ?? 1;
};

const getZonedParts = (date, timezone) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  });
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
};

const zonedDateToUtc = (parts) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0));

const computeNextRunAt = (schedule, fromDate = new Date()) => {
  const timezone = String(schedule?.timezone || 'Asia/Dubai');
  const { hours, minutes } = parseSendTime(schedule?.sendTime);
  const baseParts = getZonedParts(fromDate, timezone);
  const baseZonedUtc = zonedDateToUtc(baseParts);
  const candidateParts = { ...baseParts, hour: hours, minute: minutes, second: 0 };
  let candidateUtc = zonedDateToUtc(candidateParts);

  if (schedule?.frequency === 'daily') {
    if (candidateUtc <= baseZonedUtc) {
      candidateParts.day += 1;
      candidateUtc = zonedDateToUtc(candidateParts);
    }
    return candidateUtc;
  }

  if (schedule?.frequency === 'monthly') {
    const day = Math.min(Math.max(Number(schedule?.monthDay || 1), 1), 31);
    candidateParts.day = day;
    candidateUtc = zonedDateToUtc(candidateParts);
    if (candidateUtc <= baseZonedUtc) {
      candidateParts.month += 1;
      if (candidateParts.month > 12) {
        candidateParts.month = 1;
        candidateParts.year += 1;
      }
      const maxDay = new Date(Date.UTC(candidateParts.year, candidateParts.month, 0)).getUTCDate();
      candidateParts.day = Math.min(day, maxDay);
      candidateUtc = zonedDateToUtc(candidateParts);
    }
    return candidateUtc;
  }

  const targetDay = weekdayIndex(schedule?.weekday);
  const baseDay = new Date(Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day)).getUTCDay();
  let diff = (targetDay - baseDay + 7) % 7;
  if (diff === 0 && candidateUtc <= baseZonedUtc) diff = 7;
  candidateParts.day += diff;
  return zonedDateToUtc(candidateParts);
};

const buildMailScheduleTemplateValues = (schedule, opportunities, filters) => {
  const { text: rangeText } = buildDateRangeForOpportunities(opportunities, filters);
  return {
    SCHEDULE_NAME: String(schedule?.name || ''),
    DATE_RANGE: rangeText,
    COUNT: String(opportunities.length),
    OWNER: String(schedule?.createdBy || ''),
  };
};

const buildScheduleMailHtml = ({ subject, body }) => {
  const safeSubject = escapeHtml(subject || '');
  const safeBody = nl2br(body || '');
  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Scheduled Mail</div>
          <h1 style="margin:0;font-size:22px;line-height:1.3;">${safeSubject || 'Scheduled Update'}</h1>
        </div>
        <div style="padding:24px 28px;font-size:14px;line-height:1.7;color:#334155;">${safeBody}</div>
      </div>
    </div>
  `;
};

const buildFilteredExcelBuffer = (opportunities = []) => {
  const rows = opportunities.map((opp) => ({
    'Tender Ref': opp?.opportunityRefNo || '',
    'Tender Name': opp?.tenderName || '',
    Client: opp?.clientName || '',
    Group: opp?.groupClassification || '',
    Lead: opp?.internalLead || '',
    'Tender Type': opp?.opportunityClassification || '',
    'Date Received': opp?.dateTenderReceived || '',
    Status: getMergedReportStatus(opp) || '',
    Value: opp?.value || '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const downloadWorkbookFile = async ({ driveId, fileId, accessToken }) => {
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const payload = await res.text().catch(() => '');
    throw new Error(payload || `Failed to download workbook (status ${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const filenameHeader = res.headers.get('content-disposition') || '';
  const nameMatch = filenameHeader.match(/filename\\*?=(?:UTF-8''|\"?)([^\";]+)/i);
  const filename = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\"/g, '')) : 'workbook.xlsx';
  return { buffer: Buffer.from(arrayBuffer), filename };
};

const buildScheduleAttachments = async ({ schedule, opportunities, filters, accessToken }) => {
  if (schedule?.attachmentMode === 'full_sheet_copy') {
    const graphConfig = await getGraphConfig();
    if (!graphConfig?.driveId || !graphConfig?.fileId) {
      throw new Error('Graph config is incomplete. Please configure Drive ID and File ID.');
    }
    const { buffer, filename } = await downloadWorkbookFile({
      driveId: graphConfig.driveId,
      fileId: graphConfig.fileId,
      accessToken,
    });
    return [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: filename || 'workbook.xlsx',
      contentBytes: buffer.toString('base64'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }];
  }

  const buffer = buildFilteredExcelBuffer(opportunities);
  return [{
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: `filtered-tenders-${new Date().toISOString().slice(0, 10)}.xlsx`,
    contentBytes: Buffer.from(buffer).toString('base64'),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }];
};

const dispatchMailSchedule = async (schedule) => {
  const config = await getSystemConfig();
  const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
  if (!graphRefreshTokenEnc) {
    throw new Error('Mail service is not configured');
  }

  const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });
  const filters = schedule?.filters || {};
  const opportunities = await SyncedOpportunity.find().lean();
  const scoped = filterOpportunitiesForBulkApprove(opportunities, filters);
  const recipients = normalizeRecipientList(schedule?.recipients || []);
  if (!recipients.length) {
    throw new Error('No recipients configured for schedule');
  }

  const templateValues = buildMailScheduleTemplateValues(schedule, scoped, filters);
  const subject = renderTemplate(schedule?.subject || schedule?.name || 'Scheduled Update', templateValues);
  const body = renderTemplate(schedule?.body || '', templateValues);
  const html = buildScheduleMailHtml({ subject, body });
  const attachments = await buildScheduleAttachments({ schedule, opportunities: scoped, filters, accessToken });

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
        attachments,
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const payload = await graphResponse.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
  }

  return { sent: recipients.length, count: scoped.length };
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
  const templateStyle = getTelecastTemplateStyle(systemConfig.telecastTemplateStyle);
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
    const htmlContent = buildTelecastEmailHtml({ values, renderedBody: content, styleKey: templateStyle.key });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlContent },
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

const runSyncFromConfiguredGraph = async ({ source = 'manual_sync' } = {}) => {
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

let syncInFlightPromise = null;

const syncFromConfiguredGraph = async ({ source = 'manual_sync' } = {}) => {
  if (syncInFlightPromise) {
    console.log('[sync.lock.waiting]', JSON.stringify({ source, timestamp: new Date().toISOString() }));
    return syncInFlightPromise;
  }

  syncInFlightPromise = runSyncFromConfiguredGraph({ source })
    .finally(() => {
      syncInFlightPromise = null;
    });

  return syncInFlightPromise;
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

let mailScheduleTimer = null;
let mailScheduleRunLock = false;
const scheduleMailDispatch = () => {
  if (mailScheduleTimer) clearInterval(mailScheduleTimer);
  mailScheduleTimer = setInterval(async () => {
    if (mailScheduleRunLock) return;
    mailScheduleRunLock = true;
    const now = new Date();
    try {
      const dueSchedules = await MailSchedule.find({
        enabled: true,
        nextRunAt: { $lte: now },
      }).lean();

      for (const schedule of dueSchedules) {
        try {
          const dispatchResult = await dispatchMailSchedule(schedule);
          const nextRunAt = computeNextRunAt(schedule, new Date());
          await MailSchedule.updateOne(
            { _id: schedule._id },
            { $set: { lastRunAt: now, nextRunAt } },
          );
          await MailScheduleRun.create({
            scheduleId: schedule._id,
            scheduleName: schedule.name,
            runAt: now,
            status: 'success',
            sentCount: dispatchResult.sent || 0,
            tenderCount: dispatchResult.count || 0,
          });
        } catch (scheduleError) {
          console.error('[mail.schedule.dispatch.error]', scheduleError?.message || scheduleError);
          const nextRunAt = computeNextRunAt(schedule, new Date());
          await MailSchedule.updateOne(
            { _id: schedule._id },
            { $set: { lastRunAt: now, nextRunAt } },
          );
          await MailScheduleRun.create({
            scheduleId: schedule._id,
            scheduleName: schedule.name,
            runAt: now,
            status: 'failed',
            error: String(scheduleError?.message || scheduleError),
          });
        }
      }
    } catch (error) {
      console.error('[mail.schedule.tick.error]', error?.message || error);
    } finally {
      mailScheduleRunLock = false;
    }
  }, 60 * 1000);
  console.log('⏱️ Mail schedule dispatcher active (every 1 minute).');
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

app.post('/api/auth/verify-token', authRateLimiter, async (req, res) => {
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

app.post('/api/auth/login', authRateLimiter, verifyToken, async (req, res) => {
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
    if (!await requireActionPermission(req, res, 'users_manage')) return;

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
    if (!await requireActionPermission(req, res, 'users_manage')) return;

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
    if (!await requireActionPermission(req, res, 'users_manage')) return;

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
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const { email, newRole, assignedGroup } = req.body;
    if (!email || !newRole) {
      return res.status(400).json({ error: 'Email and newRole are required' });
    }

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic', 'MASTER', 'PROPOSAL_HEAD'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
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
    const targetIsMaster = existing.role === 'Master' || existing.role === 'MASTER';
    const requesterIsMaster = req.user.role === 'Master' || req.user.role === 'MASTER';
    const nextRoleIsMaster = newRole === 'Master' || newRole === 'MASTER';

    if ((targetIsMaster || nextRoleIsMaster) && !requesterIsMaster) {
      return res.status(403).json({ error: 'Only Master users can assign or modify Master users' });
    }

    if (targetIsMaster && existing.email === req.user.email && !nextRoleIsMaster) {
      return res.status(403).json({ error: 'Master users cannot change their own role' });
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
    if (!await requireActionPermission(req, res, 'users_manage')) return;

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
    if (!await requireActionPermission(req, res, 'logs_cleanup')) return;

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
    if (!await requireActionPermission(req, res, 'approvals_proposal_head')) return;

    const { opportunityRefNo } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    const existingApproval = await Approval.findOne({ opportunityRefNo }).lean();
    const result = await approvalDb.approveAsProposalHead(opportunityRefNo, req.user.displayName, req.user.role);
    if (!existingApproval?.proposalHeadApproved) {
      try {
        const opportunity = await SyncedOpportunity.findOne({ opportunityRefNo }).lean();
        if (opportunity) {
          await sendApprovalAlertForOpportunity({ opportunity, approvedBy: req.user.displayName || req.user.email });
        }
      } catch (approvalAlertError) {
        console.error('[approval.alert.dispatch.error]', approvalAlertError?.message || approvalAlertError);
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve-svp', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'approvals_svp')) return;

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
      if (!await requireActionPermission(req, res, 'approvals_proposal_head')) return;
    } else if (action === 'svp') {
      if (!await requireActionPermission(req, res, 'approvals_svp')) return;
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
      const existingApprovals = await Approval.find({ opportunityRefNo: { $in: refs }, proposalHeadApproved: true }, { opportunityRefNo: 1 }).lean();
      const alreadyApprovedRefs = new Set(existingApprovals.map((item) => item.opportunityRefNo));
      const result = await approvalDb.bulkApproveAsProposalHead(refs, req.user.displayName, req.user.role);
      try {
        const newlyApproved = scoped.filter((opportunity) => !alreadyApprovedRefs.has(opportunity.opportunityRefNo));
        if (newlyApproved.length) {
          await sendBulkApprovalAlerts({ opportunities: newlyApproved, approvedBy: req.user.displayName || req.user.email, filters });
        }
      } catch (approvalAlertError) {
        console.error('[approval.alert.bulk-dispatch.error]', approvalAlertError?.message || approvalAlertError);
      }
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
    if (!await requireActionPermission(req, res, 'approvals_bulk_revert')) return;

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
    if (!await requireActionPermission(req, res, 'approvals_revert')) return;

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
    if (!await requireActionPermission(req, res, 'graph_config_write')) return;

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
    if (!await requireActionPermission(req, res, 'graph_auth_write')) return;

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
    if (!await requireActionPermission(req, res, 'graph_auth_write')) return;

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
  'tender_updates',
  'vendor_directory',
  'clients',
  'analytics',
  'mail_scheduler',
  'master',
  'master_general',
  'master_users',
  'master_data_sync',
  'master_telecast',
];
const ROLE_KEYS = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
const ACTION_KEYS = [
  'opportunities_sync',
  'approvals_proposal_head',
  'approvals_svp',
  'approvals_bulk_revert',
  'approvals_revert',
  'vendors_write',
  'vendors_import',
  'clients_write',
  'clients_import',
  'clients_seed',
  'users_manage',
  'navigation_permissions_write',
  'graph_config_write',
  'graph_auth_write',
  'telecast_config_write',
  'telecast_auth_write',
  'notification_alert_flags_write',
  'logs_cleanup',
  'mail_scheduler_write',
];
const DEFAULT_PAGE_ROLE_ACCESS = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  mail_scheduler: ['Master', 'Admin'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
};
const DEFAULT_ACTION_ROLE_ACCESS = {
  opportunities_sync: ['Master', 'Admin'],
  approvals_proposal_head: ['Master', 'ProposalHead'],
  approvals_svp: ['Master', 'SVP'],
  approvals_bulk_revert: ['Master', 'ProposalHead'],
  approvals_revert: ['Master'],
  vendors_write: ['Master', 'Admin'],
  vendors_import: ['Master', 'Admin'],
  clients_write: ['Master', 'Admin', 'ProposalHead'],
  clients_import: ['Master', 'Admin'],
  clients_seed: ['Master', 'Admin'],
  users_manage: ['Master'],
  navigation_permissions_write: ['Master'],
  graph_config_write: ['Master'],
  graph_auth_write: ['Master'],
  telecast_config_write: ['Master'],
  telecast_auth_write: ['Master'],
  notification_alert_flags_write: ['Master', 'Admin'],
  logs_cleanup: ['Master'],
  mail_scheduler_write: ['Master', 'Admin'],
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

const sanitizePageEmailAccess = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    normalized[page] = normalizeEmailList(input?.[page] || []);
  }
  return normalized;
};

const sanitizeActionRoleAccess = (input = {}) => {
  const normalized = {};
  for (const action of ACTION_KEYS) {
    const list = Array.isArray(input?.[action]) ? input[action] : DEFAULT_ACTION_ROLE_ACCESS[action];
    normalized[action] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
    if (!normalized[action].length) normalized[action] = [...DEFAULT_ACTION_ROLE_ACCESS[action]];
  }
  return normalized;
};

const sanitizeActionEmailAccess = (input = {}) => {
  const normalized = {};
  for (const action of ACTION_KEYS) {
    normalized[action] = normalizeEmailList(input?.[action] || []);
  }
  return normalized;
};

const getSystemConfig = async () => {
  let config = await SystemConfig.findOne();
  if (!config) config = await SystemConfig.create({});
  return config;
};

const getActionPermissions = async () => {
  const config = await getSystemConfig();
  const permissions = sanitizeActionRoleAccess(config.actionRoleAccess || {});
  const emailPermissions = sanitizeActionEmailAccess(config.actionEmailAccess || {});
  if (!config.actionRoleAccess || Object.keys(config.actionRoleAccess).length === 0) {
    config.actionRoleAccess = permissions;
  }
  if (!config.actionEmailAccess || Object.keys(config.actionEmailAccess).length === 0) {
    config.actionEmailAccess = emailPermissions;
  }
  if (config.isModified('actionRoleAccess') || config.isModified('actionEmailAccess')) {
    await config.save();
  }
  return { config, permissions, emailPermissions };
};

const requireActionPermission = async (req, res, actionKey) => {
  const { config, permissions, emailPermissions } = await getActionPermissions();
  const allowedRoles = permissions[actionKey] || [];
  const allowedEmails = emailPermissions[actionKey] || [];
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  if (!allowedRoles.includes(req.user.role) && !allowedEmails.includes(userEmail)) {
    res.status(403).json({ error: `Role ${req.user.role} is not allowed to perform ${actionKey}` });
    return null;
  }
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
    const emailPermissions = sanitizePageEmailAccess(config.pageEmailAccess || {});
    if (!config.pageRoleAccess || Object.keys(config.pageRoleAccess).length === 0) {
      config.pageRoleAccess = permissions;
    }
    if (!config.pageEmailAccess || Object.keys(config.pageEmailAccess).length === 0) {
      config.pageEmailAccess = emailPermissions;
    }
    if (config.isModified('pageRoleAccess') || config.isModified('pageEmailAccess')) {
      await config.save();
    }
    res.json({ success: true, permissions, emailPermissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'navigation_permissions_write')) return;

    const permissions = sanitizePageRoleAccess(req.body?.permissions || {});
    const emailPermissions = sanitizePageEmailAccess(req.body?.emailPermissions || {});
    const config = await getSystemConfig();
    config.pageRoleAccess = permissions;
    config.pageEmailAccess = emailPermissions;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, permissions, emailPermissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/action-permissions', verifyToken, async (_req, res) => {
  try {
    const { permissions, emailPermissions } = await getActionPermissions();
    res.json({ success: true, permissions, emailPermissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/action-permissions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'navigation_permissions_write')) return;

    const permissions = sanitizeActionRoleAccess(req.body?.permissions || {});
    const emailPermissions = sanitizeActionEmailAccess(req.body?.emailPermissions || {});
    const config = await getSystemConfig();
    config.actionRoleAccess = permissions;
    config.actionEmailAccess = emailPermissions;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, permissions, emailPermissions });
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
      templateStyle: getTelecastTemplateStyle(config.telecastTemplateStyle).key,
      approvalAlertEnabled: Boolean(config.approvalAlertEnabled),
      approvalTemplateSubject: config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}',
      approvalTemplateBody: config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.',
      approvalTemplateStyle: getTelecastTemplateStyle(config.approvalAlertTemplateStyle).key,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
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
    if (!await requireActionPermission(req, res, 'telecast_config_write')) return;

    const templateSubject = String(req.body?.templateSubject || '').trim();
    const templateBody = String(req.body?.templateBody || '').trim();
    const templateStyle = getTelecastTemplateStyle(req.body?.templateStyle);
    const approvalAlertEnabled = Boolean(req.body?.approvalAlertEnabled);
    const approvalTemplateSubject = String(req.body?.approvalTemplateSubject || '').trim();
    const approvalTemplateBody = String(req.body?.approvalTemplateBody || '').trim();
    const approvalTemplateStyle = getTelecastTemplateStyle(req.body?.approvalTemplateStyle);
    const groupRecipientsInput = req.body?.groupRecipients || {};
    const groupRecipients = {
      GES: normalizeEmailList(groupRecipientsInput.GES || []),
      GDS: normalizeEmailList(groupRecipientsInput.GDS || []),
      GTS: normalizeEmailList(groupRecipientsInput.GTS || []),
    };

    const config = await getSystemConfig();
    config.telecastTemplateSubject = templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
    config.telecastTemplateBody = templateBody || 'New row detected for {{TENDER_NO}}';
    config.telecastTemplateStyle = templateStyle.key;
    config.approvalAlertEnabled = approvalAlertEnabled;
    config.approvalAlertTemplateSubject = approvalTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}';
    config.approvalAlertTemplateBody = approvalTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.';
    config.approvalAlertTemplateStyle = approvalTemplateStyle.key;
    config.telecastGroupRecipients = groupRecipients;
    config.telecastKeywordHelp = TELECAST_TEMPLATE_KEYWORDS;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({
      success: true,
      templateSubject: config.telecastTemplateSubject,
      templateBody: config.telecastTemplateBody,
      templateStyle: config.telecastTemplateStyle,
      approvalAlertEnabled: config.approvalAlertEnabled,
      approvalTemplateSubject: config.approvalAlertTemplateSubject,
      approvalTemplateBody: config.approvalAlertTemplateBody,
      approvalTemplateStyle: config.approvalAlertTemplateStyle,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
      groupRecipients,
      keywords: TELECAST_TEMPLATE_KEYWORDS,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reporting/config', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view reporting config' });
    }
    const config = await getSystemConfig();
    res.json({
      success: true,
      templateStyle: getTelecastTemplateStyle(config.issueReportTemplateStyle).key,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reporting/config', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'telecast_config_write')) return;

    const templateStyle = getTelecastTemplateStyle(req.body?.templateStyle);
    const config = await getSystemConfig();
    config.issueReportTemplateStyle = templateStyle.key;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({
      success: true,
      templateStyle: config.issueReportTemplateStyle,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/mail-schedules', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'mail_scheduler_write')) return;
    const schedules = await MailSchedule.find().sort({ createdAt: -1 }).lean();
    res.json({ schedules, templateKeywords: MAIL_SCHEDULE_TEMPLATE_KEYS });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load schedules' });
  }
});

app.post('/api/mail-schedules', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'mail_scheduler_write')) return;
    const payload = req.body || {};
    const name = String(payload?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Schedule name is required' });

    const scheduleInput = {
      name,
      templateKey: String(payload?.templateKey || 'weekly_pipeline'),
      subject: String(payload?.subject || ''),
      body: String(payload?.body || ''),
      frequency: String(payload?.frequency || 'weekly'),
      weekday: String(payload?.weekday || 'Monday'),
      monthDay: Number(payload?.monthDay || 1),
      sendTime: String(payload?.sendTime || '08:30'),
      timezone: String(payload?.timezone || 'Asia/Dubai'),
      attachmentMode: String(payload?.attachmentMode || 'filtered_extract'),
      filters: payload?.filters || {},
      recipients: normalizeRecipientList(payload?.recipients || []),
      enabled: payload?.enabled !== false,
      updatedBy: req.user.email,
    };

    const baseSchedule = { ...scheduleInput, createdBy: payload?.createdBy || req.user.email };
    const nextRunAt = computeNextRunAt(baseSchedule, new Date());
    const update = { ...scheduleInput, nextRunAt };

    let schedule;
    if (payload?.id) {
      schedule = await MailSchedule.findOneAndUpdate(
        { _id: payload.id },
        { $set: update },
        { new: true }
      );
    } else {
      schedule = await MailSchedule.create({ ...baseSchedule, nextRunAt });
    }

    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save schedule' });
  }
});

app.post('/api/mail-schedules/:id/run', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'mail_scheduler_write')) return;
    const schedule = await MailSchedule.findById(req.params.id).lean();
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const dispatchResult = await dispatchMailSchedule(schedule);
    const now = new Date();
    const nextRunAt = computeNextRunAt(schedule, now);
    await MailSchedule.updateOne({ _id: schedule._id }, { $set: { lastRunAt: now, nextRunAt } });
    await MailScheduleRun.create({
      scheduleId: schedule._id,
      scheduleName: schedule.name,
      runAt: now,
      status: 'success',
      sentCount: dispatchResult.sent || 0,
      tenderCount: dispatchResult.count || 0,
    });
    res.json({ success: true, dispatch: dispatchResult, nextRunAt });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to run schedule' });
  }
});

app.get('/api/mail-schedules/:id/runs', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'mail_scheduler_write')) return;
    const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100);
    const runs = await MailScheduleRun.find({ scheduleId: req.params.id })
      .sort({ runAt: -1 })
      .limit(limit)
      .lean();
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load schedule runs' });
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
    if (!await requireActionPermission(req, res, 'telecast_auth_write')) return;

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
    if (!await requireActionPermission(req, res, 'telecast_auth_write')) return;

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
    if (!await requireActionPermission(req, res, 'notification_alert_flags_write')) return;

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
    if (!await requireActionPermission(req, res, 'notification_alert_flags_write')) return;

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
    const subjectTemplate = config.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.telecastTemplateBody || 'A new tender row was detected for {{CLIENT}} in {{GROUP}}.';
    const templateStyle = getTelecastTemplateStyle(config.telecastTemplateStyle);
    const testValues = {
      TENDER_NO: `AVR-TEST-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: req.user.displayName || req.user.email || 'Avenir',
      OPPORTUNITY_ID: `telecast-preview-${Date.now()}`,
      COMMENTS: 'Sample values inserted for template preview from Admin > Send Test Mail.',
    };
    const renderedSubject = renderTemplate(subjectTemplate, testValues);
    const renderedBody = renderTemplate(bodyTemplate, testValues);
    const testHtml = buildTelecastEmailHtml({
      values: testValues,
      renderedBody,
      styleKey: templateStyle.key,
    });
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: renderedSubject,
          body: {
            contentType: 'HTML',
            content: testHtml,
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

    res.json({ success: true, message: `Template preview mail sent to ${recipientEmail}`, subject: renderedSubject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send test mail' });
  }
});

app.post('/api/telecast/test-approval-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send approval alert test mail' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
    if (!graphRefreshTokenEnc) {
      return res.status(400).json({ error: 'Mail service is not configured' });
    }

    const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });
    const values = {
      TENDER_NO: `AVR-APR-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: 'tender.manager@avenirengineering.com',
      OPPORTUNITY_ID: `approval-preview-${Date.now()}`,
      COMMENTS: `Approved by Tender Manager: ${req.user.displayName || req.user.email || 'Avenir'}`,
    };
    const subjectTemplate = config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.';
    const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
    const subject = renderTemplate(subjectTemplate, values);
    const renderedBody = renderTemplate(bodyTemplate, values);
    const html = buildApprovalAlertEmailHtml({ values, renderedBody, styleKey: style.key });

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

    res.json({ success: true, message: `Approval alert preview mail sent to ${recipientEmail}`, subject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send approval alert test mail' });
  }
});

app.post('/api/reporting/test-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send reporting test mail' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
    if (!graphRefreshTokenEnc) {
      return res.status(400).json({ error: 'Mail service is not configured' });
    }

    const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc });
    const reportedAt = new Date().toISOString();
    const subject = 'Issue report preview: Dashboard · data mismatch';
    const html = buildIssueReportEmailHtml({
      styleKey: config.issueReportTemplateStyle,
      reporter: escapeHtml(req.user.displayName || req.user.email || 'Unknown'),
      role: escapeHtml(req.user.role || 'Unknown'),
      email: escapeHtml(req.user.email || 'Unknown'),
      page: '/dashboard',
      reportedAt: escapeHtml(reportedAt),
      issueTypes: 'data mismatch, not working properly',
      feature: 'Dashboard',
      summary: 'Sample preview of the configured issue reporting email style.',
      steps: '1. Open the dashboard\n2. Apply a filter\n3. Compare totals against the visible rows',
      comments: 'This is a style preview sent from Admin > Issue Reporting Template Style.',
    });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
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

    res.json({ success: true, message: `Issue reporting preview mail sent to ${recipientEmail}`, subject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send reporting test mail' });
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
    const html = buildIssueReportEmailHtml({
      styleKey: config.issueReportTemplateStyle,
      reporter: safeReporter,
      role: safeRole,
      email: safeEmail,
      page: safePage,
      reportedAt: safeTime,
      issueTypes: safeIssueTypes,
      feature: safeFeature,
      summary: safeSummary,
      steps: safeSteps,
      comments: safeComments,
    });

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
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;

    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_SYNC_FAILED'));
  }
});

app.post('/api/opportunities/sync-graph/auto', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;

    const syncResult = await syncFromConfiguredGraph({ source: 'auto_endpoint' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_AUTOSYNC_FAILED'));
  }
});

// Backward-compatible aliases
app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;
    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({ success: true, count: syncResult.insertedCount, syncedCount: syncResult.insertedCount, newRowsCount: syncResult.newRowsCount, newRowSignatures: syncResult.newRowSignatures });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_SYNC_FAILED'));
  }
});

app.post('/api/opportunities/sync-sheets/auto', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;
    const syncResult = await syncFromConfiguredGraph({ source: 'auto_endpoint_legacy' });
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

app.get('/api/vendors', async (_req, res) => {
  try {
    await cleanupDummyVendors();
    const vendors = await Vendor.find().sort({ updatedAt: -1, companyName: 1 }).lean();
    res.json(vendors.map((vendor) => mapIdField(vendor)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendors', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_write')) return;
    const payload = buildVendorPayload(req.body || {});
    if (!payload.companyName) return res.status(400).json({ error: 'Company name is required' });

    const existing = await Vendor.findOne({ companyKey: payload.companyKey });
    if (!existing) {
      const created = await Vendor.create(payload);
      return res.json(mapIdField(created.toObject()));
    }

    Object.assign(existing, payload);
    await existing.save();
    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vendors/:id', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_write')) return;
    const existing = await Vendor.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    const payload = buildVendorPayload({ ...existing.toObject(), ...(req.body || {}) });
    if (!payload.companyName) return res.status(400).json({ error: 'Company name is required' });
    const duplicate = await Vendor.findOne({ companyKey: payload.companyKey, _id: { $ne: existing._id } });
    if (duplicate) return res.status(409).json({ error: 'Another vendor already uses that company name' });

    Object.assign(existing, payload);
    await existing.save();
    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendors/import', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_import')) return;
    const inputs = Array.isArray(req.body?.vendors) ? req.body.vendors : [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const input of inputs) {
      const payload = buildVendorPayload(input || {});
      if (!payload.companyName) continue;
      const existing = await Vendor.findOne({ companyKey: payload.companyKey });
      if (!existing) {
        await Vendor.create(payload);
        createdCount += 1;
      } else {
        Object.assign(existing, payload);
        await existing.save();
        updatedCount += 1;
      }
    }

    res.json({ success: true, created: createdCount, updated: updatedCount, imported: createdCount + updatedCount });
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

app.post('/api/clients', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'clients_write')) return;
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

app.post('/api/clients/import', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'clients_import')) return;
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
    if (!await requireActionPermission(req, res, 'clients_seed')) return;
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
    const recentTenders = getRecentTenderData(data);

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
        shading: { fill: REPORT_COLORS.navy, type: ShadingType.CLEAR },
        thematicBreak: true,
        spacing: { after: 200, before: 120 },
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
              createReportHeaderCell('Total Opportunities', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Won', REPORT_COLORS.greenSoft),
              createReportHeaderCell('Lost', REPORT_COLORS.redSoft),
              createReportHeaderCell('At Risk', REPORT_COLORS.amberSoft),
              createReportHeaderCell('Active Pipeline', REPORT_COLORS.blueSoft),
            ],
          }),
          new TableRow({
            children: [
              createReportValueCell(totalOpportunities, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.wonCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.lostCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.atRiskCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.totalActive, REPORT_COLORS.slateSoft),
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
              createReportHeaderCell('Status', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Count', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Description', REPORT_COLORS.blueSoft),
            ],
          }),
          new TableRow({ children: [createReportValueCell('✅ Working', REPORT_COLORS.slateSoft), createReportValueCell(summary.workingCount, REPORT_COLORS.slateSoft), createReportValueCell('Working on bid submission', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('🏆 Awarded', REPORT_COLORS.slateSoft), createReportValueCell(summary.awardedCount, REPORT_COLORS.slateSoft), createReportValueCell('Won deals', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('❌ Lost', REPORT_COLORS.slateSoft), createReportValueCell(summary.lostCount, REPORT_COLORS.slateSoft), createReportValueCell('Lost opportunities', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('📋 Regretted', REPORT_COLORS.slateSoft), createReportValueCell(summary.regrettedCount, REPORT_COLORS.slateSoft), createReportValueCell('Declined bids', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('🚀 To Start', REPORT_COLORS.slateSoft), createReportValueCell(summary.toStartCount, REPORT_COLORS.slateSoft), createReportValueCell('To start working on the bid', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('⏱️ At Risk', REPORT_COLORS.slateSoft), createReportValueCell(summary.atRiskCount, REPORT_COLORS.slateSoft), createReportValueCell('Urgent action required', REPORT_COLORS.slateSoft)] }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({ text: 'Recent 5 Tenders', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Ref No', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Tender Name', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Client', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Received', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Status', REPORT_COLORS.blueSoft),
            ],
          }),
          ...recentTenders.map((row) => new TableRow({
            children: [
              createReportValueCell(row.refNo, REPORT_COLORS.slateSoft),
              createReportValueCell(row.tenderName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.clientName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.receivedDate ? formatDateForReport(row.receivedDate) : '—', REPORT_COLORS.slateSoft),
              createReportValueCell(row.status, REPORT_COLORS.slateSoft),
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

app.post('/api/tender-updates-report', verifyToken, async (req, res) => {
  try {
    const tenders = Array.isArray(req.body?.tenders) ? req.body.tenders : [];
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

    const updatesByTender = new Map();
    updates.forEach((update) => {
      const key = String(update?.opportunityId || '');
      if (!updatesByTender.has(key)) updatesByTender.set(key, []);
      updatesByTender.get(key).push(update);
    });

    const generatedAt = new Date().toLocaleString();
    const totalUpdates = updates.length;

    const children = [
      new Paragraph({
        text: 'TENDER UPDATES TRACKER REPORT',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Generated: ${generatedAt}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: `Total Tenders: ${tenders.length} • Total Updates: ${totalUpdates}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    tenders.forEach((tender) => {
      const tenderUpdates = updatesByTender.get(String(tender?.id || '')) || [];
      children.push(
        new Paragraph({
          text: `${tender?.opportunityRefNo || ''} • ${tender?.tenderName || 'Tender'}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        }),
        new Paragraph({
          text: `Client: ${tender?.clientName || '—'} | Lead: ${tender?.internalLead || '—'} | Group: ${tender?.groupClassification || '—'}`,
          spacing: { after: 200 },
        })
      );

      if (tenderUpdates.length === 0) {
        children.push(new Paragraph({ text: 'No updates recorded for this tender.', spacing: { after: 200 } }));
        return;
      }

      const rows = [
        new TableRow({
          children: [
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Type' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'SubType' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Actor' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Date' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Due Date' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Details' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Created By' })] }),
          ],
        }),
        ...tenderUpdates.map((u) => new TableRow({
          children: [
            new TableCell({ borders, children: [new Paragraph(String(u.type || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.subType || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.actor || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.date || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.dueDate || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.details || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.createdBy || ''))] }),
          ],
        })),
      ];

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );
    });

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Disposition', 'attachment; filename=tender-updates-report.docx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate report' });
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
