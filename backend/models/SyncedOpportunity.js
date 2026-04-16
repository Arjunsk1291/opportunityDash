import mongoose from 'mongoose';

const syncedOpportunitySchema = new mongoose.Schema(
  {
    googleSheetRowId: String,
    opportunityRefNo: String,
    adnocRftNo: { type: String, default: '' },
    tenderName: String,
    clientName: String,
    opportunityValue: Number,
    canonicalStage: String,
    internalLead: String,
    rawSheetYear: { type: String, default: '' },
    rawDateReceived: { type: mongoose.Schema.Types.Mixed, default: '' },
    rawSubmissionDeadline: { type: mongoose.Schema.Types.Mixed, default: '' },
    rawTenderSubmittedDate: { type: mongoose.Schema.Types.Mixed, default: '' },
    dateTenderReceived: String,
    groupClassification: String,
    opportunityClassification: String,
    qualificationStatus: String,
    tenderPlannedSubmissionDate: String,
    tenderSubmittedDate: String,
    country: String,
    leadEmail: { type: String, default: '' },
    leadEmailSource: { type: String, default: '' },
    leadEmailAssignedBy: { type: String, default: '' },
    leadEmailAssignedAt: { type: Date, default: null },
    deadlineAlerted: { type: Boolean, default: false },
    deadlineAlertedAt: { type: Date, default: null },
    deadlineAlertedDateKey: { type: String, default: '' },
    probability: { type: Number, default: 0 },
    rawAvenirStatus: { type: String, default: '' },
    rawTenderResult: { type: String, default: '' },
    avenirStatus: String,  // ✅ NEW: AVENIR STATUS from Google Sheets
    tenderResult: String,  // ✅ NEW: TENDER RESULT from Google Sheets
    postBidDetailType: { type: String, default: '' },
    postBidDetailOther: { type: String, default: '' },
    postBidDetailUpdatedBy: { type: String, default: '' },
    postBidDetailUpdatedAt: { type: Date, default: null },
    remarksReason: String,
    comments: String,
    tenderStatusRemark: String,
    awardedDate: { type: String, default: null },
    combinedStatuses: [String],  // ✅ NEW: Array of both statuses (no double count)
    telecastAlerted: { type: Boolean, default: false },
    telecastAlertedAt: { type: Date, default: null },
    telecastAlertedKey: { type: String, default: '' },
    telecastAlertedRefNo: { type: String, default: '' },
    telecastAlertSource: { type: String, default: '' },
    rawGoogleData: mongoose.Schema.Types.Mixed,
    rawGraphData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('SyncedOpportunity', syncedOpportunitySchema);
