import mongoose from 'mongoose';

const approvalLogSchema = new mongoose.Schema(
  {
    opportunityId: { type: String, required: true },
    action: { type: String, enum: ['approved', 'reverted'], required: true },
    performedBy: { type: String, required: true },
    performedByRole: { type: String, enum: ['master', 'admin', 'basic'], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('ApprovalLog', approvalLogSchema);
