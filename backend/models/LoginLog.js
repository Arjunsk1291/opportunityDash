import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';

const loginLogSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser', 'MASTER', 'PROPOSAL_HEAD'],
    required: true,
  },
  loginTime: {
    type: Date,
    default: Date.now,
    expires: 1296000,
  },
  ipAddress: String,
});

export default brandModel('LoginLog', loginLogSchema, brandCollection('login_logs'));
