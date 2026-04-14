import mongoose from 'mongoose';

const opportunityFieldConflictSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true },
    refKey: { type: String, required: true, index: true },
    fieldKey: { type: String, required: true },
    fieldLabel: { type: String, default: '' },
    sheetValue: { type: mongoose.Schema.Types.Mixed, default: null },
    existingValue: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending', index: true },
    detectedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: '' },
    resolutionAction: { type: String, enum: ['', 'use_sheet', 'keep_existing'], default: '' },
  },
  { timestamps: true }
);

opportunityFieldConflictSchema.index({ refKey: 1, fieldKey: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

export default mongoose.model('OpportunityFieldConflict', opportunityFieldConflictSchema);

