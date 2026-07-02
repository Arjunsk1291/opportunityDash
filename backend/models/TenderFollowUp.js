import mongoose from 'mongoose';

// Follow-up notes attached to a tender (opportunity), keyed by opportunityRefNo.
// Intentionally an isolated collection (like BDEngagement) so it never touches the
// sheet sync / merge / grid pipeline that writes SyncedOpportunity.
const tenderFollowUpSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true, trim: true, index: true },
    // Denormalized context captured at creation so the standalone page can show
    // which tender a follow-up belongs to without joining SyncedOpportunity.
    tenderName: { type: String, default: '' },
    clientName: { type: String, default: '' },
    // User-entered content.
    date: { type: String, default: '' },
    note: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

tenderFollowUpSchema.index({ opportunityRefNo: 1, createdAt: -1 });
tenderFollowUpSchema.index({ createdAt: -1 });

export default mongoose.model('TenderFollowUp', tenderFollowUpSchema);
