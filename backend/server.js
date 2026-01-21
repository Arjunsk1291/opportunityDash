import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import approvalDb from './approvalDb.js';
import GoogleSheetsConfig from './models/GoogleSheetsConfig.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import { fetchGoogleSheetData, mapSheetRowToOpportunity } from './services/googleSheetsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

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
    console.log(`✅ Config saved by ${config.configSavedBy} at ${config.lastSavedTime}`);
    
    res.json({ 
      success: true, 
      config: saved,
      message: `Configuration saved successfully at ${config.lastSavedTime.toLocaleTimeString()}`
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
    console.log(`📍 Got ${rows.length} rows, headers at row ${headerRowIndex}`);
    
    const dataRows = rows.slice(headerRowIndex + 1);
    console.log(`📊 Processing ${dataRows.length} data rows`);
    
    const columnMapping = {};
    Object.entries(config.columnMapping).forEach(([fieldName, colNum]) => {
      if (colNum) {
        columnMapping[fieldName] = parseInt(colNum);
        console.log(`  ✅ ${fieldName} -> column ${colNum}`);
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
        console.error(`❌ Error mapping row ${index}:`, e.message);
      }
    });
    
    console.log(`💾 Inserting ${syncedData.length} opportunities...`);
    await SyncedOpportunity.insertMany(syncedData);
    console.log('✅ INSERT COMPLETE');
    
    const updatedConfig = await GoogleSheetsConfig.findOne();
    if (updatedConfig) {
      updatedConfig.lastSyncTime = new Date();
      updatedConfig.lastSyncStatus = `Synced ${syncedData.length} opportunities`;
      updatedConfig.isActive = true;
      await updatedConfig.save();
      console.log('✅ CONFIG UPDATED');
    }
    
    console.log('✅ SYNC COMPLETE');
    res.json({ 
      success: true, 
      syncedCount: syncedData.length,
      message: `Synced ${syncedData.length} opportunities`,
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
    config.lastSyncStatus = `Auto-synced ${syncedData.length} opportunities`;
    await config.save();
    
    console.log(`✅ AUTO-SYNC COMPLETE: ${syncedData.length} opportunities`);
    
    res.json({ 
      success: true, 
      syncedCount: syncedData.length,
      message: `Auto-synced ${syncedData.length} opportunities`,
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
  console.log(`✅ Approval server running on http://localhost:${PORT}`);
});
