import mongoose from 'mongoose';

const syncedOpportunitySchema = new mongoose.Schema(
  {
    googleSheetRowId: String,
    opportunityRefNo: String,
    adnocRftNo: { type: String, default: '' },
    tenderName: String,
    clientName: String,
    opportunityValue: Number,
    frameworkTotalValue: { type: Number, default: null },
    callOffActualValue: { type: Number, default: null },
    variationDeltaValue: { type: Number, default: 0 },
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
    awardEventNotified: { type: Boolean, default: false },
    awardEventNotifiedAt: { type: Date, default: null },
    awardEventKey: { type: String, default: '' },
    awardEventSource: { type: String, default: '' },
    rawGoogleData: mongoose.Schema.Types.Mixed,
    rawGraphData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

syncedOpportunitySchema.index({ opportunityRefNo: 1 });
syncedOpportunitySchema.index({ telecastAlerted: 1, telecastAlertedKey: 1 });
syncedOpportunitySchema.index({ telecastAlerted: 1, telecastAlertedRefNo: 1 });
syncedOpportunitySchema.index({ syncedAt: -1 });

export default mongoose.model('SyncedOpportunity', syncedOpportunitySchema);
