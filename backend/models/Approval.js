import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema(
  {
    // ✅ FIXED: Use opportunityRefNo as unique key instead of opportunityId
    opportunityRefNo: { type: String, required: true, unique: true },
    // Keep opportunityId for backward compatibility but not required
    opportunityId: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    approvedBy: { type: String, default: null },
    approvedByRole: { type: String, default: null },
    approvalDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Approval', approvalSchema);
