import mongoose from 'mongoose';

const potentialOpportunitySchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true, index: true },
    isPotential: { type: Boolean, default: true, index: true },
    // User-managed extra fields that must survive opportunity refreshes/sheet-sync.
    extras: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'potential_opportunities' }
);

potentialOpportunitySchema.index({ opportunityRefNo: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('PotentialOpportunity', potentialOpportunitySchema);

