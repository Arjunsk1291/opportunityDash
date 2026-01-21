import mongoose from 'mongoose';

const authorizedUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  role: {
    type: String,
    enum: ['Master', 'Admin', 'Basic'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  approvedBy: {
    type: String,
    default: null,
  },
  approvedAt: {
    type: Date,
    default: null,
  },
});

export default mongoose.model('AuthorizedUser', authorizedUserSchema);
