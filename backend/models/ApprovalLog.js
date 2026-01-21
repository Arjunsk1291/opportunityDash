import mongoose from 'mongoose';

const approvalLogSchema = new mongoose.Schema(
  {
    // ✅ FIXED: Use opportunityRefNo instead of opportunityId
    opportunityRefNo: { type: String, required: true },
    opportunityId: { type: String, default: null },
    action: { type: String, enum: ['approved', 'reverted'], required: true },
    performedBy: { type: String, required: true },
    performedByRole: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('ApprovalLog', approvalLogSchema);
