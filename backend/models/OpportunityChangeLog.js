import mongoose from 'mongoose';

const opportunityChangeLogSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true },
    refKey: { type: String, required: true, index: true },
    action: { type: String, required: true },
    source: { type: String, default: 'manual_form' },
    changedBy: { type: String, default: '' },
    changedByDisplayName: { type: String, default: '' },
    changedByRole: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    authUser: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    fieldDiffs: {
      type: [
        {
          fieldKey: { type: String, required: true },
          previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
          nextValue: { type: mongoose.Schema.Types.Mixed, default: null },
          note: { type: String, default: '' },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('OpportunityChangeLog', opportunityChangeLogSchema);

