import mongoose from 'mongoose';

const syncedOpportunitySchema = new mongoose.Schema(
  {
    googleSheetRowId: String,
    opportunityRefNo: String,
    tenderName: String,
    clientName: String,
    opportunityValue: Number,
    canonicalStage: String,
    internalLead: String,
    dateTenderReceived: String,
    groupClassification: String,
    opportunityClassification: String,
    qualificationStatus: String,
    tenderPlannedSubmissionDate: String,
    rawGoogleData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('SyncedOpportunity', syncedOpportunitySchema);
