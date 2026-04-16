import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import approvalDb from './approvalDb.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import OpportunityManualUpdate from './models/OpportunityManualUpdate.js';
import OpportunityProbation from './models/OpportunityProbation.js';
import OpportunityChangeLog from './models/OpportunityChangeLog.js';
import OpportunityFieldConflict from './models/OpportunityFieldConflict.js';
import LeadEmailMapping from './models/LeadEmailMapping.js';
import Approval from './models/Approval.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import LoginLog from './models/LoginLog.js';
import Client from './models/Client.js';
import Vendor from './models/Vendor.js';
import ProjectUpdate from './models/ProjectUpdate.js';
import BDEngagement from './models/BDEngagement.js';
import { buildDateDisplay, parseDate as parseGraphDate, syncTendersFromGraph, transformTendersToOpportunities } from './services/dataSyncService.js';
import GraphSyncConfig from './models/GraphSyncConfig.js';
import { resolveShareLink, getWorksheets, getWorksheetRangeValues, bootstrapDelegatedToken, protectRefreshToken, buildDelegatedConsentUrl, getAccessTokenWithConfig } from './services/graphExcelService.js';
import { initializeBootSync } from './services/bootSyncService.js';
import SystemConfig from './models/SystemConfig.js';
import { encryptSecret } from './services/cryptoService.js';
import { applyOpportunityStatusFields, getEffectiveMergedStatus } from './services/opportunityStatusService.js';
import {
  applyManualOverridesToOpportunity,
  buildManualOpportunityPatch,
  buildManualUpdatePatch,
  MANUAL_UPDATE_FIELD_KEYS,
  parseManualUpdateRows,
  normalizeRefKey,
} from './services/opportunityManualUpdateService.js';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
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
const DISABLE_MONGODB = String(process.env.DISABLE_MONGODB || '').toLowerCase() === 'true';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '10mb';
const SESSION_TOKEN_TTL = process.env.SESSION_TOKEN_TTL || '12h';
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET || process.env.JWT_SECRET || `${randomUUID()}-${randomUUID()}`;
const ALLOW_LEGACY_EMAIL_BEARER = String(process.env.ALLOW_LEGACY_EMAIL_BEARER || '').toLowerCase() === 'true';
console.log('Debug flags:', { MAIL_DEBUG: String(process.env.MAIL_DEBUG || '').toLowerCase() === 'true', NOTIFICATION_DEBUG: String(process.env.NOTIFICATION_DEBUG || '').toLowerCase() === 'true', GRAPH_TOKEN_DEBUG: String(process.env.GRAPH_TOKEN_DEBUG || '').toLowerCase() === 'true' });
if (!process.env.SESSION_JWT_SECRET && !process.env.JWT_SECRET) {
  console.warn('⚠️ SESSION_JWT_SECRET is not set. Using an ephemeral in-memory secret for this process only.');
}

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
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
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

const isDatabaseReady = () => DISABLE_MONGODB || mongoose.connection.readyState === 1;

const respondDatabaseUnavailable = (res) => (
  res.status(503).json({
    error: 'Database unavailable',
    code: 'DATABASE_UNAVAILABLE',
  })
);

const authRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, keyPrefix: 'auth' });
const privilegedRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120, keyPrefix: 'priv' });
const graphAuthBootstrapLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'graph-bootstrap' });
const OPPORTUNITIES_CACHE_TTL_MS = 10 * 60 * 1000;
const opportunitiesListCache = {
  payload: null,
  generatedAt: 0,
  meta: null,
  warmingPromise: null,
};
const GRAPH_BOOTSTRAP_ALLOWED_USERS = new Set(
  String(process.env.GRAPH_BOOTSTRAP_ALLOWED_USERS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (req.path.startsWith('/api/health') || req.path.startsWith('/healthz')) return next();
  if (req.method === 'GET') return next();
  return privilegedRateLimiter(req, res, next);
});

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ limit: REQUEST_BODY_LIMIT, extended: true }));
app.use(compression());

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  if (DISABLE_MONGODB) {
    return res.status(200).json({
      ok: true,
      service: 'backend',
      dbState: 'disabled',
      timestamp: new Date().toISOString(),
    });
  }
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

const startServer = () => {
  app.listen(PORT, () => {
    console.log('✅ Server running on http://localhost:' + PORT);
  });
};

if (DISABLE_MONGODB) {
  console.warn('[mongo.disabled]', JSON.stringify({ timestamp: new Date().toISOString() }));
  startServer();
} else {
  console.log('[mongo.connect.start]', JSON.stringify({ uriConfigured: Boolean(MONGODB_URI), timestamp: new Date().toISOString() }));
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('[mongo.connect.success]', JSON.stringify({ timestamp: new Date().toISOString() }));
    })
    .then(async () => {
      await ensureInitialMongoState();
    })
    .then(async () => {
      await initializeBootSync();
      await scheduleGraphAutoSync();
      scheduleDailyNotificationCheck();
      await warmOpportunitiesCache('startup');
      startServer();
    })
    .catch(err => {
      console.error('[mongo.connect.failure]', JSON.stringify({
        timestamp: new Date().toISOString(),
        name: err?.name || 'Error',
        message: err?.message || String(err),
        stack: err?.stack || null,
      }));
    });
}

const mapIdField = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc._id?.toString() || doc._id || null,
  };
};

const buildOpportunitiesListPayload = async () => {
  const fetchStartedAt = Date.now();
  const opportunitiesListProjection = {
    __v: 0,
    rawGoogleData: 0,
    rawGraphData: 0,
  };

  const [opportunitiesResult, manualResult, conflictsResult] = await Promise.all([
    (async () => {
      const startedAt = Date.now();
      const rows = await SyncedOpportunity.find({}, opportunitiesListProjection).lean();
      return { rows, ms: Date.now() - startedAt };
    })(),
    (async () => {
      const startedAt = Date.now();
      const rows = await OpportunityManualUpdate.find({}, { _id: 0 }).lean();
      return { rows, ms: Date.now() - startedAt };
    })(),
    (async () => {
      const startedAt = Date.now();
      const rows = await OpportunityFieldConflict.find({ status: 'pending' }, { refKey: 1, fieldKey: 1 }).lean();
      return { rows, ms: Date.now() - startedAt };
    })(),
  ]);
  const fetchCompletedAt = Date.now();

  const opportunities = opportunitiesResult.rows;
  const manualValueUpdates = manualResult.rows;
  const pendingConflicts = conflictsResult.rows;
  const oppFetchMs = opportunitiesResult.ms;
  const manualFetchMs = manualResult.ms;
  const conflictsFetchMs = conflictsResult.ms;

  const mergeStartedAt = Date.now();
  const manualByRefKey = new Map(
    manualValueUpdates
      .map((row) => [normalizeRefKey(row?.opportunityRefNo || row?.refKey || ''), row])
      .filter(([ref]) => Boolean(ref))
  );
  const conflictByRef = new Map();
  pendingConflicts.forEach((row) => {
    const ref = normalizeRefKey(row?.refKey || '');
    if (!ref) return;
    if (!conflictByRef.has(ref)) conflictByRef.set(ref, []);
    conflictByRef.get(ref).push(row.fieldKey);
  });
  const mergeCompletedAt = Date.now();

  const mapStartedAt = Date.now();
  const mapped = opportunities.map((opp) => {
    const base = mapIdField(applyOpportunityDateFields(applyOpportunityStatusFields(opp)));
    const refKey = normalizeRefKey(base?.opportunityRefNo || '');
    const manualSnapshot = refKey ? manualByRefKey.get(refKey) : null;
    const effective = { ...base };
    if (manualSnapshot) {
      MANUAL_UPDATE_FIELD_KEYS.forEach((fieldKey) => {
        if (!hasFieldValue(fieldKey, manualSnapshot[fieldKey])) return;
        effective[fieldKey] = manualSnapshot[fieldKey];
      });
    }
    const conflictFields = conflictByRef.get(refKey) || [];

    return {
      ...effective,
      manualFieldOverrides: manualSnapshot || null,
      hasPendingConflicts: conflictFields.length > 0,
      pendingConflictFields: conflictFields,
    };
  });
  const mapCompletedAt = Date.now();

  return {
    mapped,
    timing: {
      fetchMs: fetchCompletedAt - fetchStartedAt,
      mergeMs: mergeCompletedAt - mergeStartedAt,
      mapMs: mapCompletedAt - mapStartedAt,
      fetchBreakdownMs: {
        opportunities: oppFetchMs,
        manual: manualFetchMs,
        conflicts: conflictsFetchMs,
      },
    },
  };
};

const warmOpportunitiesCache = async (reason = 'unknown') => {
  if (opportunitiesListCache.warmingPromise) return opportunitiesListCache.warmingPromise;
  opportunitiesListCache.warmingPromise = (async () => {
    if (!isDatabaseReady()) return;
    const warmStartedAt = Date.now();
    const { mapped, timing } = await buildOpportunitiesListPayload();
    opportunitiesListCache.payload = mapped;
    opportunitiesListCache.generatedAt = Date.now();
    opportunitiesListCache.meta = {
      totalMs: Date.now() - warmStartedAt,
      fetchMs: timing.fetchMs,
      mergeMs: timing.mergeMs,
      mapMs: timing.mapMs,
      fetchBreakdownMs: timing.fetchBreakdownMs,
      rows: mapped.length,
      reason,
      timestamp: new Date().toISOString(),
    };
    console.log('[api.opportunities.cache.warm]', JSON.stringify(opportunitiesListCache.meta));
  })().finally(() => {
    opportunitiesListCache.warmingPromise = null;
  });
  return opportunitiesListCache.warmingPromise;
};

const invalidateOpportunitiesCache = (reason = 'unknown') => {
  opportunitiesListCache.payload = null;
  opportunitiesListCache.generatedAt = 0;
  opportunitiesListCache.meta = {
    invalidatedAt: new Date().toISOString(),
    reason,
  };
};

const getMergedReportStatus = (item = {}) => {
  return getEffectiveMergedStatus(item);
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

const getClientDataForReport = (data = []) => {
  const grouped = new Map();

  data.forEach((item) => {
    const name = String(item?.clientName || '').trim();
    if (!name) return;
    const current = grouped.get(name) || { name, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(item?.opportunityValue || 0);
    grouped.set(name, current);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.value - a.value || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);
};

const getPortfolioSnapshotData = (data = [], limit = 12) => {
  const rows = [...data]
    .sort((a, b) => {
      const aTime = parseDateValue(a?.dateTenderReceived || a?.createdAt)?.getTime() || 0;
      const bTime = parseDateValue(b?.dateTenderReceived || b?.createdAt)?.getTime() || 0;
      return bTime - aTime;
    })
    .map((item) => ({
      refNo: item?.opportunityRefNo || item?.tenderNo || '—',
      adnocRftNo: getAdnocRftNoForReport(item),
      tenderName: item?.tenderName || 'Untitled Tender',
      clientName: item?.clientName || '—',
      receivedDate: item?.dateTenderReceived || item?.createdAt || '',
      status: getMergedReportStatus(item) || 'UNSPECIFIED',
      lead: item?.internalLead || '—',
      value: Number(item?.opportunityValue || 0),
    }));

  if (!Number.isFinite(limit) || limit <= 0) return rows;
  return rows.slice(0, limit);
};

const normalizeReportSnapshotHeader = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getReportRowSnapshotValue = (item, candidateHeaders = []) => {
  const snapshot = item?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';

  const entries = Object.entries(snapshot);
  for (const header of candidateHeaders) {
    const normalizedHeader = normalizeReportSnapshotHeader(header);
    const match = entries.find(([key]) => normalizeReportSnapshotHeader(key) === normalizedHeader);
    if (match) return String(match[1] ?? '').trim();
  }

  return '';
};

const getAdnocRftNoForReport = (item) => String(
  item?.adnocRftNo
  || getReportRowSnapshotValue(item, ['ADNOC RFT NO', 'ADNOC RFT NO.'])
  || '',
).trim();

const formatDateForReport = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return String(value || '—');
  return parsed.toLocaleDateString('en-GB');
};

const REPORT_COLORS = {
  navy: '0f172a',
  blue: '1d4ed8',
  cobalt: '1e40af',
  teal: '0f766e',
  blueSoft: 'dbeafe',
  slate: 'e2e8f0',
  slateSoft: 'f8fafc',
  slateMid: 'cbd5e1',
  greenSoft: 'dcfce7',
  amberSoft: 'fef3c7',
  redSoft: 'fee2e2',
  inkSoft: '334155',
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

const createReportSectionTitle = (text) => new Paragraph({
  spacing: { before: 220, after: 140 },
  children: [
    new TextRun({ text: text, bold: true, color: REPORT_COLORS.cobalt, size: 28 }),
  ],
});

const createReportCallout = (title, body, fill = REPORT_COLORS.blueSoft) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          shading: { fill, type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${title}: `, bold: true, color: REPORT_COLORS.navy }),
                new TextRun({ text: body, color: REPORT_COLORS.inkSoft }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
});

const formatCurrencyCompact = (value = 0) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '—';
  return `AED ${numeric.toLocaleString('en-US')}`;
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

const normalizeFreeTextStatus = (value = '') => String(value || '').trim();

const toAgreementStatusFromPartnerStatuses = (ndaStatus = '', associationAgreementStatus = '') => {
  const nda = normalizeFreeTextStatus(ndaStatus).toLowerCase();
  const association = normalizeFreeTextStatus(associationAgreementStatus).toLowerCase();
  const positive = ['yes', 'y', 'signed', 'active', 'done', 'completed'];
  if (positive.some((token) => nda.includes(token))) return 'NDA';
  if (positive.some((token) => association.includes(token))) return 'Association Agreement';
  return 'Pending';
};

const buildVendorPayload = (input = {}) => {
  const companyName = normalizeCompanyName(input.companyName || '');
  const ndaStatus = normalizeFreeTextStatus(input.ndaStatus);
  const associationAgreementStatus = normalizeFreeTextStatus(input.associationAgreementStatus);
  const hasExplicitAgreementStatus = String(input.agreementStatus || '').trim() !== '';
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
    ndaStatus,
    associationAgreementStatus,
    agreementStatus: hasExplicitAgreementStatus
      ? normalizeAgreementStatus(input.agreementStatus)
      : toAgreementStatusFromPartnerStatuses(ndaStatus, associationAgreementStatus),
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
const normalizeTextValue = (value) => String(value ?? '').trim();
const hasFieldValue = (fieldKey, value) => (
  fieldKey === 'opportunityValue'
    ? value !== null && value !== undefined && Number.isFinite(Number(value))
    : normalizeTextValue(value) !== ''
);
const fieldValuesMatch = (fieldKey, left, right) => {
  if (!hasFieldValue(fieldKey, left) && !hasFieldValue(fieldKey, right)) return true;
  if (fieldKey === 'opportunityValue') return Number(left) === Number(right);
  return normalizeTextValue(left).toLowerCase() === normalizeTextValue(right).toLowerCase();
};
const FIELD_LABELS = {
  opportunityRefNo: 'Avenir Ref',
  tenderName: 'Tender Name',
  opportunityClassification: 'Tender Type',
  clientName: 'Client',
  groupClassification: 'Group',
  dateTenderReceived: 'RFP Received',
  tenderPlannedSubmissionDate: 'Submission',
  internalLead: 'Lead',
  opportunityValue: 'Value',
  avenirStatus: 'Status',
};
const FORM_REQUIRED_FIELDS = [
  'opportunityRefNo',
  'tenderName',
  'opportunityClassification',
  'clientName',
  'groupClassification',
  'dateTenderReceived',
  'tenderPlannedSubmissionDate',
  'internalLead',
  'opportunityValue',
  'avenirStatus',
];
const FORM_EDITABLE_FIELDS = [
  'opportunityRefNo',
  'adnocRftNo',
  'tenderName',
  'opportunityClassification',
  'clientName',
  'groupClassification',
  'dateTenderReceived',
  'tenderPlannedSubmissionDate',
  'internalLead',
  'opportunityValue',
  'avenirStatus',
];

const parseOpportunityValue = (rawValue) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildManualEntryPayload = (raw = {}) => {
  const payload = {};
  FORM_EDITABLE_FIELDS.forEach((fieldKey) => {
    if (fieldKey === 'opportunityValue') {
      payload[fieldKey] = parseOpportunityValue(raw[fieldKey]);
      return;
    }
    payload[fieldKey] = normalizeTextValue(raw[fieldKey]);
  });
  payload.refKey = normalizeRefKey(payload.opportunityRefNo);
  return payload;
};

const buildAuditActor = (req) => ({
  changedBy: req.user?.email || 'unknown',
  changedByDisplayName: req.user?.displayName || req.user?.email || 'unknown',
  changedByRole: req.user?.role || '',
  ipAddress: req.ip || '',
  userAgent: String(req.headers['user-agent'] || ''),
  authUser: getUsernameFromRequest(req) || '',
});

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

const loadManualUpdateSnapshots = async () => {
  const manualUpdates = await OpportunityManualUpdate.find({}).lean();
  return new Map(
    manualUpdates
      .map((row) => [normalizeRefKey(row?.opportunityRefNo || row?.refKey || ''), row])
      .filter(([ref]) => Boolean(ref))
  );
};

const alignManualSnapshotsToSyncedValues = async (alignmentByRef = new Map(), updatedBy = '') => {
  const ops = [];

  alignmentByRef.forEach((fields, refKey) => {
    if (!refKey || !fields || Object.keys(fields).length === 0) return;
    ops.push({
      updateOne: {
        filter: { refKey },
        update: {
          $set: {
            ...fields,
            updatedBy,
          },
        },
      },
    });
  });

  if (!ops.length) return;
  await OpportunityManualUpdate.bulkWrite(ops, { ordered: false });
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).replace(/\u00A0/g, ' ').replace(/[–—]/g, '-').trim();
  if (!raw) return null;

  const hasExplicitYear = /\b(19|20)\d{2}\b/.test(raw) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(raw);
  if (!hasExplicitYear) {
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const parsedIso = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
      return Number.isNaN(parsedIso.getTime()) ? null : parsedIso;
    }
    return null;
  }

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

const applyOpportunityDateFields = (opportunity = {}) => {
  const rawGraphData = opportunity?.rawGraphData || {};
  const year = opportunity?.rawSheetYear || rawGraphData?.year || '';
  const dateReceived = opportunity?.rawDateReceived ?? rawGraphData?.dateReceived;
  const submissionDeadlineRaw = opportunity?.rawSubmissionDeadline ?? rawGraphData?.submissionDeadlineRaw;
  const tenderSubmittedRaw = opportunity?.rawTenderSubmittedDate ?? rawGraphData?.tenderSubmittedRaw;

  if (!year && dateReceived === undefined && submissionDeadlineRaw === undefined && tenderSubmittedRaw === undefined) {
    return opportunity;
  }

  const dateTenderReceived = parseGraphDate(year, dateReceived) || opportunity?.dateTenderReceived || null;
  const tenderPlannedSubmissionDate = parseGraphDate(year, submissionDeadlineRaw) || opportunity?.tenderPlannedSubmissionDate || null;
  const tenderSubmittedDate = parseGraphDate(year, tenderSubmittedRaw) || opportunity?.tenderSubmittedDate || null;

  return {
    ...opportunity,
    dateTenderReceived,
    tenderPlannedSubmissionDate,
    tenderSubmittedDate,
    rawGraphData: {
      ...rawGraphData,
      rfpReceivedDisplay: buildDateDisplay(year, dateReceived, dateTenderReceived),
      plannedSubmissionDisplay: buildDateDisplay(year, submissionDeadlineRaw, tenderPlannedSubmissionDate),
      tenderSubmittedDisplay: buildDateDisplay(year, tenderSubmittedRaw, tenderSubmittedDate),
    },
  };
};

const isTenderRecentForTelecast = (opportunity, now = new Date()) => {
  const received = getTenderReceivedDate(opportunity);
  if (!received) return false;
  const ageMs = now.getTime() - received.getTime();
  if (ageMs < 0) return false;
  return ageMs <= TELECAST_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

const TELECAST_TEMPLATE_KEYWORDS = [
  '{{TENDER_NO}}', '{{TENDER_NAME}}', '{{CLIENT}}', '{{GROUP}}', '{{TENDER_TYPE}}', '{{DATE_TENDER_RECD}}', '{{SUBMISSION_DATE}}', '{{YEAR}}', '{{LEAD}}', '{{OPPORTUNITY_ID}}', '{{COMMENTS}}',
];

const POST_BID_DETAIL_TYPES = [
  'TECHNICAL_CLARIFICATION_MEETING',
  'TECHNICAL_PRESENTATION',
  'NO_RESPONSE',
  'OTHER',
];

const normalizePostBidDetailType = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  return POST_BID_DETAIL_TYPES.includes(normalized) ? normalized : '';
};

const normalizeEmailList = (value) => {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[\n,;]+/g);
  return [...new Set(parts.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
};

const canEditPostBidDetails = (config, user) => {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'MASTER') return true;
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email) return false;
  const allowedEmails = normalizeEmailList(config?.postBidAllowedEmails || []);
  return allowedEmails.includes(email);
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeLeadValue = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeLeadKey = (value = '') => normalizeLeadValue(value).replace(/\s+/g, ' ').trim();

const buildLeadNameRegex = (leadName = '') => {
  const normalized = normalizeLeadKey(leadName);
  if (!normalized) return null;
  const tokens = normalized.split(' ').map((token) => escapeRegex(token));
  const pattern = `^\\s*${tokens.join('\\s+')}\\s*$`;
  return new RegExp(pattern, 'i');
};

const buildLeadEmailDirectory = (mappings = []) => {
  const directory = new Map();
  mappings.forEach((mapping) => {
    const email = String(mapping?.leadEmail || '').trim().toLowerCase();
    if (!email) return;
    const key = normalizeLeadKey(mapping?.leadNameKey || mapping?.leadNameDisplay || '');
    if (key && !directory.has(key)) {
      directory.set(key, email);
    }
  });
  return directory;
};

const tokenizeLeadValue = (value = '') => normalizeLeadValue(value).split(' ').filter(Boolean);

const scoreLeadEmailMatch = (leadName = '', user = {}) => {
  const leadNorm = normalizeLeadValue(leadName);
  if (!leadNorm) return 0;

  const displayNorm = normalizeLeadValue(user.displayName || '');
  const emailLocal = normalizeLeadValue(String(user.email || '').split('@')[0].replace(/[._-]+/g, ' '));

  if (leadNorm && displayNorm && leadNorm === displayNorm) return 100;
  if (leadNorm && emailLocal && leadNorm === emailLocal) return 95;

  const leadTokens = tokenizeLeadValue(leadNorm);
  if (!leadTokens.length) return 0;

  const overlapScore = (candidate) => {
    const candidateTokens = tokenizeLeadValue(candidate);
    if (!candidateTokens.length) return 0;
    let matches = 0;
    leadTokens.forEach((token) => {
      if (candidateTokens.includes(token)) matches += 1;
    });
    return matches / leadTokens.length;
  };

  const displayScore = overlapScore(displayNorm);
  const emailScore = overlapScore(emailLocal);
  const maxScore = Math.max(displayScore, emailScore);

  if (!maxScore) return 0;
  const baseScore = Math.round(85 * maxScore);
  const includesBonus = (displayNorm.includes(leadNorm) || emailLocal.includes(leadNorm)) ? 5 : 0;
  return Math.min(90, baseScore + includesBonus);
};

const findBestLeadEmailMatch = (leadName = '', users = []) => {
  let best = null;
  let bestScore = 0;
  users.forEach((user) => {
    const score = scoreLeadEmailMatch(leadName, user);
    if (score > bestScore) {
      bestScore = score;
      best = user;
    }
  });
  return { best, score: bestScore };
};

const resolveLeadEmailForOpportunity = (opportunity, leadDirectory = null) => {
  const direct = String(opportunity?.leadEmail || '').trim().toLowerCase();
  if (direct) {
    return { email: direct, source: 'opportunity' };
  }
  if (!leadDirectory) {
    return { email: '', source: 'missing' };
  }
  const leadKey = normalizeLeadKey(opportunity?.internalLead || '');
  if (leadKey && leadDirectory.has(leadKey)) {
    return { email: leadDirectory.get(leadKey), source: 'mapping' };
  }
  return { email: '', source: 'missing' };
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const getGroupFromOpportunity = (opportunity) => {
  const raw = String(opportunity?.groupClassification || opportunity?.rawGraphData?.rowSnapshot?.['GDS/GES'] || '').toUpperCase().trim();
  if (raw.includes('GES')) return 'GES';
  if (raw.includes('GDS')) return 'GDS';
  if (raw.includes('GTS')) return 'GTS';
  return 'UNKNOWN';
};

const getSubmissionDate = (opportunity) => (
  opportunity?.tenderSubmittedDate
  || opportunity?.tenderPlannedSubmissionDate
  || opportunity?.rawGraphData?.rowSnapshot?.['SUBMISSION DATE']
  || ''
);

const getTemplateValues = (opportunity) => {
  const row = opportunity?.rawGraphData?.rowSnapshot || {};
  const tenderNo = opportunity?.opportunityRefNo || row['TENDER NO'] || '';
  const tenderName = opportunity?.tenderName || row['TENDER NAME'] || '';
  const client = opportunity?.clientName || row.CLIENT || '';
  const group = getGroupFromOpportunity(opportunity);
  const tenderType = opportunity?.opportunityClassification || row['TENDER TYPE'] || '';
  const dateTenderRecd = opportunity?.dateTenderReceived || row['DATE TENDER RECD'] || '';
  const submissionDate = getSubmissionDate(opportunity);
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
    SUBMISSION_DATE: String(submissionDate || ''),
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

const getDateKeyLocal = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : parseDateValue(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shouldSendDeadlineAlert = (opportunity, now = new Date()) => {
  const deadlineKey = getDateKeyLocal(getSubmissionDate(opportunity));
  if (!deadlineKey) return { shouldSend: false };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = getDateKeyLocal(tomorrow);
  if (deadlineKey !== tomorrowKey) return { shouldSend: false };
  if (String(opportunity?.deadlineAlertedDateKey || '') === deadlineKey) return { shouldSend: false };
  return { shouldSend: true, deadlineKey };
};

const sendDeadlineAlertForOpportunity = async ({ opportunity, config, leadDirectory }) => {
  if (!config.deadlineAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const { email: leadEmail, source: leadEmailSource } = resolveLeadEmailForOpportunity(opportunity, leadDirectory);
  if (!leadEmail) {
    return { success: true, skipped: 'no_lead_email' };
  }

  const selectedClients = Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [];
  if (selectedClients.length) {
    const normalizedClients = new Set(selectedClients.map((client) => String(client || '').trim().toLowerCase()).filter(Boolean));
    const clientName = String(opportunity?.clientName || '').trim().toLowerCase();
    if (!normalizedClients.has(clientName)) {
      return { success: true, skipped: 'client_not_selected' };
    }
  }

  const { shouldSend, deadlineKey } = shouldSendDeadlineAlert(opportunity, new Date());
  if (!shouldSend) {
    return { success: true, skipped: 'not_due' };
  }

  const graphRefreshTokenEnc = config.telecastGraphRefreshTokenEnc || config.graphRefreshTokenEnc || config.mailRefreshTokenEnc || '';
  if (!graphRefreshTokenEnc) {
    return { success: true, skipped: 'mail_not_configured' };
  }

  const values = getTemplateValues(opportunity);
  const subjectTemplate = config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.';
  const style = getTelecastTemplateStyle(config.deadlineAlertTemplateStyle || 'sunset_alert');
  const subject = renderTemplate(subjectTemplate, values);
  const renderedBody = renderTemplate(bodyTemplate, values);
  const html = buildTelecastEmailHtml({ values, renderedBody, styleKey: style.key });
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
        toRecipients: [{ emailAddress: { address: leadEmail } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const payload = await graphResponse.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
  }

  return { success: true, deadlineKey, leadEmail, leadEmailSource };
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

const sendDeadlineAlerts = async () => {
  const config = await getSystemConfig();
  if (!config.deadlineAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const leadMappings = await LeadEmailMapping.find({}).lean();
  const leadDirectory = buildLeadEmailDirectory(leadMappings);
  const opportunities = await SyncedOpportunity.find({
    $or: [
      { leadEmail: { $exists: true, $ne: '' } },
      { internalLead: { $exists: true, $ne: '' } },
    ],
  }).lean();

  let sent = 0;
  let skipped = 0;
  for (const opportunity of opportunities) {
    try {
      const result = await sendDeadlineAlertForOpportunity({ opportunity, config, leadDirectory });
      if (result?.success && result.deadlineKey) {
        const leadEmailUpdate = result.leadEmailSource === 'mapping' && !opportunity.leadEmail
          ? {
            leadEmail: result.leadEmail,
            leadEmailSource: 'mapping',
            leadEmailAssignedBy: 'system',
            leadEmailAssignedAt: new Date(),
          }
          : {};
        await SyncedOpportunity.updateOne(
          { _id: opportunity._id },
          {
            $set: {
              deadlineAlerted: true,
              deadlineAlertedAt: new Date(),
              deadlineAlertedDateKey: result.deadlineKey,
              ...leadEmailUpdate,
            },
          }
        );
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      console.error('[deadline-alert.error]', error?.message || error);
      skipped += 1;
    }
  }

  return { success: true, sent, skipped };
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
  const startedAt = Date.now();
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
  const fetchMs = Date.now() - startedAt;
  const reduceStartedAt = Date.now();

  const alertedKeySet = new Set();
  const refSet = new Set();
  const keyAlertedAt = new Map();
  const keyState = new Map();
  let rowsWithStoredKey = 0;
  let rowsWithRef = 0;
  let fallbackKeyBuilds = 0;

  rows.forEach((row) => {
    const storedKey = String(row?.telecastAlertedKey || '').trim();
    if (storedKey) rowsWithStoredKey += 1;
    const key = storedKey || buildNotificationKey(row);
    if (!storedKey && key) fallbackKeyBuilds += 1;
    const ref = normalizeRefNo(String(row?.telecastAlertedRefNo || '').trim() || getTenderRefNo(row));
    if (ref) rowsWithRef += 1;
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
  const reduceMs = Date.now() - reduceStartedAt;

  return {
    keyState,
    alertedKeySet,
    refSet,
    keyAlertedAt,
    count: rows.length,
    timing: {
      fetchMs,
      reduceMs,
      totalMs: Date.now() - startedAt,
      rows: rows.length,
      rowsWithStoredKey,
      rowsWithRef,
      fallbackKeyBuilds,
    },
  };
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
  const delayMinutes = Math.max(0, Number(systemConfig.telecastSendDelayMinutes) || 0);
  const delayMs = delayMinutes * 60 * 1000;
  const staleCount = 0;
  let sent = 0;
  let skippedNoRecipients = 0;
  const dispatchedKeys = [];
  const dispatchedRefNos = [];

  for (let index = 0; index < rowsToSend.length; index += 1) {
    const row = rowsToSend[index];
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

    if (delayMs > 0 && index < rowsToSend.length - 1) {
      await sleep(delayMs);
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
  const syncStartedAt = Date.now();
  let stageCheckpointAt = syncStartedAt;
  const stageMs = {};
  const stageDetails = {};
  const markStage = (name) => {
    const now = Date.now();
    stageMs[name] = now - stageCheckpointAt;
    stageCheckpointAt = now;
  };

  const config = await getGraphConfig();
  markStage('loadGraphConfig');
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
  markStage('fetchTendersFromGraph');
  const opportunities = await transformTendersToOpportunities(tenders);
  markStage('transformTendersToOpportunities');

  const systemConfigStartedAt = Date.now();
  const systemConfigPromise = getSystemConfig();
  const telecastStateStartedAt = Date.now();
  const telecastStatePromise = getExistingTelecastStateFromSyncedOpportunities();
  const [systemConfig, existingTelecastState] = await Promise.all([
    systemConfigPromise,
    telecastStatePromise,
  ]);
  stageDetails.loadSystemConfigAndTelecastState = {
    getSystemConfigMs: Date.now() - systemConfigStartedAt,
    getExistingTelecastStateMs: Date.now() - telecastStateStartedAt,
    telecastStateDetails: existingTelecastState?.timing || null,
  };
  markStage('loadSystemConfigAndTelecastState');
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
  markStage('prepareAndDispatchTelecast');

  const existingOpportunityMetaPromise = SyncedOpportunity.find(
    {},
    {
      opportunityRefNo: 1,
      leadEmail: 1,
      leadEmailSource: 1,
      leadEmailAssignedAt: 1,
      leadEmailAssignedBy: 1,
      deadlineAlerted: 1,
      deadlineAlertedAt: 1,
      deadlineAlertedDateKey: 1,
      postBidDetailType: 1,
      postBidDetailOther: 1,
      postBidDetailUpdatedBy: 1,
      postBidDetailUpdatedAt: 1,
    }
  ).lean();
  const manualUpdatesByRefPromise = loadManualUpdateSnapshots();
  const [existingOpportunityMeta, manualUpdatesByRef] = await Promise.all([
    existingOpportunityMetaPromise,
    manualUpdatesByRefPromise,
  ]);
  markStage('loadExistingOpportunityMetaAndManualSnapshots');
  const metaByRef = new Map(
    existingOpportunityMeta
      .map((row) => [normalizeRefNo(row?.opportunityRefNo || ''), row])
      .filter(([ref]) => Boolean(ref))
  );
  const manualAlignmentByRef = new Map();
  const pendingConflictOps = [];

  const opportunitiesForInsert = opportunities.map((opportunity) => {
    const key = buildNotificationKey(opportunity);
    const ref = getTenderRefNo(opportunity);
    const metaSnapshot = ref ? metaByRef.get(normalizeRefNo(ref)) : null;
    const manualSnapshot = ref ? manualUpdatesByRef.get(normalizeRefKey(ref)) : null;
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

    const { opportunity: mergedOpportunity, staleFields } = applyManualOverridesToOpportunity(opportunity, manualSnapshot);
    if (manualSnapshot && staleFields.length) {
      const nextFields = staleFields.reduce((acc, fieldKey) => {
        acc[fieldKey] = mergedOpportunity?.[fieldKey] ?? opportunity?.[fieldKey] ?? '';
        return acc;
      }, {});
      manualAlignmentByRef.set(normalizeRefKey(ref), nextFields);

      staleFields.forEach((fieldKey) => {
        pendingConflictOps.push({
          updateOne: {
            filter: {
              refKey: normalizeRefKey(ref),
              fieldKey,
              status: 'pending',
            },
            update: {
              $set: {
                opportunityRefNo: ref || mergedOpportunity?.opportunityRefNo || '',
                refKey: normalizeRefKey(ref),
                fieldKey,
                fieldLabel: FIELD_LABELS[fieldKey] || fieldKey,
                sheetValue: opportunity?.[fieldKey] ?? null,
                existingValue: manualSnapshot?.[fieldKey] ?? mergedOpportunity?.[fieldKey] ?? null,
                status: 'pending',
                detectedAt: now,
              },
            },
            upsert: true,
          },
        });
      });
    }

    return {
      ...mergedOpportunity,
      leadEmail: metaSnapshot?.leadEmail || mergedOpportunity?.leadEmail || '',
      leadEmailSource: metaSnapshot?.leadEmailSource || mergedOpportunity?.leadEmailSource || '',
      leadEmailAssignedAt: metaSnapshot?.leadEmailAssignedAt || mergedOpportunity?.leadEmailAssignedAt || null,
      leadEmailAssignedBy: metaSnapshot?.leadEmailAssignedBy || mergedOpportunity?.leadEmailAssignedBy || '',
      deadlineAlerted: metaSnapshot?.deadlineAlerted || mergedOpportunity?.deadlineAlerted || false,
      deadlineAlertedAt: metaSnapshot?.deadlineAlertedAt || mergedOpportunity?.deadlineAlertedAt || null,
      deadlineAlertedDateKey: metaSnapshot?.deadlineAlertedDateKey || mergedOpportunity?.deadlineAlertedDateKey || '',
      postBidDetailType: metaSnapshot?.postBidDetailType || mergedOpportunity?.postBidDetailType || '',
      postBidDetailOther: metaSnapshot?.postBidDetailOther || mergedOpportunity?.postBidDetailOther || '',
      postBidDetailUpdatedBy: metaSnapshot?.postBidDetailUpdatedBy || mergedOpportunity?.postBidDetailUpdatedBy || '',
      postBidDetailUpdatedAt: metaSnapshot?.postBidDetailUpdatedAt || mergedOpportunity?.postBidDetailUpdatedAt || null,
      telecastAlerted: isAlerted,
      telecastAlertedAt,
      telecastAlertedKey: key || '',
      telecastAlertedRefNo: ref || '',
      telecastAlertSource,
    };
  });
  markStage('buildMergedRowsForInsert');

  const deleteStartedAt = Date.now();
  await SyncedOpportunity.deleteMany({});
  const deleteMs = Date.now() - deleteStartedAt;
  const insertStartedAt = Date.now();
  const inserted = await SyncedOpportunity.insertMany(opportunitiesForInsert);
  const insertMs = Date.now() - insertStartedAt;
  stageDetails.replaceSyncedOpportunityCollection = {
    deleteManyMs: deleteMs,
    insertManyMs: insertMs,
    insertedCount: inserted.length,
    inputCount: opportunitiesForInsert.length,
  };
  markStage('replaceSyncedOpportunityCollection');
  const postSyncTasks = [
    alignManualSnapshotsToSyncedValues(manualAlignmentByRef, `sync:${source}`),
    syncClientsFromOpportunities(opportunities),
  ];
  if (pendingConflictOps.length) {
    postSyncTasks.push(OpportunityFieldConflict.bulkWrite(pendingConflictOps, { ordered: false }));
  }
  const [_, clientSyncResult] = await Promise.all(postSyncTasks);
  stageDetails.postSyncWrites = {
    manualAlignCount: manualAlignmentByRef.size,
    pendingConflictOpsCount: pendingConflictOps.length,
  };
  markStage('postSyncWrites');

  config.lastSyncAt = now;

  systemConfig.telecastAlertedKeys = Array.from(alertedKeySet).slice(-MAX_ALERTED_TRACKED_KEYS);
  systemConfig.telecastAlertedRefNos = Array.from(alertedRefSet).slice(-MAX_ALERTED_TRACKED_REFS);
  pushWeeklyTelecastStats(systemConfig, newRows);

  await Promise.all([config.save(), systemConfig.save()]);
  markStage('saveConfigs');

  // Ensure subsequent /api/opportunities responses reflect newly synced rows immediately.
  invalidateOpportunitiesCache(`graph_sync:${source}`);
  await warmOpportunitiesCache(`graph_sync:${source}`);
  stageDetails.warmOpportunitiesCache = opportunitiesListCache.meta || null;
  markStage('warmOpportunitiesCache');
  const syncTotalMs = Date.now() - syncStartedAt;

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
    syncTiming: {
      totalMs: syncTotalMs,
      stageMs,
      stageDetails,
    },
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
    syncTiming: {
      totalMs: syncTotalMs,
      stageMs,
      stageDetails,
    },
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
let notificationCheckRunning = false;

const scheduleDailyNotificationCheck = () => {
  if (dailyNotificationTimer) {
    clearInterval(dailyNotificationTimer);
    dailyNotificationTimer = null;
  }

  dailyNotificationTimer = setInterval(async () => {
    if (notificationCheckRunning) return;
    notificationCheckRunning = true;

    try {
      const config = await getSystemConfig();
      const lastCheckedAt = config?.notificationLastCheckedAt ? new Date(config.notificationLastCheckedAt) : null;
      if (lastCheckedAt && (Date.now() - lastCheckedAt.getTime()) < (60 * 60 * 1000)) {
        return;
      }

      let syncResult = { insertedCount: 0, newRowsCount: 0, skipped: 'sync_not_run' };
      try {
        syncResult = await syncFromConfiguredGraph({ source: 'hourly_notification' });
      } catch (syncError) {
        console.error('[notification.daily-check.sync-failure]', JSON.stringify({
          runKey: new Date().toISOString(),
          message: syncError?.message || String(syncError),
        }));
      }

      const deadlineResult = await sendDeadlineAlerts();
      const runKey = new Date().toISOString();
      const syncStatus = syncResult?.skipped === 'sync_not_run' ? 'failed' : 'ok';
      console.log('[notification.daily-check.success]', JSON.stringify({
        runKey,
        syncStatus,
        insertedCount: syncResult.insertedCount,
        newRowsCount: syncResult.newRowsCount,
        deadlineSent: deadlineResult?.sent || 0,
        deadlineSkipped: deadlineResult?.skipped || 0,
      }));
    } catch (error) {
      const runKey = new Date().toISOString();
      console.error('[notification.daily-check.failure]', JSON.stringify({
        runKey,
        message: error?.message || String(error),
      }));
    } finally {
      notificationCheckRunning = false;
    }
  }, 60 * 1000);

  console.log('⏰ Notification check scheduler active (hourly, 24/7).');
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return '';
};

const createSessionToken = (user = {}) => jwt.sign(
  {
    email: String(user.email || '').toLowerCase(),
    displayName: String(user.displayName || user.email || ''),
    role: String(user.role || ''),
    status: String(user.status || ''),
    assignedGroup: user.assignedGroup || null,
  },
  SESSION_JWT_SECRET,
  {
    expiresIn: SESSION_TOKEN_TTL,
    audience: 'opportunity-dashboard',
    issuer: 'opportunitydash-auth',
    subject: String(user.email || '').toLowerCase(),
  }
);

const parseSessionToken = (token = '') => {
  try {
    if (!token || !token.includes('.')) return null;
    return jwt.verify(token, SESSION_JWT_SECRET, {
      audience: 'opportunity-dashboard',
      issuer: 'opportunitydash-auth',
    });
  } catch {
    return null;
  }
};

const getUsernameFromRequest = (req) => {
  const bearer = getBearerToken(req);
  const parsed = parseSessionToken(bearer);
  if (parsed?.email) {
    return String(parsed.email).trim().toLowerCase();
  }

  if (ALLOW_LEGACY_EMAIL_BEARER && bearer) {
    return bearer.trim().toLowerCase();
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

const localAuthorizedUsers = new Map();
const localPermissionConfig = {
  pageRoleAccess: {},
  pageRoleExcludeAccess: {},
  pageEmailAccess: {},
  actionRoleAccess: {},
  actionEmailAccess: {},
};

function isBootstrapMaster(email) {
  return BOOTSTRAP_MASTER_EMAILS.has(String(email || '').trim().toLowerCase());
}

function buildLocalUser(email, overrides = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const bootstrapMaster = isBootstrapMaster(normalizedEmail);
  const now = new Date();
  return {
    _id: overrides._id || normalizedEmail,
    email: normalizedEmail,
    displayName: overrides.displayName || normalizedEmail,
    role: overrides.role || (bootstrapMaster ? 'Master' : 'Basic'),
    assignedGroup: Object.prototype.hasOwnProperty.call(overrides, 'assignedGroup') ? overrides.assignedGroup : null,
    status: overrides.status || (bootstrapMaster ? 'approved' : 'pending'),
    lastLogin: overrides.lastLogin || null,
    createdAt: overrides.createdAt || now,
    approvedBy: Object.prototype.hasOwnProperty.call(overrides, 'approvedBy') ? overrides.approvedBy : (bootstrapMaster ? 'system-bootstrap' : null),
    approvedAt: Object.prototype.hasOwnProperty.call(overrides, 'approvedAt') ? overrides.approvedAt : (bootstrapMaster ? now : null),
  };
}

function getLocalAuthorizedUser(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  return localAuthorizedUsers.get(normalizedEmail) || null;
}

function upsertLocalAuthorizedUser(email, overrides = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const existing = getLocalAuthorizedUser(normalizedEmail);
  const nextUser = buildLocalUser(normalizedEmail, { ...(existing || {}), ...overrides });
  localAuthorizedUsers.set(normalizedEmail, nextUser);
  return nextUser;
}

function listLocalAuthorizedUsers() {
  return Array.from(localAuthorizedUsers.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function ensureCollectionExists(model, collectionName) {
  const existingCollections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
  if (!existingCollections.length) {
    await model.createCollection();
    console.log('[mongo.collection.created]', JSON.stringify({
      collection: collectionName,
      timestamp: new Date().toISOString(),
    }));
  }
}

async function ensureBootstrapMasterUser(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;

  await AuthorizedUser.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $setOnInsert: {
        email: normalizedEmail,
        createdAt: new Date(),
      },
      $set: {
        displayName: normalizedEmail,
        role: 'Master',
        status: 'approved',
        approvedBy: 'system-bootstrap',
        approvedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('[mongo.bootstrap-master.ready]', JSON.stringify({
    email: normalizedEmail,
    timestamp: new Date().toISOString(),
  }));
}

async function ensureInitialMongoState() {
  await ensureCollectionExists(AuthorizedUser, 'authorizedusers');
  await ensureCollectionExists(SyncedOpportunity, 'syncedopportunities');
  await ensureCollectionExists(OpportunityManualUpdate, 'opportunitymanualupdates');
  await ensureCollectionExists(OpportunityProbation, 'opportunityprobations');
  await ensureCollectionExists(OpportunityChangeLog, 'opportunitychangelogs');
  await ensureCollectionExists(OpportunityFieldConflict, 'opportunityfieldconflicts');
  await ensureCollectionExists(ProjectUpdate, 'projectupdates');
  await ensureCollectionExists(BDEngagement, 'bdengagements');
  await ensureBootstrapMasterUser('arjun.s@avenirengineering.com');
}

const verifyToken = async (req, res, next) => {
  const startedAt = Date.now();
  try {
    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ error: 'Missing username authorization' });
    }

    if (DISABLE_MONGODB) {
      const user = getLocalAuthorizedUser(username);
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
      req.authVerifyMs = Date.now() - startedAt;
      return next();
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
    req.authVerifyMs = Date.now() - startedAt;
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
    if (!isDatabaseReady()) {
      console.warn('[auth.verify-token.db-unavailable]', JSON.stringify(requestMeta));
      return respondDatabaseUnavailable(res);
    }

    const rawUsername = req.body?.username || req.body?.token;
    const username = rawUsername?.toString().trim().toLowerCase();
    if (!username) {
      console.warn('[auth.verify-token.invalid-request]', JSON.stringify({
        ...requestMeta,
        reason: 'missing_username',
      }));
      return res.status(400).json({ error: 'Username is required' });
    }

    if (DISABLE_MONGODB) {
      let user = getLocalAuthorizedUser(username);
      if (!user) {
        const bootstrapMaster = isBootstrapMaster(username);
        user = upsertLocalAuthorizedUser(username, {
          displayName: username,
          role: bootstrapMaster ? 'Master' : 'Basic',
          status: bootstrapMaster ? 'approved' : 'pending',
        });
      } else if (isBootstrapMaster(username) && (user.role !== 'Master' || user.status !== 'approved')) {
        user = upsertLocalAuthorizedUser(username, {
          role: 'Master',
          status: 'approved',
          approvedBy: 'system-bootstrap',
          approvedAt: new Date(),
        });
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
        sessionToken: createSessionToken(user),
        message: user.status === 'pending'
          ? 'User pending approval. Master will review your request.'
          : 'Login successful',
      });
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
        sessionToken: createSessionToken(user),
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
      sessionToken: createSessionToken(user),
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
    if (DISABLE_MONGODB) {
      upsertLocalAuthorizedUser(req.user.email, { lastLogin: new Date() });
      return res.json({ success: true, message: 'Login recorded locally' });
    }

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

    if (DISABLE_MONGODB) {
      return res.json(listLocalAuthorizedUsers().map(mapIdField));
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

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'];
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

    const existing = DISABLE_MONGODB
      ? getLocalAuthorizedUser(email)
      : await AuthorizedUser.findOne({ email });
    if (existing?.role === 'Master' || existing?.role === 'MASTER') {
      return res.status(403).json({ error: 'Modifying Master users is not allowed' });
    }

    const nextPayload = {
      email,
      displayName: displayName || email,
      role,
      assignedGroup: role === 'SVP' ? assignedGroupRaw : null,
      status: ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved',
      approvedBy: req.user.email,
      approvedAt: new Date(),
    };
    const user = DISABLE_MONGODB
      ? upsertLocalAuthorizedUser(email, nextPayload)
      : await AuthorizedUser.findOneAndUpdate(
        { email },
        nextPayload,
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

    const normalizedEmail = email.toLowerCase();
    const user = DISABLE_MONGODB
      ? upsertLocalAuthorizedUser(normalizedEmail, {
        status: 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      })
      : await AuthorizedUser.findOneAndUpdate(
        { email: normalizedEmail },
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

    const normalizedEmail = email.toLowerCase();
    const user = DISABLE_MONGODB
      ? upsertLocalAuthorizedUser(normalizedEmail, {
        status: 'rejected',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      })
      : await AuthorizedUser.findOneAndUpdate(
        { email: normalizedEmail },
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

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'MASTER', 'PROPOSAL_HEAD'];
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

    const normalizedEmail = email.toLowerCase();
    const existing = DISABLE_MONGODB
      ? getLocalAuthorizedUser(normalizedEmail)
      : await AuthorizedUser.findOne({ email: normalizedEmail });
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
    const user = DISABLE_MONGODB
      ? upsertLocalAuthorizedUser(normalizedEmail, update)
      : await AuthorizedUser.findOneAndUpdate(
        { email: normalizedEmail },
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

    const normalizedEmail = email.toLowerCase();
    const target = DISABLE_MONGODB
      ? getLocalAuthorizedUser(normalizedEmail)
      : await AuthorizedUser.findOne({ email: normalizedEmail });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'Master' || target.role === 'MASTER') {
      return res.status(403).json({ error: 'Removing Master users is not allowed' });
    }

    if (DISABLE_MONGODB) {
      localAuthorizedUsers.delete(normalizedEmail);
      return res.json({ success: true, message: 'User removed' });
    }

    const result = await AuthorizedUser.deleteOne({ email: normalizedEmail });

    res.json({ success: true, message: 'User removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/lead-email/suggestions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;

    const users = await AuthorizedUser.find().lean();
    const mappings = await LeadEmailMapping.find({}).lean();
    const mappingKeys = new Set(
      mappings.map((row) => normalizeLeadKey(row.leadNameKey || row.leadNameDisplay || ''))
    );

    const opportunities = await SyncedOpportunity.find(
      { internalLead: { $exists: true, $ne: '' } },
      { internalLead: 1, opportunityRefNo: 1, tenderName: 1, leadEmail: 1 }
    ).lean();

    const leadBuckets = new Map();
    opportunities.forEach((opportunity) => {
      const leadName = String(opportunity.internalLead || '').trim();
      if (!leadName) return;
      const key = normalizeLeadKey(leadName);
      if (!key) return;
      const bucket = leadBuckets.get(key) || {
        leadName,
        leadNameKey: key,
        count: 0,
        tenders: [],
        hasLeadEmail: false,
        nameCounts: new Map(),
      };
      bucket.count += 1;
      bucket.hasLeadEmail = bucket.hasLeadEmail || Boolean(String(opportunity.leadEmail || '').trim());
      bucket.nameCounts.set(leadName, (bucket.nameCounts.get(leadName) || 0) + 1);
      if (bucket.tenders.length < 8) {
        bucket.tenders.push({
          refNo: opportunity.opportunityRefNo || '',
          tenderName: opportunity.tenderName || '',
        });
      }
      leadBuckets.set(key, bucket);
    });

    const suggestions = [];
    leadBuckets.forEach((bucket, leadKey) => {
      if (mappingKeys.has(leadKey) || bucket.hasLeadEmail) return;
      let displayName = bucket.leadName || '';
      let maxCount = 0;
      bucket.nameCounts.forEach((count, name) => {
        if (count > maxCount) {
          maxCount = count;
          displayName = name;
        }
      });

      const { best, score } = findBestLeadEmailMatch(displayName, users);
      suggestions.push({
        leadName: displayName,
        leadNameKey: leadKey,
        tenderCount: bucket.count,
        tenders: bucket.tenders,
        suggestedEmail: best?.email || '',
        score: score || 0,
      });
    });

    suggestions.sort((a, b) => (b.tenderCount - a.tenderCount) || (b.score - a.score));
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/lead-email/approve', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;

    const leadNameKey = normalizeLeadKey(String(req.body?.leadNameKey || req.body?.leadName || '').trim());
    const leadNameDisplay = String(req.body?.leadName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!leadNameKey || !email) {
      return res.status(400).json({ error: 'leadName and email are required' });
    }

    const now = new Date();
    const mapping = await LeadEmailMapping.findOneAndUpdate(
      { leadNameKey },
      {
        leadNameKey,
        leadNameDisplay: leadNameDisplay || leadNameKey,
        leadEmail: email,
        approvedBy: req.user.email,
        approvedAt: now,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const leadPattern = buildLeadNameRegex(leadNameDisplay || leadNameKey);
    if (leadPattern) {
      await SyncedOpportunity.updateMany(
        { internalLead: leadPattern },
        {
          $set: {
            leadEmail: email,
            leadEmailSource: 'mapping',
            leadEmailAssignedBy: req.user.email,
            leadEmailAssignedAt: now,
          },
        }
      );
    }

    res.json({ success: true, mapping });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/lead-email/assigned', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;
    const mappings = await LeadEmailMapping.find({}).lean();
    if (!mappings.length) return res.json({ leads: [] });

    const opportunities = await SyncedOpportunity.find(
      { internalLead: { $exists: true, $ne: '' } },
      { internalLead: 1, opportunityRefNo: 1, tenderName: 1 }
    ).lean();

    const leads = mappings.map((mapping) => {
      const leadKey = normalizeLeadKey(mapping.leadNameKey || mapping.leadNameDisplay || '');
      if (!leadKey) return null;
      const tenders = [];
      let count = 0;
      opportunities.forEach((opportunity) => {
        const leadName = String(opportunity.internalLead || '').trim();
        if (!leadName) return;
        const key = normalizeLeadKey(leadName);
        if (key !== leadKey) return;
        count += 1;
        if (tenders.length < 8) {
          tenders.push({
            refNo: opportunity.opportunityRefNo || '',
            tenderName: opportunity.tenderName || '',
          });
        }
      });
      return {
        leadName: mapping.leadNameDisplay || mapping.leadNameKey || '',
        leadNameKey: mapping.leadNameKey || '',
        leadEmail: mapping.leadEmail || '',
        count,
        tenders,
      };
    }).filter(Boolean);

    leads.sort((a, b) => b.count - a.count);
    res.json({ leads });
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

app.post('/api/graph/auth/bootstrap', graphAuthBootstrapLimiter, verifyToken, async (req, res) => {
  const username = req.body?.username || '';
  try {
    if (!await requireActionPermission(req, res, 'graph_auth_write')) return;

    const { password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const normalizedUsername = String(username).trim().toLowerCase();
    if (GRAPH_BOOTSTRAP_ALLOWED_USERS.size > 0 && !GRAPH_BOOTSTRAP_ALLOWED_USERS.has(normalizedUsername)) {
      return res.status(403).json({ error: 'This username is not allow-listed for delegated Graph bootstrap' });
    }

    const tokenResult = await bootstrapDelegatedToken({ username: normalizedUsername, password });
    if (!tokenResult.refreshToken) {
      return res.status(500).json({ error: 'No refresh token returned. Check Azure app delegated permissions and token settings.' });
    }

    const config = await getGraphConfig();
    config.graphAuthMode = 'delegated';
    config.graphAccountUsername = normalizedUsername;
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
      const consentUrl = buildDelegatedConsentUrl({ loginHint: String(username || '').trim().toLowerCase() });
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
  'bd_engagements',
  'master',
  'master_general',
  'master_users',
  'master_data_sync',
  'master_telecast',
  'master_update',
  'master_export',
];
const ROLE_KEYS = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'];
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
  'manual_opportunity_updates_write',
  'export_template_write',
  'notification_alert_flags_write',
  'lead_email_manage',
  'logs_cleanup',
];
const DEFAULT_PAGE_ROLE_ACCESS = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bd_engagements: ['Master', 'Admin', 'BDTeam'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
  master_update: ['Master', 'Admin'],
  master_export: ['Master', 'Admin'],
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
  manual_opportunity_updates_write: ['Master', 'Admin'],
  export_template_write: ['Master'],
  notification_alert_flags_write: ['Master', 'Admin'],
  lead_email_manage: ['Master', 'Admin'],
  logs_cleanup: ['Master'],
};

const DEFAULT_EXPORT_TEMPLATE_CONFIG = {
  sheetName: 'Opportunities',
  title: 'Opportunity Export',
  introText: 'Generated from the Avenir dashboard export.',
  showLogo: true,
  logoDataUrl: '',
  logoRow: 1,
  logoColumn: 1,
  logoWidth: 150,
  logoHeight: 46,
  titleRow: 1,
  titleColumn: 3,
  titleRowSpan: 1,
  titleColumnSpan: 4,
  titleHorizontalAlign: 'left',
  titleVerticalAlign: 'middle',
  introRow: 2,
  introColumn: 3,
  introRowSpan: 2,
  introColumnSpan: 5,
  introHorizontalAlign: 'left',
  introVerticalAlign: 'top',
  headerRow: 4,
  headerColumn: 1,
  headerHorizontalAlign: 'left',
  headerVerticalAlign: 'middle',
  headerBackgroundColor: '#1D4ED8',
  headerTextColor: '#FFFFFF',
  titleColor: '#0F172A',
  introColor: '#475569',
  columnWidths: Array.from({ length: 12 }, () => 18),
  rowHeights: Array.from({ length: 20 }, () => 24),
};

const normalizeHexColor = (value, fallback) => {
  const candidate = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(candidate) ? candidate.toUpperCase() : fallback;
};

const normalizeIntegerInRange = (value, fallback, min, max) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizeExportHorizontalAlign = (value, fallback) => (
  ['left', 'center', 'right'].includes(String(value || '').trim()) ? String(value).trim() : fallback
);

const normalizeExportVerticalAlign = (value, fallback) => (
  ['top', 'middle', 'bottom'].includes(String(value || '').trim()) ? String(value).trim() : fallback
);

const normalizeSizedNumberArray = (value, fallback, min, max) => {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => normalizeIntegerInRange(source[index], item, min, max));
};

const normalizeExportTemplateConfig = (input = {}) => {
  const logoDataUrl = String(input.logoDataUrl || '').trim();
  const safeLogo = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(logoDataUrl) && logoDataUrl.length <= 8_000_000
    ? logoDataUrl
    : '';
  return {
    sheetName: String(input.sheetName || DEFAULT_EXPORT_TEMPLATE_CONFIG.sheetName).trim() || DEFAULT_EXPORT_TEMPLATE_CONFIG.sheetName,
    title: String(input.title || DEFAULT_EXPORT_TEMPLATE_CONFIG.title).trim() || DEFAULT_EXPORT_TEMPLATE_CONFIG.title,
    introText: String(input.introText || DEFAULT_EXPORT_TEMPLATE_CONFIG.introText).trim(),
    showLogo: input.showLogo ?? DEFAULT_EXPORT_TEMPLATE_CONFIG.showLogo,
    logoDataUrl: safeLogo,
    logoRow: normalizeIntegerInRange(input.logoRow, DEFAULT_EXPORT_TEMPLATE_CONFIG.logoRow, 1, 20),
    logoColumn: normalizeIntegerInRange(input.logoColumn, DEFAULT_EXPORT_TEMPLATE_CONFIG.logoColumn, 1, 12),
    logoWidth: normalizeIntegerInRange(input.logoWidth, DEFAULT_EXPORT_TEMPLATE_CONFIG.logoWidth, 40, 360),
    logoHeight: normalizeIntegerInRange(input.logoHeight, DEFAULT_EXPORT_TEMPLATE_CONFIG.logoHeight, 20, 180),
    titleRow: normalizeIntegerInRange(input.titleRow, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleRow, 1, 20),
    titleColumn: normalizeIntegerInRange(input.titleColumn, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleColumn, 1, 12),
    titleRowSpan: normalizeIntegerInRange(input.titleRowSpan, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleRowSpan, 1, 6),
    titleColumnSpan: normalizeIntegerInRange(input.titleColumnSpan, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleColumnSpan, 1, 12),
    titleHorizontalAlign: normalizeExportHorizontalAlign(input.titleHorizontalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleHorizontalAlign),
    titleVerticalAlign: normalizeExportVerticalAlign(input.titleVerticalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleVerticalAlign),
    introRow: normalizeIntegerInRange(input.introRow, DEFAULT_EXPORT_TEMPLATE_CONFIG.introRow, 1, 24),
    introColumn: normalizeIntegerInRange(input.introColumn, DEFAULT_EXPORT_TEMPLATE_CONFIG.introColumn, 1, 12),
    introRowSpan: normalizeIntegerInRange(input.introRowSpan, DEFAULT_EXPORT_TEMPLATE_CONFIG.introRowSpan, 1, 8),
    introColumnSpan: normalizeIntegerInRange(input.introColumnSpan, DEFAULT_EXPORT_TEMPLATE_CONFIG.introColumnSpan, 1, 12),
    introHorizontalAlign: normalizeExportHorizontalAlign(input.introHorizontalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.introHorizontalAlign),
    introVerticalAlign: normalizeExportVerticalAlign(input.introVerticalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.introVerticalAlign),
    headerRow: normalizeIntegerInRange(input.headerRow, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerRow, 2, 30),
    headerColumn: normalizeIntegerInRange(input.headerColumn, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerColumn, 1, 12),
    headerHorizontalAlign: normalizeExportHorizontalAlign(input.headerHorizontalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerHorizontalAlign),
    headerVerticalAlign: normalizeExportVerticalAlign(input.headerVerticalAlign, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerVerticalAlign),
    headerBackgroundColor: normalizeHexColor(input.headerBackgroundColor, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerBackgroundColor),
    headerTextColor: normalizeHexColor(input.headerTextColor, DEFAULT_EXPORT_TEMPLATE_CONFIG.headerTextColor),
    titleColor: normalizeHexColor(input.titleColor, DEFAULT_EXPORT_TEMPLATE_CONFIG.titleColor),
    introColor: normalizeHexColor(input.introColor, DEFAULT_EXPORT_TEMPLATE_CONFIG.introColor),
    columnWidths: normalizeSizedNumberArray(input.columnWidths, DEFAULT_EXPORT_TEMPLATE_CONFIG.columnWidths, 8, 48),
    rowHeights: normalizeSizedNumberArray(input.rowHeights, DEFAULT_EXPORT_TEMPLATE_CONFIG.rowHeights, 16, 80),
  };
};

const getExportTemplateConfigResponse = (config) => normalizeExportTemplateConfig({
  sheetName: config?.exportTemplateSheetName,
  title: config?.exportTemplateTitle,
  introText: config?.exportTemplateIntroText,
  showLogo: config?.exportTemplateShowLogo,
  logoDataUrl: config?.exportTemplateLogoDataUrl,
  logoRow: config?.exportTemplateLogoRow,
  logoColumn: config?.exportTemplateLogoColumn,
  logoWidth: config?.exportTemplateLogoWidth,
  logoHeight: config?.exportTemplateLogoHeight,
  titleRow: config?.exportTemplateTitleRow,
  titleColumn: config?.exportTemplateTitleColumn,
  titleRowSpan: config?.exportTemplateTitleRowSpan,
  titleColumnSpan: config?.exportTemplateTitleColumnSpan,
  titleHorizontalAlign: config?.exportTemplateTitleHorizontalAlign,
  titleVerticalAlign: config?.exportTemplateTitleVerticalAlign,
  introRow: config?.exportTemplateIntroRow,
  introColumn: config?.exportTemplateIntroColumn,
  introRowSpan: config?.exportTemplateIntroRowSpan,
  introColumnSpan: config?.exportTemplateIntroColumnSpan,
  introHorizontalAlign: config?.exportTemplateIntroHorizontalAlign,
  introVerticalAlign: config?.exportTemplateIntroVerticalAlign,
  headerRow: config?.exportTemplateHeaderRow,
  headerColumn: config?.exportTemplateHeaderColumn,
  headerHorizontalAlign: config?.exportTemplateHeaderHorizontalAlign,
  headerVerticalAlign: config?.exportTemplateHeaderVerticalAlign,
  headerBackgroundColor: config?.exportTemplateHeaderBackgroundColor,
  headerTextColor: config?.exportTemplateHeaderTextColor,
  titleColor: config?.exportTemplateTitleColor,
  introColor: config?.exportTemplateIntroColor,
  columnWidths: config?.exportTemplateColumnWidths,
  rowHeights: config?.exportTemplateRowHeights,
});

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

const sanitizePageRoleExclusions = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    const list = Array.isArray(input?.[page]) ? input[page] : [];
    normalized[page] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
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
  if (DISABLE_MONGODB) {
    return {
      pageRoleAccess: sanitizePageRoleAccess(localPermissionConfig.pageRoleAccess),
      pageRoleExcludeAccess: sanitizePageRoleExclusions(localPermissionConfig.pageRoleExcludeAccess),
      pageEmailAccess: sanitizePageEmailAccess(localPermissionConfig.pageEmailAccess),
      actionRoleAccess: sanitizeActionRoleAccess(localPermissionConfig.actionRoleAccess),
      actionEmailAccess: sanitizeActionEmailAccess(localPermissionConfig.actionEmailAccess),
      isModified: () => false,
      save: async () => null,
    };
  }
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
    const excludePermissions = sanitizePageRoleExclusions(config.pageRoleExcludeAccess || {});
    const emailPermissions = sanitizePageEmailAccess(config.pageEmailAccess || {});
    if (DISABLE_MONGODB) {
      localPermissionConfig.pageRoleAccess = permissions;
      localPermissionConfig.pageRoleExcludeAccess = excludePermissions;
      localPermissionConfig.pageEmailAccess = emailPermissions;
      return res.json({ success: true, permissions, excludePermissions, emailPermissions });
    }
    if (!config.pageRoleAccess || Object.keys(config.pageRoleAccess).length === 0) {
      config.pageRoleAccess = permissions;
    }
    if (!config.pageRoleExcludeAccess || Object.keys(config.pageRoleExcludeAccess).length === 0) {
      config.pageRoleExcludeAccess = excludePermissions;
    }
    if (!config.pageEmailAccess || Object.keys(config.pageEmailAccess).length === 0) {
      config.pageEmailAccess = emailPermissions;
    }
    if (config.isModified('pageRoleAccess') || config.isModified('pageRoleExcludeAccess') || config.isModified('pageEmailAccess')) {
      await config.save();
    }
    res.json({ success: true, permissions, excludePermissions, emailPermissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'navigation_permissions_write')) return;

    const permissions = sanitizePageRoleAccess(req.body?.permissions || {});
    const excludePermissions = sanitizePageRoleExclusions(req.body?.excludePermissions || {});
    const emailPermissions = sanitizePageEmailAccess(req.body?.emailPermissions || {});
    if (DISABLE_MONGODB) {
      localPermissionConfig.pageRoleAccess = permissions;
      localPermissionConfig.pageRoleExcludeAccess = excludePermissions;
      localPermissionConfig.pageEmailAccess = emailPermissions;
      return res.json({ success: true, permissions, excludePermissions, emailPermissions });
    }
    const config = await getSystemConfig();
    config.pageRoleAccess = permissions;
    config.pageRoleExcludeAccess = excludePermissions;
    config.pageEmailAccess = emailPermissions;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, permissions, excludePermissions, emailPermissions });
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
    if (DISABLE_MONGODB) {
      localPermissionConfig.actionRoleAccess = permissions;
      localPermissionConfig.actionEmailAccess = emailPermissions;
      return res.json({ success: true, permissions, emailPermissions });
    }
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
      deadlineAlertEnabled: Boolean(config.deadlineAlertEnabled),
      deadlineTemplateSubject: config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}',
      deadlineTemplateBody: config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.',
      deadlineTemplateStyle: getTelecastTemplateStyle(config.deadlineAlertTemplateStyle).key,
      deadlineAlertClients: Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [],
      telecastSendDelayMinutes: Number.isFinite(Number(config.telecastSendDelayMinutes))
        ? Number(config.telecastSendDelayMinutes)
        : 10,
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
    const deadlineAlertEnabled = Boolean(req.body?.deadlineAlertEnabled);
    const deadlineTemplateSubject = String(req.body?.deadlineTemplateSubject || '').trim();
    const deadlineTemplateBody = String(req.body?.deadlineTemplateBody || '').trim();
    const deadlineTemplateStyle = getTelecastTemplateStyle(req.body?.deadlineTemplateStyle);
    const deadlineAlertClients = Array.isArray(req.body?.deadlineAlertClients)
      ? req.body.deadlineAlertClients.map((client) => String(client || '').trim()).filter(Boolean)
      : [];
    const telecastSendDelayMinutes = Math.max(0, Number(req.body?.telecastSendDelayMinutes) || 0);
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
    config.deadlineAlertEnabled = deadlineAlertEnabled;
    config.deadlineAlertTemplateSubject = deadlineTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}';
    config.deadlineAlertTemplateBody = deadlineTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.';
    config.deadlineAlertTemplateStyle = deadlineTemplateStyle.key;
    config.deadlineAlertClients = deadlineAlertClients;
    config.telecastSendDelayMinutes = telecastSendDelayMinutes || 0;
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
      deadlineAlertEnabled: config.deadlineAlertEnabled,
      deadlineTemplateSubject: config.deadlineAlertTemplateSubject,
      deadlineTemplateBody: config.deadlineAlertTemplateBody,
      deadlineTemplateStyle: config.deadlineAlertTemplateStyle,
      deadlineAlertClients: config.deadlineAlertClients || [],
      telecastSendDelayMinutes: config.telecastSendDelayMinutes || 0,
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

app.get('/api/export-template/config', verifyToken, async (_req, res) => {
  try {
    const config = await getSystemConfig();
    res.json({
      success: true,
      ...getExportTemplateConfigResponse(config),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export-template/config', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'export_template_write')) return;

    const templateConfig = normalizeExportTemplateConfig(req.body || {});
    const config = await getSystemConfig();
    config.exportTemplateSheetName = templateConfig.sheetName;
    config.exportTemplateTitle = templateConfig.title;
    config.exportTemplateIntroText = templateConfig.introText;
    config.exportTemplateShowLogo = templateConfig.showLogo;
    config.exportTemplateLogoDataUrl = templateConfig.logoDataUrl;
    config.exportTemplateLogoRow = templateConfig.logoRow;
    config.exportTemplateLogoColumn = templateConfig.logoColumn;
    config.exportTemplateLogoWidth = templateConfig.logoWidth;
    config.exportTemplateLogoHeight = templateConfig.logoHeight;
    config.exportTemplateTitleRow = templateConfig.titleRow;
    config.exportTemplateTitleColumn = templateConfig.titleColumn;
    config.exportTemplateTitleRowSpan = templateConfig.titleRowSpan;
    config.exportTemplateTitleColumnSpan = templateConfig.titleColumnSpan;
    config.exportTemplateTitleHorizontalAlign = templateConfig.titleHorizontalAlign;
    config.exportTemplateTitleVerticalAlign = templateConfig.titleVerticalAlign;
    config.exportTemplateIntroRow = templateConfig.introRow;
    config.exportTemplateIntroColumn = templateConfig.introColumn;
    config.exportTemplateIntroRowSpan = templateConfig.introRowSpan;
    config.exportTemplateIntroColumnSpan = templateConfig.introColumnSpan;
    config.exportTemplateIntroHorizontalAlign = templateConfig.introHorizontalAlign;
    config.exportTemplateIntroVerticalAlign = templateConfig.introVerticalAlign;
    config.exportTemplateHeaderRow = templateConfig.headerRow;
    config.exportTemplateHeaderColumn = templateConfig.headerColumn;
    config.exportTemplateHeaderHorizontalAlign = templateConfig.headerHorizontalAlign;
    config.exportTemplateHeaderVerticalAlign = templateConfig.headerVerticalAlign;
    config.exportTemplateHeaderBackgroundColor = templateConfig.headerBackgroundColor;
    config.exportTemplateHeaderTextColor = templateConfig.headerTextColor;
    config.exportTemplateTitleColor = templateConfig.titleColor;
    config.exportTemplateIntroColor = templateConfig.introColor;
    config.exportTemplateColumnWidths = templateConfig.columnWidths;
    config.exportTemplateRowHeights = templateConfig.rowHeights;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({
      success: true,
      ...getExportTemplateConfigResponse(config),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/manual-sheet-updates', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;

    const parsedRows = parseManualUpdateRows(Array.isArray(req.body?.rows) ? req.body.rows : []);
    if (!parsedRows.length) {
      return res.status(400).json({ error: 'No valid rows found. Make sure the workbook includes Avenir Ref and at least one populated update column.' });
    }

    const refKeys = parsedRows.map((row) => row.refKey).filter(Boolean);
    const [existingOpportunities, existingManualSnapshots] = await Promise.all([
      SyncedOpportunity.find({}).lean(),
      OpportunityManualUpdate.find({ refKey: { $in: refKeys } }).lean(),
    ]);

    const opportunityByRef = new Map(
      existingOpportunities
        .map((row) => [normalizeRefKey(row?.opportunityRefNo || ''), row])
        .filter(([ref]) => Boolean(ref))
    );
    const manualByRef = new Map(
      existingManualSnapshots
        .map((row) => [normalizeRefKey(row?.opportunityRefNo || row?.refKey || ''), row])
        .filter(([ref]) => Boolean(ref))
    );

    const manualOps = [];
    const syncedOps = [];
    let matchedRows = 0;
    let manualDocsUpdated = 0;
    let syncedRowsPatched = 0;

    parsedRows.forEach((row) => {
      const refKey = row.refKey;
      const existingOpportunity = opportunityByRef.get(refKey) || null;
      const previousManualSnapshot = manualByRef.get(refKey) || null;
      if (existingOpportunity) matchedRows += 1;

      const manualPatch = buildManualUpdatePatch(row, existingOpportunity);
      manualOps.push({
        updateOne: {
          filter: { refKey },
          update: {
            $set: {
              ...manualPatch,
              updatedBy: req.user?.email || 'unknown',
            },
          },
          upsert: true,
        },
      });
      manualDocsUpdated += 1;

      if (existingOpportunity) {
        const syncedPatch = buildManualOpportunityPatch(row, existingOpportunity, previousManualSnapshot);
        if (Object.keys(syncedPatch).length) {
          syncedOps.push({
            updateOne: {
              filter: { _id: existingOpportunity._id },
              update: {
                $set: syncedPatch,
              },
            },
          });
          syncedRowsPatched += 1;
        }
      }
    });

    if (manualOps.length) await OpportunityManualUpdate.bulkWrite(manualOps, { ordered: false });
    if (syncedOps.length) await SyncedOpportunity.bulkWrite(syncedOps, { ordered: false });

    res.json({
      success: true,
      receivedRows: parsedRows.length,
      matchedRows,
      manualDocsUpdated,
      syncedRowsPatched,
      message: `Processed ${parsedRows.length} update row(s).`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to apply manual sheet updates' });
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
      SUBMISSION_DATE: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
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

app.post('/api/telecast/test-deadline-mail', verifyToken, async (req, res) => {
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
    const subjectTemplate = config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.';
    const templateStyle = getTelecastTemplateStyle(config.deadlineAlertTemplateStyle || 'sunset_alert');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const testValues = {
      TENDER_NO: `AVR-DEADLINE-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      SUBMISSION_DATE: tomorrow.toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: req.user.displayName || req.user.email || 'Avenir',
      OPPORTUNITY_ID: `deadline-preview-${Date.now()}`,
      COMMENTS: 'Sample values inserted for deadline template preview.',
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

    res.json({ success: true, message: `Deadline template preview sent to ${recipientEmail}`, subject: renderedSubject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send deadline test mail' });
  }
});

app.get('/api/telecast/deadline-status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view deadline status' });
    }

    const config = await getSystemConfig();
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowKey = getDateKeyLocal(tomorrow);
    const selectedClients = Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [];
    const clientSet = new Set(selectedClients.map((client) => String(client || '').trim().toLowerCase()).filter(Boolean));

    const leadMappings = await LeadEmailMapping.find({}).lean();
    const leadDirectory = buildLeadEmailDirectory(leadMappings);
    const opportunities = await SyncedOpportunity.find(
      {},
      {
        opportunityRefNo: 1,
        tenderName: 1,
        clientName: 1,
        internalLead: 1,
        leadEmail: 1,
        tenderPlannedSubmissionDate: 1,
        tenderSubmittedDate: 1,
        deadlineAlertedDateKey: 1,
      }
    ).lean();

    const rows = opportunities
      .map((opp) => {
        const submissionDate = getSubmissionDate(opp);
        const submissionKey = getDateKeyLocal(submissionDate);
        if (!submissionKey || submissionKey !== tomorrowKey) return null;
        const clientName = String(opp.clientName || '').trim().toLowerCase();
        const resolvedLead = resolveLeadEmailForOpportunity(opp, leadDirectory);
        const leadEmail = String(resolvedLead.email || '').trim().toLowerCase();
        let reason = 'pending';
        if (String(opp.deadlineAlertedDateKey || '') === tomorrowKey) {
          reason = 'sent';
        } else if (!leadEmail) {
          reason = 'missing_lead_email';
        } else if (clientSet.size && !clientSet.has(clientName)) {
          reason = 'client_filtered';
        }
        return {
          refNo: opp.opportunityRefNo || '',
          tenderName: opp.tenderName || '',
          clientName: opp.clientName || '',
          leadName: opp.internalLead || '',
          leadEmail: resolvedLead.email || '',
          submissionDate: submissionDate || '',
          sent: String(opp.deadlineAlertedDateKey || '') === tomorrowKey,
          reason,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      tomorrow: tomorrowKey,
      enabled: Boolean(config.deadlineAlertEnabled),
      count: rows.length,
      rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load deadline status' });
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

app.get('/api/opportunities/post-bid-config', verifyToken, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) config = await SystemConfig.create({});
    const allowedEmails = normalizeEmailList(config.postBidAllowedEmails || []);
    res.json({
      allowedEmails,
      canEdit: canEditPostBidDetails(config, req.user),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/post-bid-config', verifyToken, async (req, res) => {
  try {
    if (String(req.user?.role || '').toUpperCase() !== 'MASTER') {
      return res.status(403).json({ error: 'Only Master users can manage post-bid assignees' });
    }

    let config = await SystemConfig.findOne();
    if (!config) config = await SystemConfig.create({});

    config.postBidAllowedEmails = normalizeEmailList(req.body?.emails || []);
    config.updatedBy = req.user?.email || req.user?.displayName || 'unknown';
    config.lastUpdatedBy = req.user?.email || req.user?.displayName || 'unknown';
    await config.save();

    res.json({ success: true, allowedEmails: config.postBidAllowedEmails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/:id/post-bid-details', verifyToken, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) config = await SystemConfig.create({});

    if (!canEditPostBidDetails(config, req.user)) {
      return res.status(403).json({ error: 'You are not allowed to update post-bid details' });
    }

    const detailType = normalizePostBidDetailType(req.body?.detailType);
    const otherText = String(req.body?.otherText || '').trim();

    if (detailType === 'OTHER' && !otherText) {
      return res.status(400).json({ error: 'Other detail text is required' });
    }

    const opportunity = await SyncedOpportunity.findById(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const approval = await Approval.findOne({ opportunityRefNo: opportunity.opportunityRefNo }).lean();
    if (String(approval?.status || 'pending') !== 'fully_approved') {
      return res.status(400).json({ error: 'Post-bid details can only be updated after full approval' });
    }

    opportunity.postBidDetailType = detailType;
    opportunity.postBidDetailOther = detailType === 'OTHER' ? otherText : '';
    opportunity.postBidDetailUpdatedBy = req.user?.email || req.user?.displayName || 'unknown';
    opportunity.postBidDetailUpdatedAt = detailType ? new Date() : null;
    await opportunity.save();

    const saved = mapIdField(applyOpportunityDateFields(applyOpportunityStatusFields(opportunity.toObject())));
    res.json({ success: true, opportunity: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/sync-graph', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;

    const syncResult = await syncFromConfiguredGraph({ source: 'manual_sync' });
    res.json({
      success: true,
      count: syncResult.insertedCount,
      syncedCount: syncResult.insertedCount,
      newRowsCount: syncResult.newRowsCount,
      newRowSignatures: syncResult.newRowSignatures,
      syncTiming: syncResult.syncTiming || null,
    });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_SYNC_FAILED'));
  }
});

app.post('/api/opportunities/reset-synced', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sync')) return;

    const deleteResult = await SyncedOpportunity.deleteMany({});
    invalidateOpportunitiesCache('reset_synced');
    await warmOpportunitiesCache('reset_synced');
    res.json({
      success: true,
      deletedCount: Number(deleteResult?.deletedCount || 0),
      message: `Cleared ${Number(deleteResult?.deletedCount || 0)} synced opportunities. Run sync again to rebuild from Graph Excel.`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to clear synced opportunities' });
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

app.get('/api/opportunities', verifyToken, async (req, res) => {
  const endpointStartedAt = Date.now();
  try {
    if (DISABLE_MONGODB) {
      return res.json([]);
    }

    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    const now = Date.now();
    const cacheAgeMs = now - opportunitiesListCache.generatedAt;
    if (opportunitiesListCache.payload && cacheAgeMs <= OPPORTUNITIES_CACHE_TTL_MS) {
      const totalMs = Date.now() - endpointStartedAt;
      const authMs = Number(req.authVerifyMs || 0);
      const meta = opportunitiesListCache.meta || {};
      res.setHeader('X-Opps-Cache', 'HIT');
      res.setHeader('X-Opps-Cache-Age-Ms', String(cacheAgeMs));
      res.setHeader('X-Opps-Total-Ms', String(totalMs));
      res.setHeader('X-Opps-Auth-Ms', String(authMs));
      res.setHeader('X-Opps-Fetch-Ms', String(meta.fetchMs || 0));
      res.setHeader('X-Opps-Merge-Ms', String(meta.mergeMs || 0));
      res.setHeader('X-Opps-Map-Ms', String(meta.mapMs || 0));
      res.setHeader('X-Opps-Fetch-Opps-Ms', String(meta.fetchBreakdownMs?.opportunities || 0));
      res.setHeader('X-Opps-Fetch-Manual-Ms', String(meta.fetchBreakdownMs?.manual || 0));
      res.setHeader('X-Opps-Fetch-Conflicts-Ms', String(meta.fetchBreakdownMs?.conflicts || 0));
      return res.json(opportunitiesListCache.payload);
    }
    const buildStartedAt = Date.now();
    const { mapped, timing } = await buildOpportunitiesListPayload();
    const buildCompletedAt = Date.now();
    opportunitiesListCache.payload = mapped;
    opportunitiesListCache.generatedAt = Date.now();
    opportunitiesListCache.meta = {
      totalMs: buildCompletedAt - buildStartedAt,
      fetchMs: timing.fetchMs,
      mergeMs: timing.mergeMs,
      mapMs: timing.mapMs,
      fetchBreakdownMs: timing.fetchBreakdownMs,
      rows: mapped.length,
      reason: 'request',
      timestamp: new Date().toISOString(),
    };
    const totalMs = Date.now() - endpointStartedAt;
    const fetchMs = timing.fetchMs;
    const mergeMs = timing.mergeMs;
    const mapMs = timing.mapMs;
    const authMs = Number(req.authVerifyMs || 0);
    res.setHeader('X-Opps-Total-Ms', String(totalMs));
    res.setHeader('X-Opps-Auth-Ms', String(authMs));
    res.setHeader('X-Opps-Cache', 'MISS');
    res.setHeader('X-Opps-Cache-Age-Ms', '0');
    res.setHeader('X-Opps-Fetch-Ms', String(fetchMs));
    res.setHeader('X-Opps-Merge-Ms', String(mergeMs));
    res.setHeader('X-Opps-Map-Ms', String(mapMs));
    res.setHeader('X-Opps-Fetch-Opps-Ms', String(timing.fetchBreakdownMs.opportunities));
    res.setHeader('X-Opps-Fetch-Manual-Ms', String(timing.fetchBreakdownMs.manual));
    res.setHeader('X-Opps-Fetch-Conflicts-Ms', String(timing.fetchBreakdownMs.conflicts));
    console.log('[api.opportunities.timing]', JSON.stringify({
      totalMs,
      authMs,
      fetchMs,
      mergeMs,
      mapMs,
      fetchBreakdownMs: timing.fetchBreakdownMs,
      rows: mapped.length,
      timestamp: new Date().toISOString(),
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/value-conflicts', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;
    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    const [conflicts, opportunities] = await Promise.all([
      OpportunityFieldConflict.find({ status: 'pending' }).sort({ detectedAt: -1 }).lean(),
      SyncedOpportunity.find({}, { opportunityRefNo: 1, tenderName: 1 }).lean(),
    ]);

    const oppByRefKey = new Map(
      opportunities
        .map((row) => [normalizeRefKey(row?.opportunityRefNo || ''), row])
        .filter(([ref]) => Boolean(ref))
    );

    const grouped = new Map();
    conflicts.forEach((row) => {
      const refKey = normalizeRefKey(row?.refKey || row?.opportunityRefNo || '');
      if (!refKey) return;
      if (!grouped.has(refKey)) {
        const opp = oppByRefKey.get(refKey);
        grouped.set(refKey, {
          refKey,
          opportunityRefNo: row.opportunityRefNo || opp?.opportunityRefNo || '',
          tenderName: opp?.tenderName || '',
          fields: [],
        });
      }
      grouped.get(refKey).fields.push({
        id: row._id?.toString?.() || '',
        fieldKey: row.fieldKey,
        fieldLabel: row.fieldLabel || FIELD_LABELS[row.fieldKey] || row.fieldKey,
        sheetValue: row.sheetValue ?? null,
        existingValue: row.existingValue ?? null,
        detectedAt: row.detectedAt || row.createdAt || null,
      });
    });

    res.json({ success: true, conflicts: Array.from(grouped.values()) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load value conflicts' });
  }
});

app.post('/api/opportunities/manual-entry/preview', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;
    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    const mode = String(req.body?.mode || 'update').trim().toLowerCase();
    if (!['new', 'update'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
    const payload = buildManualEntryPayload(req.body || {});
    const refKey = payload.refKey;
    if (!refKey) return res.status(400).json({ error: 'Missing opportunityRefNo' });
    if (Number.isNaN(payload.opportunityValue)) return res.status(400).json({ error: 'Value must be numeric' });

    const missing = FORM_REQUIRED_FIELDS.filter((fieldKey) => !hasFieldValue(fieldKey, payload[fieldKey]));
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => FIELD_LABELS[field] || field).join(', ')}` });
    }

    const [existingOpp, previousManual] = await Promise.all([
      SyncedOpportunity.findOne({ opportunityRefNo: payload.opportunityRefNo }).lean(),
      OpportunityManualUpdate.findOne({ refKey }).lean(),
    ]);

    if (mode === 'new' && existingOpp) return res.status(409).json({ error: 'A row with this Avenir Ref already exists. Use Update.' });
    if (mode === 'update' && !existingOpp) return res.status(404).json({ error: 'No existing row found. Use New.' });

    const baseline = existingOpp || previousManual || {};
    const fieldDiffs = FORM_EDITABLE_FIELDS
      .filter((fieldKey) => fieldKey !== 'opportunityRefNo')
      .map((fieldKey) => ({
        fieldKey,
        fieldLabel: FIELD_LABELS[fieldKey] || fieldKey,
        previousValue: baseline[fieldKey] ?? null,
        nextValue: payload[fieldKey] ?? null,
        changed: !fieldValuesMatch(fieldKey, baseline[fieldKey], payload[fieldKey]),
        hasExistingValue: hasFieldValue(fieldKey, baseline[fieldKey]),
      }))
      .filter((row) => row.changed);

    const overwrites = fieldDiffs.filter((row) => row.hasExistingValue);
    res.json({
      success: true,
      mode,
      requiresConfirmation: overwrites.length > 0,
      overwrites,
      allChanges: fieldDiffs,
      existingFound: Boolean(existingOpp),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to preview entry update' });
  }
});

app.post('/api/opportunities/manual-entry/save', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);

    const mode = String(req.body?.mode || 'update').trim().toLowerCase();
    const confirmed = Boolean(req.body?.confirmed);
    if (!['new', 'update'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
    const payload = buildManualEntryPayload(req.body || {});
    const refKey = payload.refKey;
    if (!refKey) return res.status(400).json({ error: 'Missing opportunityRefNo' });
    if (Number.isNaN(payload.opportunityValue)) return res.status(400).json({ error: 'Value must be numeric' });

    const missing = FORM_REQUIRED_FIELDS.filter((fieldKey) => !hasFieldValue(fieldKey, payload[fieldKey]));
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => FIELD_LABELS[field] || field).join(', ')}` });
    }

    const [existingOpp, previousManual] = await Promise.all([
      SyncedOpportunity.findOne({ opportunityRefNo: payload.opportunityRefNo }).lean(),
      OpportunityManualUpdate.findOne({ refKey }).lean(),
    ]);
    if (mode === 'new' && existingOpp) return res.status(409).json({ error: 'A row with this Avenir Ref already exists. Use Update.' });
    if (mode === 'update' && !existingOpp) return res.status(404).json({ error: 'No existing row found. Use New.' });

    const baseline = existingOpp || previousManual || {};
    const diffs = FORM_EDITABLE_FIELDS
      .filter((fieldKey) => fieldKey !== 'opportunityRefNo')
      .map((fieldKey) => ({
        fieldKey,
        previousValue: baseline[fieldKey] ?? null,
        nextValue: payload[fieldKey] ?? null,
        changed: !fieldValuesMatch(fieldKey, baseline[fieldKey], payload[fieldKey]),
        hasExistingValue: hasFieldValue(fieldKey, baseline[fieldKey]),
      }))
      .filter((row) => row.changed);
    const overwriteCount = diffs.filter((row) => row.hasExistingValue).length;
    if (overwriteCount > 0 && !confirmed) {
      return res.status(409).json({ error: 'Confirmation required for overwrite', confirmationRequired: true });
    }

    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    const actor = buildAuditActor(req);
    await OpportunityProbation.create({
      opportunityRefNo: payload.opportunityRefNo,
      refKey,
      action: mode,
      source: 'manual_form',
      ...actor,
      changedAt: new Date(),
      expiresAt,
      previousSyncedOpportunity: existingOpp || null,
      previousManualSnapshot: previousManual || null,
    });

    const syncedPatch = {};
    FORM_EDITABLE_FIELDS.forEach((fieldKey) => {
      if (fieldKey === 'opportunityRefNo') return;
      syncedPatch[fieldKey] = payload[fieldKey];
    });

    if (mode === 'new') {
      await SyncedOpportunity.create({
        opportunityRefNo: payload.opportunityRefNo,
        ...syncedPatch,
        rawGraphData: { rowSnapshot: {} },
      });
    } else {
      await SyncedOpportunity.updateOne({ opportunityRefNo: payload.opportunityRefNo }, { $set: syncedPatch });
    }

    const manualSet = {
      opportunityRefNo: payload.opportunityRefNo,
      refKey,
      updatedBy: req.user?.email || 'unknown',
    };
    MANUAL_UPDATE_FIELD_KEYS.forEach((fieldKey) => {
      manualSet[fieldKey] = payload[fieldKey];
    });
    await OpportunityManualUpdate.updateOne({ refKey }, { $set: manualSet }, { upsert: true });

    await OpportunityChangeLog.create({
      opportunityRefNo: payload.opportunityRefNo,
      refKey,
      action: mode === 'new' ? 'manual_new_row' : 'manual_update_row',
      source: 'manual_form',
      ...actor,
      changedAt: new Date(),
      fieldDiffs: diffs.map((row) => ({
        fieldKey: row.fieldKey,
        previousValue: row.previousValue,
        nextValue: row.nextValue,
        note: row.hasExistingValue ? 'overwrite' : 'new_value',
      })),
    });

    res.json({ success: true, mode, changedFields: diffs.length, overwriteCount });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save manual entry' });
  }
});

app.post('/api/opportunities/value-conflicts/resolve', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);

    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    if (!decisions.length) return res.status(400).json({ error: 'No conflict decisions provided' });

    const actor = buildAuditActor(req);
    let resolved = 0;
    for (const decision of decisions) {
      const conflictId = String(decision?.conflictId || '').trim();
      const action = String(decision?.action || '').trim();
      if (!conflictId || !['use_sheet', 'keep_existing'].includes(action)) continue;

      const conflict = await OpportunityFieldConflict.findById(conflictId);
      if (!conflict || conflict.status !== 'pending') continue;

      const refKey = normalizeRefKey(conflict.refKey || conflict.opportunityRefNo || '');
      if (!refKey) continue;
      const manualDoc = await OpportunityManualUpdate.findOne({ refKey });
      if (!manualDoc) continue;

      const previousManual = manualDoc.toObject();
      if (action === 'use_sheet') {
        if (conflict.fieldKey === 'opportunityValue') manualDoc[conflict.fieldKey] = null;
        else manualDoc[conflict.fieldKey] = '';
      }
      manualDoc.updatedBy = req.user?.email || 'unknown';
      await manualDoc.save();

      conflict.status = 'resolved';
      conflict.resolvedAt = new Date();
      conflict.resolvedBy = req.user?.email || 'unknown';
      conflict.resolutionAction = action;
      await conflict.save();

      await OpportunityProbation.create({
        opportunityRefNo: conflict.opportunityRefNo,
        refKey,
        action: 'resolve_conflict',
        source: 'sync_conflict',
        ...actor,
        changedAt: new Date(),
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
        previousSyncedOpportunity: null,
        previousManualSnapshot: previousManual,
      });

      await OpportunityChangeLog.create({
        opportunityRefNo: conflict.opportunityRefNo,
        refKey,
        action: 'resolve_sync_conflict',
        source: 'sync_conflict',
        ...actor,
        changedAt: new Date(),
        fieldDiffs: [{
          fieldKey: conflict.fieldKey,
          previousValue: previousManual?.[conflict.fieldKey] ?? null,
          nextValue: action === 'use_sheet' ? conflict.sheetValue : previousManual?.[conflict.fieldKey] ?? null,
          note: action,
        }],
      });

      resolved += 1;
    }

    res.json({ success: true, resolved });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to resolve conflicts' });
  }
});

app.get('/api/vendors', verifyToken, async (_req, res) => {
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

app.get('/api/universal-search', verifyToken, async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || '').trim();
    const query = rawQuery.replace(/\s+/g, ' ').trim();
    if (!query) return res.json({ success: true, query: '', results: [] });

    const limit = Math.min(Math.max(Number(req.query?.limit || 20) || 20, 1), 50);
    const regexSafe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(regexSafe, 'i');

    const [opportunities, vendors, clients] = await Promise.all([
      SyncedOpportunity.find(
        {
          $or: [
            { opportunityRefNo: rx },
            { tenderName: rx },
            { clientName: rx },
            { groupClassification: rx },
            { opportunityClassification: rx },
            { internalLead: rx },
            { avenirStatus: rx },
            { tenderResult: rx },
          ],
        },
        { opportunityRefNo: 1, tenderName: 1, clientName: 1, avenirStatus: 1 }
      ).limit(limit).lean(),
      Vendor.find(
        {
          $or: [
            { companyName: rx },
            { focusArea: rx },
            { contactPerson: rx },
            { emails: rx },
            { primaryIndustries: rx },
            { confirmedServices: rx },
            { partners: rx },
            { confirmedTechStack: rx },
            { nonSpecializedTechStack: rx },
            { certifications: rx },
            { sampleProjects: rx },
            { sources: rx },
            { companySize: rx },
          ],
        },
        { companyName: 1, agreementStatus: 1, focusArea: 1, companySize: 1 }
      ).limit(limit).lean(),
      Client.find(
        {
          $or: [
            { companyName: rx },
            { domain: rx },
            { group: rx },
            { 'location.city': rx },
            { 'location.country': rx },
            { 'contacts.firstName': rx },
            { 'contacts.lastName': rx },
            { 'contacts.email': rx },
            { 'contacts.phone': rx },
          ],
        },
        { companyName: 1, domain: 1, group: 1, location: 1 }
      ).limit(limit).lean(),
    ]);

    const results = [
      ...opportunities.map((row) => ({
        type: 'opportunity',
        id: row._id?.toString?.() || row.opportunityRefNo,
        key: row.opportunityRefNo,
        title: row.opportunityRefNo || 'Opportunity',
        subtitle: [row.tenderName, row.clientName, row.avenirStatus].filter(Boolean).join(' • '),
        route: '/opportunities',
        params: { editOpportunityValueRef: row.opportunityRefNo },
      })),
      ...vendors.map((row) => ({
        type: 'vendor',
        id: row._id?.toString?.() || row.companyName,
        key: row._id?.toString?.() || row.companyName,
        title: row.companyName || 'Vendor',
        subtitle: [row.focusArea, row.companySize, row.agreementStatus].filter(Boolean).join(' • '),
        route: '/vendors',
        params: { editVendorId: row._id?.toString?.() || '' },
      })),
      ...clients.map((row) => ({
        type: 'client',
        id: row._id?.toString?.() || row.companyName,
        key: row._id?.toString?.() || row.companyName,
        title: row.companyName || 'Client',
        subtitle: [row.domain || row.group, row.location?.city, row.location?.country].filter(Boolean).join(' • '),
        route: '/clients',
        params: { editClientId: row._id?.toString?.() || '' },
      })),
    ]
      .filter((row) => row?.key)
      .slice(0, limit * 3);

    res.json({ success: true, query, results });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to search' });
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

app.get('/api/clients', verifyToken, async (_req, res) => {
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

const canAccessBDEngagements = (user) => ['Master', 'Admin', 'BDTeam'].includes(String(user?.role || '').trim());

app.get('/api/bd-engagements', verifyToken, async (req, res) => {
  try {
    if (!canAccessBDEngagements(req.user)) return res.status(403).json({ error: 'Access denied' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const rows = await BDEngagement.find().sort({ date: -1, updatedAt: -1 }).lean();
    res.json(rows.map((row) => mapIdField(row)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load BD engagements' });
  }
});

app.post('/api/bd-engagements', verifyToken, async (req, res) => {
  try {
    if (!canAccessBDEngagements(req.user)) return res.status(403).json({ error: 'Access denied' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const created = await BDEngagement.create(req.body || {});
    res.json({ success: true, row: mapIdField(created.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create BD engagement' });
  }
});

app.put('/api/bd-engagements/:id', verifyToken, async (req, res) => {
  try {
    if (!canAccessBDEngagements(req.user)) return res.status(403).json({ error: 'Access denied' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const existing = await BDEngagement.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'BD engagement not found' });
    Object.assign(existing, req.body || {});
    await existing.save();
    res.json({ success: true, row: mapIdField(existing.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update BD engagement' });
  }
});

app.delete('/api/bd-engagements/:id', verifyToken, async (req, res) => {
  try {
    if (!canAccessBDEngagements(req.user)) return res.status(403).json({ error: 'Access denied' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const result = await BDEngagement.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ error: 'BD engagement not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete BD engagement' });
  }
});

app.post('/api/bd-engagements/clear', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(String(req.user?.role || '').trim())) {
      return res.status(403).json({ error: 'Only Master/Admin can clear BD engagements' });
    }
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const result = await BDEngagement.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to clear BD engagements' });
  }
});

app.get('/api/opportunities/stats', verifyToken, async (req, res) => {
  try {
    const opportunities = (await SyncedOpportunity.find().lean()).map((opp) => applyOpportunityDateFields(applyOpportunityStatusFields(opp)));
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
    const reportMeta = body.reportMeta || {};
    const reportDurationKey = String(reportMeta.key || '');

    const summary = calculateSummaryStats(data);
    const clients = getClientDataForReport(data);
    const portfolioSnapshot = getPortfolioSnapshotData(data, reportDurationKey === 'all' ? Number.POSITIVE_INFINITY : 12);

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

    const reportDurationLabel = String(reportMeta.label || 'Selected dashboard data');
    const reportRangeLabel = String(reportMeta.rangeLabel || 'Current filtered dataset');

    const children = [
      new Paragraph({
        text: 'SALES PIPELINE ANALYTICS REPORT',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        shading: { fill: REPORT_COLORS.navy, type: ShadingType.CLEAR },
        spacing: { after: 180, before: 120 },
      }),
      new Paragraph({
        text: 'Comprehensive Sales Intelligence & Market Insights',
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Report Window', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Date Span', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Generated', REPORT_COLORS.blueSoft),
            ],
          }),
          new TableRow({
            children: [
              createReportValueCell(reportDurationLabel, REPORT_COLORS.slateSoft),
              createReportValueCell(reportRangeLabel, REPORT_COLORS.slateSoft),
              createReportValueCell(generatedAt, REPORT_COLORS.slateSoft),
            ],
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 200 } }),
      createReportCallout(
        'Applied Filters',
        activeFilters.length ? activeFilters.join(' • ') : 'None (all data shown)',
        REPORT_COLORS.slateSoft,
      ),
      createReportSectionTitle('Executive Snapshot'),
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
      createReportCallout(
        'Executive Summary',
        `This ${reportDurationLabel.toLowerCase()} report captures ${totalOpportunities} filtered opportunities. ${summary.totalActive} are currently active, ${summary.wonCount} are won, ${summary.lostCount} are lost, and ${summary.atRiskCount} require immediate attention.`,
        REPORT_COLORS.blueSoft,
      ),
      createReportSectionTitle('Status Breakdown'),
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
      createReportSectionTitle(reportDurationKey === 'all' ? 'Complete Tender Register' : 'Portfolio Snapshot'),
      createReportCallout(
        'Snapshot Scope',
        reportDurationKey === 'all'
          ? 'The table below includes every tender in the selected all-time report window, ordered by RFP Received date.'
          : 'The table below reflects the selected report duration and lists the most recent qualifying opportunities by RFP Received date.',
        REPORT_COLORS.slateSoft,
      ),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Avenir Ref', REPORT_COLORS.blueSoft),
              createReportHeaderCell('ADNOC Ref', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Tender Name', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Client', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Lead', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Received', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Value', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Status', REPORT_COLORS.blueSoft),
            ],
          }),
          ...portfolioSnapshot.map((row) => new TableRow({
            children: [
              createReportValueCell(row.refNo, REPORT_COLORS.slateSoft),
              createReportValueCell(row.adnocRftNo || '—', REPORT_COLORS.slateSoft),
              createReportValueCell(row.tenderName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.clientName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.lead || '—', REPORT_COLORS.slateSoft),
              createReportValueCell(row.receivedDate ? formatDateForReport(row.receivedDate) : '—', REPORT_COLORS.slateSoft),
              createReportValueCell(formatCurrencyCompact(row.value), REPORT_COLORS.slateSoft),
              createReportValueCell(row.status, REPORT_COLORS.slateSoft),
            ],
          })),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      createReportSectionTitle('Client Concentration'),
      createReportCallout(
        'Client Strategy',
        `Top client in the selected window: ${clients[0]?.name || 'N/A'}. Use this section to review concentration risk and prioritize account coverage for high-value clients.`,
        REPORT_COLORS.blueSoft,
      ),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Client Name', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Opportunities', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Submitted Value', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Ranking', REPORT_COLORS.blueSoft),
            ],
          }),
          ...clients.map((row, i) => new TableRow({
            children: [
              createReportValueCell(row.name, REPORT_COLORS.slateSoft),
              createReportValueCell(row.count, REPORT_COLORS.slateSoft),
              createReportValueCell(`$${(row.value / 1000000).toFixed(2)}M`, REPORT_COLORS.slateSoft),
              createReportValueCell(`#${i + 1}`, REPORT_COLORS.slateSoft),
            ],
          })),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 260 } }),
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

app.get('/api/project-updates', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master' && req.user.role !== 'MASTER') {
      return res.status(403).json({ error: 'Only Master users can access project updates' });
    }

    const limit = Math.min(Math.max(Number(req.query?.limit || 1000), 1), 1000);
    const updates = await ProjectUpdate.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(updates.map(mapIdField));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load project updates' });
  }
});

app.post('/api/project-updates', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master' && req.user.role !== 'MASTER') {
      return res.status(403).json({ error: 'Only Master users can create project updates' });
    }

    const tenderId = String(req.body?.tenderId || '').trim();
    const tenderRefNo = String(req.body?.tenderRefNo || '').trim();
    const updateType = String(req.body?.updateType || '').trim();

    if (!tenderId) return res.status(400).json({ error: 'tenderId is required' });
    if (!tenderRefNo) return res.status(400).json({ error: 'tenderRefNo is required' });
    if (!updateType) return res.status(400).json({ error: 'updateType is required' });

    const payload = {
      tenderId,
      tenderRefNo,
      updateType,
      vendorName: String(req.body?.vendorName || '').trim(),
      parentUpdateId: String(req.body?.parentUpdateId || '').trim(),
      responseDetails: String(req.body?.responseDetails || '').trim(),
      contactDate: String(req.body?.contactDate || '').trim(),
      responseDate: String(req.body?.responseDate || '').trim(),
      extensionDate: String(req.body?.extensionDate || '').trim(),
      finalizedDate: String(req.body?.finalizedDate || '').trim(),
      finalDecision: String(req.body?.finalDecision || '').trim(),
      finalInstructions: String(req.body?.finalInstructions || '').trim(),
      finalPrice: req.body?.finalPrice === undefined || req.body?.finalPrice === null || req.body?.finalPrice === ''
        ? null
        : Number(req.body.finalPrice),
      notes: String(req.body?.notes || '').trim(),
      updatedBy: req.user.email,
    };

    const created = await ProjectUpdate.create(payload);
    res.status(201).json(mapIdField(created.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create project update' });
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
