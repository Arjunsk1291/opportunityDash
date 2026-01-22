import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import approvalDb from './approvalDb.js';
import GoogleSheetsConfig from './models/GoogleSheetsConfig.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import LoginLog from './models/LoginLog.js';
import { fetchGoogleSheetData, mapSheetRowToOpportunity } from './services/googleSheetsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
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

    // Extract email from Microsoft token - try multiple claim names
    const email = decoded.payload.preferred_username || 
                  decoded.payload.upn || 
                  decoded.payload.email ||
                  decoded.payload.mail;
    
    if (!email) {
      console.error('Token claims:', decoded.payload);
      return res.status(401).json({ error: 'Token missing email claim' });
    }

    const cleanEmail = email.toLowerCase();

    // Check if user is authorized
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

// ✅ Verify Azure token and check authorization (ALLOWS PENDING USERS)
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

    // Extract email from Microsoft token
    const email = decoded.payload.preferred_username || 
                  decoded.payload.upn || 
                  decoded.payload.email ||
                  decoded.payload.mail;
    
    if (!email) {
      console.error('Token missing email. Claims available:', Object.keys(decoded.payload));
      return res.status(401).json({ error: 'Token missing email claim' });
    }

    const cleanEmail = email.toLowerCase();
    let user = await AuthorizedUser.findOne({ email: cleanEmail });
    
    // ✅ NEW: If user doesn't exist, create as pending
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

    // ✅ ALLOW pending users to proceed (they'll see a message)
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

// Record login
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

// Get current user
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

// Get all authorized users (Master only)
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

// Approve pending user (Master only)
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

// Reject user (Master only)
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

// Remove approved user (Master only)
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

// Seed authorized users from environment (run once)
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

// Manual cleanup of old login logs (Master only)
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

// ===== GOOGLE SHEETS CONFIG =====
app.get('/api/google-sheets/config', async (req, res) => {
  try {
    const config = await GoogleSheetsConfig.findOne();
    if (!config) {
      return res.json({});
    }
    res.json({
      apiKey: config.apiKey,
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      columnMapping: config.columnMapping,
      isActive: config.isActive,
      lastSyncTime: config.lastSyncTime,
      lastSyncStatus: config.lastSyncStatus,
      lastSavedTime: config.lastSavedTime,
      configSavedBy: config.configSavedBy,
      autoRefreshInterval: config.autoRefreshInterval,
      isAutoRefreshEnabled: config.isAutoRefreshEnabled,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/google-sheets/config', async (req, res) => {
  try {
    const { apiKey, spreadsheetId, sheetName, columnMapping, configSavedBy } = req.body;
    
    if (!apiKey || !spreadsheetId || !sheetName) {
      return res.status(400).json({ error: 'apiKey, spreadsheetId, and sheetName are required' });
    }
    
    let config = await GoogleSheetsConfig.findOne();
    if (!config) {
      config = new GoogleSheetsConfig();
    }
    
    config.apiKey = apiKey;
    config.spreadsheetId = spreadsheetId;
    config.sheetName = sheetName;
    config.columnMapping = columnMapping;
    config.isActive = false;
    config.lastSavedTime = new Date();
    config.configSavedBy = configSavedBy || 'Master User';
    config.autoRefreshInterval = 10;
    config.isAutoRefreshEnabled = true;
    
    const saved = await config.save();
    console.log('✅ Config saved by ' + config.configSavedBy + ' at ' + config.lastSavedTime);
    
    res.json({ 
      success: true, 
      config: saved,
      message: 'Configuration saved successfully at ' + config.lastSavedTime.toLocaleTimeString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/google-sheets/test', async (req, res) => {
  try {
    const { apiKey, spreadsheetId, sheetName } = req.body;
    const { headerRowIndex, headers, rows } = await fetchGoogleSheetData(apiKey, spreadsheetId, sheetName);
    const dataRowCount = rows.length - 1 - headerRowIndex;
    
    res.json({ 
      success: true,
      headerRowIndex,
      columnCount: headers.length,
      rowCount: dataRowCount,
      headers: headers,
      preview: rows.slice(headerRowIndex + 1, headerRowIndex + 4) 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/google-sheets/sync', async (req, res) => {
  try {
    console.log('🔄 SYNC STARTED');
    const config = await GoogleSheetsConfig.findOne();
    if (!config) {
      console.log('❌ NO CONFIG FOUND');
      return res.status(400).json({ error: 'No Google Sheets configuration found' });
    }
    
    console.log('📋 CONFIG FOUND, fetching data...');
    const { headerRowIndex, rows, headers } = await fetchGoogleSheetData(config.apiKey, config.spreadsheetId, config.sheetName);
    console.log('📍 Got ' + rows.length + ' rows, headers at row ' + headerRowIndex);
    
    const dataRows = rows.slice(headerRowIndex + 1);
    console.log('📊 Processing ' + dataRows.length + ' data rows');
    
    const columnMapping = {};
    Object.entries(config.columnMapping).forEach(([fieldName, colNum]) => {
      if (colNum) {
        columnMapping[fieldName] = parseInt(colNum);
        console.log('  ✅ ' + fieldName + ' -> column ' + colNum);
      }
    });
    
    console.log('🗑️ Clearing old data...');
    await SyncedOpportunity.deleteMany({});
    
    console.log('📝 Mapping rows...');
    const syncedData = [];
    dataRows.forEach((row, index) => {
      try {
        const mapped = mapSheetRowToOpportunity(row, columnMapping);
        if (mapped.opportunityRefNo && mapped.opportunityRefNo !== 'UNKNOWN') {
          syncedData.push({
            googleSheetRowId: headerRowIndex + index + 2,
            ...mapped,
            rawGoogleData: row,
          });
        }
      } catch (e) {
        console.error('❌ Error mapping row ' + index + ':', e.message);
      }
    });
    
    console.log('💾 Inserting ' + syncedData.length + ' opportunities...');
    await SyncedOpportunity.insertMany(syncedData);
    console.log('✅ INSERT COMPLETE');
    
    const updatedConfig = await GoogleSheetsConfig.findOne();
    if (updatedConfig) {
      updatedConfig.lastSyncTime = new Date();
      updatedConfig.lastSyncStatus = 'Synced ' + syncedData.length + ' opportunities';
      updatedConfig.isActive = true;
      await updatedConfig.save();
      console.log('✅ CONFIG UPDATED');
    }
    
    console.log('✅ SYNC COMPLETE');
    res.json({ 
      success: true, 
      syncedCount: syncedData.length,
      message: 'Synced ' + syncedData.length + ' opportunities',
      lastSyncTime: new Date(),
    });
  } catch (error) {
    console.error('❌ SYNC ERROR:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/google-sheets/opportunities', async (req, res) => {
  try {
    const opportunities = await SyncedOpportunity.find().sort({ createdAt: -1 }).lean();
    const mapped = opportunities.map(opp => mapIdField(opp));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/google-sheets/clear', async (req, res) => {
  try {
    const result = await SyncedOpportunity.deleteMany({});
    const config = await GoogleSheetsConfig.findOne();
    if (config) {
      config.isActive = false;
      config.lastSyncStatus = 'Data cleared';
      await config.save();
    }
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/google-sheets/auto-sync', async (req, res) => {
  try {
    console.log('🔄 AUTO-SYNC TRIGGERED');
    const config = await GoogleSheetsConfig.findOne();
    
    if (!config || !config.isAutoRefreshEnabled) {
      console.log('⏭️ AUTO-SYNC DISABLED');
      return res.json({ success: false, message: 'Auto-sync is disabled' });
    }
    
    const { headerRowIndex, rows } = await fetchGoogleSheetData(config.apiKey, config.spreadsheetId, config.sheetName);
    const dataRows = rows.slice(headerRowIndex + 1);
    
    const columnMapping = {};
    Object.entries(config.columnMapping).forEach(([fieldName, colNum]) => {
      if (colNum) {
        columnMapping[fieldName] = parseInt(colNum);
      }
    });
    
    const syncedData = [];
    dataRows.forEach((row, index) => {
      try {
        const mapped = mapSheetRowToOpportunity(row, columnMapping);
        if (mapped.opportunityRefNo && mapped.opportunityRefNo !== 'UNKNOWN') {
          syncedData.push({
            googleSheetRowId: headerRowIndex + index + 2,
            ...mapped,
            rawGoogleData: row,
          });
        }
      } catch (e) {
        // Silent fail for auto-sync
      }
    });
    
    await SyncedOpportunity.deleteMany({});
    await SyncedOpportunity.insertMany(syncedData);
    
    config.lastSyncTime = new Date();
    config.lastSyncStatus = 'Auto-synced ' + syncedData.length + ' opportunities';
    await config.save();
    
    console.log('✅ AUTO-SYNC COMPLETE: ' + syncedData.length + ' opportunities');
    
    res.json({ 
      success: true, 
      syncedCount: syncedData.length,
      message: 'Auto-synced ' + syncedData.length + ' opportunities',
      lastSyncTime: new Date(),
    });
  } catch (error) {
    console.error('❌ AUTO-SYNC ERROR:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend static files
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('✅ Approval server running on http://localhost:' + PORT);
});
