import mongoose from 'mongoose';

const opportunityManualUpdateSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true },
    refKey: { type: String, required: true, unique: true, index: true },
    adnocRftNo: { type: String, default: '' },
    tenderName: { type: String, default: '' },
    opportunityClassification: { type: String, default: '' },
    clientName: { type: String, default: '' },
    opportunityValue: { type: Number, default: null },
    dateTenderReceived: { type: String, default: '' },
    tenderPlannedSubmissionDate: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('OpportunityManualUpdate', opportunityManualUpdateSchema);
