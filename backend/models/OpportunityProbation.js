import mongoose from 'mongoose';

const opportunityProbationSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true },
    refKey: { type: String, required: true, index: true },
    action: { type: String, enum: ['new', 'update', 'resolve_conflict'], required: true },
    source: { type: String, default: 'manual_form' },
    changedBy: { type: String, default: '' },
    changedByDisplayName: { type: String, default: '' },
    changedByRole: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    previousSyncedOpportunity: { type: mongoose.Schema.Types.Mixed, default: null },
    previousManualSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('OpportunityProbation', opportunityProbationSchema);

