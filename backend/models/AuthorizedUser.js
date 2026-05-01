import mongoose from 'mongoose';

const authorizedUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  displayName: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser', 'MASTER', 'PROPOSAL_HEAD'],
    required: true,
  },
  assignedGroup: {
    type: String,
    enum: ['GES', 'GDS', 'GTS', null],
    default: null,
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
  passwordHash: {
    type: String,
    default: '',
  },
  tempAccessExpiresAt: {
    type: Date,
    default: null,
  },
  // Security/ISO 27001 compliance fields
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  accountLockedUntil: {
    type: Date,
    default: null,
  },
  lastFailedLoginAt: {
    type: Date,
    default: null,
  },
  passwordChangedAt: {
    type: Date,
    default: null,
  },
  requiresPasswordChange: {
    type: Boolean,
    default: false,
  },
});

authorizedUserSchema.pre('save', function enforceSvpGroup(next) {
  if (this.role === 'SVP' && !this.assignedGroup) {
    return next(new Error('assignedGroup is required for SVP users'));
  }
  return next();
});

export default mongoose.model('AuthorizedUser', authorizedUserSchema);
