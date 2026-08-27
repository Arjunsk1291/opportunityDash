import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';

const approvalLogSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true },
    action: {
      type: String,
      enum: ['proposal_head_approved', 'svp_approved', 'reverted'],
      required: true,
    },
    performedBy: { type: String, required: true },
    performedByRole: { type: String, required: true },
    group: { type: String, default: null },
  },
  { timestamps: true }
);

export default brandModel('ApprovalLog', approvalLogSchema, brandCollection('approval_logs'));
