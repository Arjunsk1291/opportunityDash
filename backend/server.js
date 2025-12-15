const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files are allowed'));
    }
    cb(null, true);
  }
});

// Store the current data file path
let currentDataFile = null;
let cachedData = null;
let autoRefreshInterval = null;

// Function to read Excel file and convert to JSON
function readExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Save to JSON file for quick access
    const dataPath = path.join(__dirname, 'data', 'opportunities.json');
    fs.writeFileSync(dataPath, JSON.stringify(jsonData, null, 2));
    
    cachedData = jsonData;
    console.log(`✅ Excel file processed: ${jsonData.length} records found`);
    return jsonData;
  } catch (error) {
    console.error('❌ Error reading Excel file:', error);
    throw error;
  }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend is running',
    dataLoaded: cachedData !== null,
    recordCount: cachedData ? cachedData.length : 0
  });
});

// Upload Excel file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    currentDataFile = req.file.path;
    const data = readExcelFile(currentDataFile);
    
    res.json({ 
      message: 'File uploaded and processed successfully',
      recordCount: data.length,
      filename: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all opportunities
app.get('/api/opportunities', (req, res) => {
  try {
    if (!cachedData) {
      // Try to load from JSON file if exists
      const dataPath = path.join(__dirname, 'data', 'opportunities.json');
      if (fs.existsSync(dataPath)) {
        cachedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      } else {
        return res.status(404).json({ error: 'No data available. Please upload an Excel file first.' });
      }
    }
    
    res.json({ 
      data: cachedData,
      count: cachedData.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh data (re-read the Excel file)
app.post('/api/refresh', (req, res) => {
  try {
    if (!currentDataFile || !fs.existsSync(currentDataFile)) {
      return res.status(400).json({ error: 'No Excel file uploaded yet' });
    }
    
    const data = readExcelFile(currentDataFile);
    res.json({ 
      message: 'Data refreshed successfully',
      recordCount: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set auto-refresh interval
app.post('/api/auto-refresh', (req, res) => {
  try {
    const { intervalMinutes } = req.body;
    
    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ error: 'Invalid interval. Must be at least 1 minute.' });
    }
    
    if (!currentDataFile) {
      return res.status(400).json({ error: 'No Excel file uploaded yet' });
    }
    
    // Clear existing interval if any
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
    
    // Set new interval
    autoRefreshInterval = setInterval(() => {
      console.log(`🔄 Auto-refreshing data...`);
      if (currentDataFile && fs.existsSync(currentDataFile)) {
        readExcelFile(currentDataFile);
      }
    }, intervalMinutes * 60 * 1000);
    
    res.json({ 
      message: `Auto-refresh enabled: every ${intervalMinutes} minutes`,
      intervalMinutes: intervalMinutes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disable auto-refresh
app.post('/api/auto-refresh/disable', (req, res) => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    res.json({ message: 'Auto-refresh disabled' });
  } else {
    res.json({ message: 'Auto-refresh was not enabled' });
  }
});

// Get current settings
app.get('/api/settings', (req, res) => {
  res.json({
    hasDataFile: currentDataFile !== null,
    autoRefreshEnabled: autoRefreshInterval !== null,
    dataFilePath: currentDataFile,
    recordCount: cachedData ? cachedData.length : 0
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`📊 Data endpoint: http://localhost:${PORT}/api/opportunities`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  process.exit(0);
});

// Webhook endpoint for Power Automate
app.post('/api/webhook/excel-update', (req, res) => {
  try {
    console.log('📥 Webhook received from Power Automate:', req.body);
    
    // Power Automate will send the entire row data
    const newData = req.body;
    
    // Load existing data
    const dataPath = path.join(__dirname, 'data', 'opportunities.json');
    let existingData = [];
    
    if (fs.existsSync(dataPath)) {
      existingData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    
    // Add new row
    existingData.push(newData);
    
    // Save updated data
    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2));
    cachedData = existingData;
    
    console.log(`✅ Data updated: ${existingData.length} total records`);
    
    res.json({ 
      success: true, 
      message: 'Data received and stored',
      totalRecords: existingData.length 
    });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for full sync (when you want to sync all data)
app.post('/api/webhook/excel-sync-all', (req, res) => {
  try {
    console.log('📥 Full sync webhook received');
    
    const allData = req.body.data || req.body; // Handle different formats
    
    // Save to JSON
    const dataPath = path.join(__dirname, 'data', 'opportunities.json');
    fs.writeFileSync(dataPath, JSON.stringify(allData, null, 2));
    cachedData = allData;
    
    console.log(`✅ Full sync complete: ${allData.length} records`);
    
    res.json({ 
      success: true, 
      message: 'Full sync completed',
      recordCount: allData.length 
    });
  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});
