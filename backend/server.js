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
import { syncTendersFromGraph, transformTendersToOpportunities } from './services/dataSyncService.js';
import GraphSyncConfig from './models/GraphSyncConfig.js';
import { resolveShareLink, getWorksheets, getWorksheetRangeValues, bootstrapDelegatedToken, protectRefreshToken, buildDelegatedConsentUrl, getAccessTokenWithConfig } from './services/graphExcelService.js';
import { initializeBootSync } from './services/bootSyncService.js';
import SystemConfig from './models/SystemConfig.js';
import { encryptSecret } from './services/cryptoService.js';

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

const normalizeColumnKey = (value = '') => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

const hasRequiredRowValues = (opportunity) => {
  const snapshot = opportunity?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return false;

  const normalizedEntries = Object.entries(snapshot).reduce((acc, [key, value]) => {
    acc[normalizeColumnKey(key)] = String(value || '').trim();
    return acc;
  }, {});

  return REQUIRED_NEW_ROW_COLUMNS.every((col) => Boolean(normalizedEntries[col]));
};

const buildRowSignature = (opportunity) => {
  const parts = [
    opportunity?.opportunityRefNo || '',
    opportunity?.tenderName || '',
    opportunity?.clientName || '',
    opportunity?.groupClassification || '',
    opportunity?.opportunityClassification || '',
    opportunity?.dateTenderReceived || '',
  ];

  return parts.map((part) => String(part).trim().toUpperCase()).join('||');
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

const sendTelecastForNewRows = async ({ systemConfig, newRows = [] }) => {
  if (!newRows.length) return { sent: 0, skipped: 'no_new_rows' };
  if (!systemConfig?.telecastGraphRefreshTokenEnc) return { sent: 0, skipped: 'telecast_not_connected' };

  const groupRecipients = {
    GES: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GES || []),
    GDS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GDS || []),
    GTS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GTS || []),
  };

  const { accessToken } = await getAccessTokenWithConfig({ graphRefreshTokenEnc: systemConfig.telecastGraphRefreshTokenEnc });
  const subjectTemplate = systemConfig.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = systemConfig.telecastTemplateBody || 'New row detected for {{TENDER_NO}}';
  let sent = 0;

  for (const row of newRows) {
    const group = getGroupFromOpportunity(row);
    const recipients = groupRecipients[group] || [];
    if (!recipients.length) continue;

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

    if (graphResponse.ok) sent += 1;
  }

  return { sent, skipped: null };
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
  const previousSignatures = new Set(systemConfig.notificationRowSignatures || []);
  const eligibleSignatures = opportunities
    .filter(hasRequiredRowValues)
    .map(buildRowSignature)
    .filter(Boolean);

  const uniqueCurrentSignatures = [...new Set(eligibleSignatures)];
  const newRowSignatures = uniqueCurrentSignatures.filter((signature) => !previousSignatures.has(signature));
  const signatureToOpportunity = new Map(
    opportunities
      .filter(hasRequiredRowValues)
      .map((item) => [buildRowSignature(item), item])
      .filter(([sig]) => Boolean(sig))
  );
  const newRows = newRowSignatures.map((sig) => signatureToOpportunity.get(sig)).filter(Boolean);

  const telecastCandidateSignatures = newRows.map((row) => buildRowSignature(row)).filter(Boolean);
  const telecastAlignment = {
    detectionCount: newRowSignatures.length,
    telecastCandidateCount: telecastCandidateSignatures.length,
    missingCandidates: newRowSignatures.filter((sig) => !telecastCandidateSignatures.includes(sig)),
    extraneousCandidates: telecastCandidateSignatures.filter((sig) => !newRowSignatures.includes(sig)),
  };
  const isAligned = telecastAlignment.missingCandidates.length === 0 && telecastAlignment.extraneousCandidates.length === 0;

  await SyncedOpportunity.deleteMany({});
  const inserted = await SyncedOpportunity.insertMany(opportunities);

  const now = new Date();
  config.lastSyncAt = now;
  await config.save();

  systemConfig.notificationRowSignatures = uniqueCurrentSignatures;
  systemConfig.notificationLastCheckedAt = now;
  systemConfig.notificationLastNewRowsCount = newRowSignatures.length;
  systemConfig.notificationLastNewRows = newRowSignatures.slice(0, 50);
  systemConfig.telecastKeywordHelp = TELECAST_TEMPLATE_KEYWORDS;
  pushWeeklyTelecastStats(systemConfig, newRows);
  systemConfig.updatedBy = source;

  let telecastDispatch = { sent: 0, skipped: 'not_attempted' };
  try {
    telecastDispatch = await sendTelecastForNewRows({ systemConfig, newRows });
  } catch (telecastError) {
    console.error('[telecast.dispatch.error]', telecastError?.message || telecastError);
    telecastDispatch = { sent: 0, skipped: 'error' };
  }

  await systemConfig.save();

  console.log('[sync.new-row-detection]', JSON.stringify({
    source,
    checkedAt: now.toISOString(),
    eligibleRows: uniqueCurrentSignatures.length,
    newRows: newRowSignatures.length,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    alignmentOk: isAligned,
    alignmentMissing: telecastAlignment.missingCandidates.length,
    alignmentExtraneous: telecastAlignment.extraneousCandidates.length,
  }));

  return {
    insertedCount: inserted.length,
    newRowsCount: newRowSignatures.length,
    newRowSignatures: newRowSignatures.slice(0, 50),
    eligibleRows: uniqueCurrentSignatures.length,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    rowDetectionAlignment: {
      ok: isAligned,
      detectionCount: telecastAlignment.detectionCount,
      telecastCandidateCount: telecastAlignment.telecastCandidateCount,
      missingCandidates: telecastAlignment.missingCandidates.slice(0, 20),
      extraneousCandidates: telecastAlignment.extraneousCandidates.slice(0, 20),
    },
    newRowsPreview: newRows.slice(0, 50).map((row) => ({
      signature: buildRowSignature(row),
      tenderNo: row?.opportunityRefNo || '',
      tenderName: row?.tenderName || '',
      client: row?.clientName || '',
      group: getGroupFromOpportunity(row),
      type: row?.opportunityClassification || '',
      dateTenderReceived: row?.dateTenderReceived || '',
      value: row?.opportunityValue ?? null,
    })),
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
    'tender-notify@avenirengineering.com',
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
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can view this' });
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

    if (role === 'SVP' && !assignedGroupRaw) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    if (assignedGroupRaw && !['GES', 'GDS', 'GTS'].includes(assignedGroupRaw)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
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

    if (newRole === 'SVP' && !assignedGroup) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    const normalizedGroup = assignedGroup ? String(assignedGroup).toUpperCase() : null;
    if (normalizedGroup && !['GES', 'GDS', 'GTS'].includes(normalizedGroup)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
    }

    const update = { role: newRole, assignedGroup: newRole === 'SVP' ? normalizedGroup : null };
    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      update,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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

    const result = await AuthorizedUser.deleteOne({ email: email.toLowerCase() });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

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

const PAGE_KEYS = ['dashboard', 'opportunities', 'clients', 'analytics', 'master'];
const ROLE_KEYS = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
const DEFAULT_PAGE_ROLE_ACCESS = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  master: ['Master', 'Admin'],
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
      savedTemplates: Array.isArray(config.telecastSavedTemplates) ? config.telecastSavedTemplates : [],
      activeTemplateId: config.telecastActiveTemplateId || '',
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


app.post('/api/telecast/templates/save', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can save telecast templates' });
    }

    const name = String(req.body?.name || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();

    if (!name) return res.status(400).json({ error: 'Template name is required' });

    const config = await getSystemConfig();
    const templates = Array.isArray(config.telecastSavedTemplates) ? [...config.telecastSavedTemplates] : [];

    const existingIndex = templates.findIndex((t) => String(t?.name || '').toLowerCase() === name.toLowerCase());
    const now = new Date();
    if (existingIndex >= 0) {
      templates[existingIndex] = {
        ...templates[existingIndex],
        name,
        subject: subject || config.telecastTemplateSubject || '',
        body: body || config.telecastTemplateBody || '',
        updatedAt: now,
      };
      config.telecastActiveTemplateId = templates[existingIndex].id;
    } else {
      const next = {
        id: randomUUID(),
        name,
        subject: subject || config.telecastTemplateSubject || '',
        body: body || config.telecastTemplateBody || '',
        createdAt: now,
        updatedAt: now,
      };
      templates.push(next);
      config.telecastActiveTemplateId = next.id;
    }

    config.telecastSavedTemplates = templates.slice(-50);
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, savedTemplates: config.telecastSavedTemplates, activeTemplateId: config.telecastActiveTemplateId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/telecast/templates/apply', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can apply telecast templates' });
    }

    const templateId = String(req.body?.templateId || '').trim();
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const config = await getSystemConfig();
    const templates = Array.isArray(config.telecastSavedTemplates) ? config.telecastSavedTemplates : [];
    const template = templates.find((t) => String(t?.id || '') === templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    config.telecastTemplateSubject = String(template.subject || '');
    config.telecastTemplateBody = String(template.body || '');
    config.telecastActiveTemplateId = templateId;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, templateSubject: config.telecastTemplateSubject, templateBody: config.telecastTemplateBody, activeTemplateId: config.telecastActiveTemplateId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/telecast/templates/:templateId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can delete telecast templates' });
    }

    const templateId = String(req.params?.templateId || '').trim();
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const config = await getSystemConfig();
    const templates = Array.isArray(config.telecastSavedTemplates) ? config.telecastSavedTemplates : [];
    config.telecastSavedTemplates = templates.filter((t) => String(t?.id || '') !== templateId);
    if (String(config.telecastActiveTemplateId || '') === templateId) {
      config.telecastActiveTemplateId = '';
    }
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, savedTemplates: config.telecastSavedTemplates, activeTemplateId: config.telecastActiveTemplateId || '' });
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
    res.json({
      success: true,
      lastCheckedAt: config.notificationLastCheckedAt || null,
      lastNewRowsCount: Number(config.notificationLastNewRowsCount || 0),
      lastNewRows: Array.isArray(config.notificationLastNewRows) ? config.notificationLastNewRows : [],
      trackedRows: Array.isArray(config.notificationRowSignatures) ? config.notificationRowSignatures.length : 0,
      weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
      savedTemplates: Array.isArray(config.telecastSavedTemplates) ? config.telecastSavedTemplates : [],
      activeTemplateId: config.telecastActiveTemplateId || '',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('✅ Server running on http://localhost:' + PORT);
});
