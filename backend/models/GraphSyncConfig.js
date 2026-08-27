import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';

const graphSyncConfigSchema = new mongoose.Schema(
  {
    shareLink: { type: String, default: '' },
    driveId: { type: String, default: '' },
    fileId: { type: String, default: '' },
    worksheetName: { type: String, default: '' },
    dataRange: { type: String, default: '' },
    headerRowOffset: { type: Number, default: 0 },
    syncIntervalMinutes: { type: Number, default: 10 },
    fieldMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
    graphAuthMode: { type: String, enum: ['application', 'delegated'], default: 'application' },
    graphAccountUsername: { type: String, default: '' },
    graphRefreshTokenEnc: { type: String, default: '' },
    graphTokenUpdatedAt: { type: Date, default: null },
    lastResolvedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default brandModel('GraphSyncConfig', graphSyncConfigSchema, brandCollection('graph_sync_configs'));
