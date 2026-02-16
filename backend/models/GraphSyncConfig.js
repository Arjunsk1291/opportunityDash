import mongoose from 'mongoose';

const graphSyncConfigSchema = new mongoose.Schema(
  {
    shareLink: { type: String, default: '' },
    driveId: { type: String, default: '' },
    fileId: { type: String, default: '' },
    worksheetName: { type: String, default: '' },
    syncIntervalMinutes: { type: Number, default: 10 },
    fieldMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastResolvedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('GraphSyncConfig', graphSyncConfigSchema);
