import mongoose from 'mongoose';

const loginLogSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Master', 'Admin', 'Basic'],
    required: true,
  },
  loginTime: {
    type: Date,
    default: Date.now,
    expires: 1296000,
  },
  ipAddress: String,
});

export default mongoose.model('LoginLog', loginLogSchema);
