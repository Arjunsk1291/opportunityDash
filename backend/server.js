import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
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

// ===== AUTH MIDDLEWARE =====
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const email = decoded.payload.preferred_username || 
                  decoded.payload.upn || 
                  decoded.payload.email ||
                  decoded.payload.mail;
    
    if (!email) {
      console.error('Token claims:', decoded.payload);
      return res.status(401).json({ error: 'Token missing email claim' });
    }

    const cleanEmail = email.toLowerCase();
    const user = await AuthorizedUser.findOne({ email: cleanEmail });
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
      email: cleanEmail,
      role: user.role,
      userId: user._id,
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ error: 'Token verification failed' });
  }
};

// ===== OAUTH ENDPOINTS =====

app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const email = decoded.payload.preferred_username || 
                  decoded.payload.upn || 
                  decoded.payload.email ||
                  decoded.payload.mail;
    
    if (!email) {
      return res.status(401).json({ error: 'Token missing email claim' });
    }

    const cleanEmail = email.toLowerCase();
    let user = await AuthorizedUser.findOne({ email: cleanEmail });
    
    if (!user) {
      console.log('📋 Creating new pending user:', cleanEmail);
      user = new AuthorizedUser({
        email: cleanEmail,
        role: 'Basic',
        status: 'pending',
      });
      await user.save();
      
      return res.json({
        success: true,
        user: {
          email: user.email,
          role: user.role,
          status: user.status,
        },
        message: 'User pending approval. Please wait for Master to approve your access.',
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'User access rejected', status: 'rejected' });
    }

    if (user.status === 'pending') {
      return res.json({
        success: true,
        user: {
          email: user.email,
          role: user.role,
          status: user.status,
        },
        message: 'User pending approval. Master will review your request.',
      });
    }

    res.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Token verification error:', error.message);
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
  try {
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/authorized', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can view this' });
    }

    const users = await AuthorizedUser.find().sort({ createdAt: -1 });
    res.json(users);
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

    console.log('✅ User approved:', email, 'by', req.user.email);
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

    console.log('❌ User rejected:', email, 'by', req.user.email);
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

    const { email, newRole } = req.body;
    if (!email || !newRole) {
      return res.status(400).json({ error: 'Email and newRole are required' });
    }

    const validRoles = ['Master', 'Admin', 'Basic'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be Master, Admin, or Basic' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      { role: newRole },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('🔄 User role changed:', email, 'to', newRole, 'by', req.user.email);
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

    console.log('🗑️ User removed:', email, 'by', req.user.email);
    res.json({ success: true, message: 'User removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/seed', async (req, res) => {
  try {
    const masterEmails = (process.env.MASTER_USERS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const adminEmails = (process.env.ADMIN_USERS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const basicEmails = (process.env.BASIC_USERS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    const usersToAdd = [
      ...masterEmails.map(email => ({ email, role: 'Master', status: 'approved' })),
      ...adminEmails.map(email => ({ email, role: 'Admin', status: 'approved' })),
      ...basicEmails.map(email => ({ email, role: 'Basic', status: 'approved' })),
    ];

    if (usersToAdd.length === 0) {
      return res.status(400).json({ error: 'No users configured in environment variables' });
    }

    const results = await Promise.all(
      usersToAdd.map(userData =>
        AuthorizedUser.findOneAndUpdate(
          { email: userData.email },
          userData,
          { upsert: true, new: true }
        )
      )
    );

    console.log('✅ Seeded', results.length, 'authorized users');
    res.json({ success: true, count: results.length, users: results });
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

    console.log('🗑️ Cleaned up', result.deletedCount, 'old login logs');
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== APPROVALS =====
app.get('/api/approvals', async (req, res) => {
  try {
    const approvals = await approvalDb.getApprovals();
    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve', async (req, res) => {
  try {
    const { opportunityRefNo, performedBy, performedByRole } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }
    const result = await approvalDb.approveOpportunity(opportunityRefNo, performedBy, performedByRole);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/revert', async (req, res) => {
  try {
    const { opportunityRefNo, performedBy, performedByRole } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }
    const result = await approvalDb.revertApproval(opportunityRefNo, performedBy, performedByRole);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approval-logs', async (req, res) => {
  try {
    const logs = await approvalDb.getApprovalLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DATA SYNC (Hard-coded from Google Sheets) =====
app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can sync data' });
    }

    console.log('\n📊 ════════════════════════════════════════');
    console.log('🔄 Starting data sync from Google Sheets...');
    console.log('📊 ════════════════════════════════════════\n');

    // Fetch tenders from Google Sheets
    const tenders = await syncTendersFromGoogleSheets();
    console.log(`✅ Fetched ${tenders.length} tenders from Google Sheets`);

    // Transform to Opportunity format
    const opportunities = await transformTendersToOpportunities(tenders);

    // Clear existing data and insert new
    await SyncedOpportunity.deleteMany({});
    console.log('✅ Cleared old data from MongoDB');

    const inserted = await SyncedOpportunity.insertMany(opportunities);
    console.log(`✅ Inserted ${inserted.length} opportunities into MongoDB`);

    console.log('📊 ════════════════════════════════════════');
    console.log('✅ DATA SYNC COMPLETE!');
    console.log('📊 ════════════════════════════════════════\n');

    res.json({
      success: true,
      count: inserted.length,
      syncedCount: inserted.length,
      message: `Synced ${inserted.length} tenders from Google Sheets`,
    });
  } catch (error) {
    console.error('❌ Sync error:', error.message);
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

app.post('/api/opportunities/sync-sheets/auto', async (req, res) => {
  try {
    console.log('🔄 AUTO-SYNC: Starting automatic sync from Google Sheets...');

    // Fetch tenders from Google Sheets
    const tenders = await syncTendersFromGoogleSheets();
    console.log(`✅ AUTO-SYNC: Fetched ${tenders.length} tenders`);

    // Transform to Opportunity format
    const opportunities = await transformTendersToOpportunities(tenders);

    // Clear existing data and insert new
    await SyncedOpportunity.deleteMany({});
    const inserted = await SyncedOpportunity.insertMany(opportunities);
    console.log(`✅ AUTO-SYNC: Inserted ${inserted.length} opportunities`);

    res.json({
      success: true,
      count: inserted.length,
      syncedCount: inserted.length,
      message: `Auto-synced ${inserted.length} tenders`,
    });
  } catch (error) {
    console.error('❌ AUTO-SYNC: Error -', error.message);
    res.status(500).json({ error: 'Auto-sync failed: ' + error.message });
  }
});

// ===== OPPORTUNITIES =====
app.get('/api/opportunities', async (req, res) => {
  try {
    const opportunities = await SyncedOpportunity.find().sort({ createdAt: -1 }).lean();
    const mapped = opportunities.map(opp => mapIdField(opp));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend static files
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('✅ Server running on http://localhost:' + PORT);
});
