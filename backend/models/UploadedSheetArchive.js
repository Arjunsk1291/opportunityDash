import mongoose from 'mongoose';

const uploadedSheetArchiveSchema = new mongoose.Schema({
  filename: { type: String, required: true, trim: true },
  contentType: {
    type: String,
    default: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  data: { type: Buffer, required: true },
  uploadedBy: { type: String, default: '' },
  rowCount: { type: Number, default: 0 },
  createdCount: { type: Number, default: 0 },
  updatedCount: { type: Number, default: 0 },
  notifiedAt: { type: Date, default: null },
  notifiedTo: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

// Storage hygiene only — sheets are meant to be sent right after upload, not kept forever.
uploadedSheetArchiveSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model('UploadedSheetArchive', uploadedSheetArchiveSchema);
