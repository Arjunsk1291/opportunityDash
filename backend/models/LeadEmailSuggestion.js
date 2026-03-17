import mongoose from 'mongoose';

const leadEmailSuggestionSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, default: '' },
    tenderName: { type: String, default: '' },
    leadName: { type: String, default: '' },
    suggestedEmail: { type: String, default: '', lowercase: true, trim: true },
    score: { type: Number, default: 0 },
    suggestedBy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdBy: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leadEmailSuggestionSchema.index({ opportunityRefNo: 1, suggestedEmail: 1, status: 1 });

export default mongoose.model('LeadEmailSuggestion', leadEmailSuggestionSchema);
