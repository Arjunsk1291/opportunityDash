import mongoose from 'mongoose';

const projectUpdateSchema = new mongoose.Schema(
  {
    tenderId: { type: String, required: true, index: true },
    tenderRefNo: { type: String, required: true, index: true },
    updateType: {
      type: String,
      required: true,
      enum: [
        'vendor_contacted',
        'vendor_response',
        'vendor_finalized',
        'extension_requested',
        'due_date_changed',
        'status_update',
        'general_note',
      ],
    },
    vendorName: { type: String, default: '' },
    parentUpdateId: { type: String, default: '' },
    responseDetails: { type: String, default: '' },
    contactDate: { type: String, default: '' },
    responseDate: { type: String, default: '' },
    extensionDate: { type: String, default: '' },
    finalizedDate: { type: String, default: '' },
    finalDecision: {
      type: String,
      enum: ['accepted', 'rejected', 'negotiating', ''],
      default: '',
    },
    finalInstructions: { type: String, default: '' },
    finalPrice: { type: Number, default: null },
    notes: { type: String, default: '' },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true }
);

projectUpdateSchema.index({ tenderRefNo: 1, createdAt: -1 });

export default mongoose.model('ProjectUpdate', projectUpdateSchema);
