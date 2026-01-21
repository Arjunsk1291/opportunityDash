import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import approvalDb from './approvalDb.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Approval endpoints
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
    const { opportunityId, performedBy, performedByRole } = req.body;
    const result = await approvalDb.approveOpportunity(opportunityId, performedBy, performedByRole);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/revert', async (req, res) => {
  try {
    const { opportunityId, performedBy, performedByRole } = req.body;
    const result = await approvalDb.revertApproval(opportunityId, performedBy, performedByRole);
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

app.listen(PORT, () => {
  console.log(`✅ Approval server running on http://localhost:${PORT}`);
});
