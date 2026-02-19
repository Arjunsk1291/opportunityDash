import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import approvalDb from './approvalDb.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import LoginLog from './models/LoginLog.js';
import { syncTendersFromGraph, transformTendersToOpportunities } from './services/dataSyncService.js';
import GraphSyncConfig from './models/GraphSyncConfig.js';
import { resolveShareLink, getWorksheets, getWorksheetRangeValues, bootstrapDelegatedToken, protectRefreshToken, buildDelegatedConsentUrl, startDeviceCodeFlow, exchangeDeviceCodeForToken, mailboxDelegatedScopesString } from './services/graphExcelService.js';
import { initializeBootSync } from './services/bootSyncService.js';
import SystemConfig from './models/SystemConfig.js';
import NotificationRule from './models/NotificationRule.js';
import { encryptSecret } from './services/cryptoService.js';
import { notifySvpsForNewTenders } from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .then(() => { initializeBootSync(); })
  .catch(err => console.error('❌ MongoDB connection error:', err));

const mapIdField = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc._id?.toString() || doc._id || null,
  };
};

const getGraphConfig = async () => {
  let config = await GraphSyncConfig.findOne();
  if (!config) {
    config = await GraphSyncConfig.create({});
  }
  return config;
};

const syncFromConfiguredGraph = async () => {
  const config = await getGraphConfig();
  if (!config.driveId || !config.fileId || !config.worksheetName) {
    throw new Error('Graph config is incomplete. Please configure Share Link / Drive / File / Worksheet in admin panel.');
  }

  const tenders = await syncTendersFromGraph(config);
  const opportunities = await transformTendersToOpportunities(tenders);

  await SyncedOpportunity.deleteMany({});
  const inserted = await SyncedOpportunity.insertMany(opportunities);

  try {
    await notifySvpsForNewTenders(tenders);
  } catch (error) {
    console.error('Notification dispatch failed (sync continues):', error.message);
  }

  config.lastSyncAt = new Date();
  await config.save();

  return inserted.length;
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
  try {
    const rawUsername = req.body?.username || req.body?.token;
    const username = rawUsername?.toString().trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    let user = await AuthorizedUser.findOne({ email: username });

    if (!user) {
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
    console.error('Auth verification error:', error.message);
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    if (dataRange !== undefined) config.dataRange = String(dataRange || 'B4:Z2000');
    if (headerRowOffset !== undefined) config.headerRowOffset = Math.max(0, Number(headerRowOffset) || 0);
    if (syncIntervalMinutes !== undefined) config.syncIntervalMinutes = Number(syncIntervalMinutes) || 10;
    if (fieldMapping !== undefined && typeof fieldMapping === 'object') config.fieldMapping = fieldMapping;

    config.updatedBy = req.user.email;
    await config.save();

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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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


const getSystemConfig = async () => {
  let config = await SystemConfig.findOne();
  if (!config) config = await SystemConfig.create({});
  return config;
};


app.post('/api/admin/mailbox/initiate', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can initiate mailbox auth' });

    const flowData = await startDeviceCodeFlow({ scopes: mailboxDelegatedScopesString() });
    res.json({ success: true, ...flowData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/mailbox/finalize', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can finalize mailbox auth' });

    const { deviceCode, email } = req.body || {};
    if (!deviceCode) return res.status(400).json({ error: 'deviceCode is required' });

    const tokens = await exchangeDeviceCodeForToken(deviceCode, { scopes: mailboxDelegatedScopesString() });
    if (!tokens.refreshToken) {
      return res.status(500).json({ error: 'No refresh token returned. Please re-run device code flow.' });
    }

    const config = await getSystemConfig();
    if (email !== undefined) config.serviceEmail = String(email || '').trim().toLowerCase();
    config.graphRefreshTokenEnc = protectRefreshToken(tokens.refreshToken);
    config.graphTokenUpdatedAt = new Date();
    config.lastUpdatedBy = req.user.email;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Service mailbox authenticated successfully.' });
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('authorization_pending')) {
      return res.status(400).json({ error: 'AUTHORIZATION_PENDING', message: 'Authorization is still pending. Complete verification and retry.' });
    }
    if (msg.includes('expired_token') || msg.includes('code_expired')) {
      return res.status(400).json({ error: 'DEVICE_CODE_EXPIRED', message: 'Device code expired. Start a new authorization flow.' });
    }
    if (msg.includes('AADSTS65001')) {
      return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'Consent required for this account. Complete consent on verification site and retry.' });
    }
    res.status(500).json({ error: msg });
  }
});

app.get('/api/admin/mailbox/status', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can view mailbox auth status' });

    const config = await getSystemConfig();
    res.json({
      success: true,
      serviceEmail: config.serviceEmail || '',
      hasGraphRefreshToken: !!config.graphRefreshTokenEnc,
      graphTokenUpdatedAt: config.graphTokenUpdatedAt || null,
      lastUpdatedBy: config.lastUpdatedBy || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/system-config/mail', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can view mail config' });
    const config = await getSystemConfig();
    const payload = mapIdField(config.toObject());
    payload.encryptedPassword = payload.encryptedPassword ? '********' : '';
    payload.hasGraphRefreshToken = !!payload.graphRefreshTokenEnc;
    payload.graphRefreshTokenEnc = payload.graphRefreshTokenEnc ? '********' : '';
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/system-config/mail', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can update mail config' });
    const { serviceEmail, smtpHost, smtpPort, smtpPassword } = req.body || {};
    const config = await getSystemConfig();

    if (serviceEmail !== undefined) config.serviceEmail = String(serviceEmail || '').trim().toLowerCase();
    if (smtpHost !== undefined) config.smtpHost = String(smtpHost || '').trim();
    if (smtpPort !== undefined) config.smtpPort = Number(smtpPort) || 587;
    if (smtpPassword) config.encryptedPassword = encryptSecret(smtpPassword);

    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, config: { serviceEmail: config.serviceEmail, smtpHost: config.smtpHost, smtpPort: config.smtpPort, hasPassword: !!config.encryptedPassword } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notification-rules', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can view notification rules' });
    const rules = await NotificationRule.find().sort({ createdAt: -1 }).lean();
    res.json(rules.map(mapIdField));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notification-rules', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can create notification rules' });
    const payload = req.body || {};
    const created = await NotificationRule.create({
      triggerEvent: payload.triggerEvent || 'NEW_TENDER_SYNCED',
      recipientRole: 'SVP',
      useGroupMatching: payload.useGroupMatching !== false,
      emailSubject: payload.emailSubject || 'New Tender Synced: {{tenderName}}',
      emailBody: payload.emailBody || '<p>New tender {{tenderName}}</p>',
      isActive: payload.isActive !== false,
      createdBy: req.user.email,
      updatedBy: req.user.email,
    });
    res.json({ success: true, rule: mapIdField(created.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notification-rules/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can update notification rules' });
    const { id } = req.params;
    const payload = req.body || {};
    const update = {
      triggerEvent: payload.triggerEvent,
      recipientRole: 'SVP',
      useGroupMatching: payload.useGroupMatching,
      emailSubject: payload.emailSubject,
      emailBody: payload.emailBody,
      isActive: payload.isActive,
      updatedBy: req.user.email,
    };
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    const rule = await NotificationRule.findByIdAndUpdate(id, update, { new: true });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true, rule: mapIdField(rule.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notification-rules/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') return res.status(403).json({ error: 'Only Master users can delete notification rules' });
    const result = await NotificationRule.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/sync-graph', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const count = await syncFromConfiguredGraph();
    res.json({ success: true, count, syncedCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

app.post('/api/opportunities/sync-graph/auto', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const count = await syncFromConfiguredGraph();
    res.json({ success: true, count, syncedCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Auto-sync failed: ' + error.message });
  }
});

// Backward-compatible aliases
app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }
    const count = await syncFromConfiguredGraph();
    res.json({ success: true, count, syncedCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

app.post('/api/opportunities/sync-sheets/auto', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }
    const count = await syncFromConfiguredGraph();
    res.json({ success: true, count, syncedCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Auto-sync failed: ' + error.message });
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
