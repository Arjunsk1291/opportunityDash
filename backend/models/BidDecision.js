import mongoose from 'mongoose';

const bidDecisionCriterionSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    label: { type: String, default: '' },
    rating: { type: Number, default: null },
    weight: { type: Number, default: null },
    notes: { type: String, default: '' },
    included: { type: Boolean, default: true },
  },
  { _id: false }
);

const bidDecisionSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true, index: true, unique: true },
    bidDecision: {
      type: String,
      enum: ['BID', 'NO BID', 'BLANK'],
      default: 'BLANK',
      index: true,
    },
    decisionScore: { type: Number, default: 0 },
    criteriaValues: { type: [bidDecisionCriterionSchema], default: [] },
    sourceMode: {
      type: String,
      enum: ['dashboard', 'manual'],
      default: 'manual',
      index: true,
    },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    sourceOpportunitySyncedAt: { type: Date, default: null },
    sourceOpportunityId: { type: String, default: '' },
  },
  { timestamps: true }
);

bidDecisionSchema.index({ opportunityRefNo: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('BidDecision', bidDecisionSchema);
