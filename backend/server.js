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
import { syncTendersFromGoogleSheets, transformTendersToOpportunities } from './services/dataSyncService.js';
import { initializeBootSync } from './services/bootSyncService.js';

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
      user = new AuthorizedUser({
        email: username,
        displayName: username,
        role: 'Basic',
        status: 'pending',
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
        message: 'User pending approval. Please wait for Master to approve your access.',
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'User access rejected', status: 'rejected' });
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

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const update = { role: newRole, assignedGroup: newRole === 'SVP' ? (assignedGroup || null) : null };
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

app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const tenders = await syncTendersFromGoogleSheets();
    const opportunities = await transformTendersToOpportunities(tenders);

    await SyncedOpportunity.deleteMany({});
    const inserted = await SyncedOpportunity.insertMany(opportunities);

    res.json({ success: true, count: inserted.length, syncedCount: inserted.length });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

app.post('/api/opportunities/sync-sheets/auto', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can sync data' });
    }

    const tenders = await syncTendersFromGoogleSheets();
    const opportunities = await transformTendersToOpportunities(tenders);

    await SyncedOpportunity.deleteMany({});
    const inserted = await SyncedOpportunity.insertMany(opportunities);

    res.json({ success: true, count: inserted.length, syncedCount: inserted.length });
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
