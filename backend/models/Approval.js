import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'proposal_head_approved', 'fully_approved'],
      default: 'pending',
    },
    proposalHeadApproved: { type: Boolean, default: false },
    proposalHeadBy: { type: String, default: null },
    proposalHeadAt: { type: Date, default: null },
    svpApproved: { type: Boolean, default: false },
    svpBy: { type: String, default: null },
    svpAt: { type: Date, default: null },
    svpGroup: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Approval', approvalSchema);
