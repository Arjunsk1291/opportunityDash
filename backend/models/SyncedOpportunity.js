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
    avenirStatus: String,  // ✅ NEW: AVENIR STATUS from Google Sheets
    tenderResult: String,  // ✅ NEW: TENDER RESULT from Google Sheets
    combinedStatuses: [String],  // ✅ NEW: Array of both statuses (no double count)
    rawGoogleData: mongoose.Schema.Types.Mixed,
    rawGraphData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('SyncedOpportunity', syncedOpportunitySchema);
