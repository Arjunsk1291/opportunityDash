import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    serviceEmail: { type: String, default: '' },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    encryptedPassword: { type: String, default: '' },
    tenantId: { type: String, default: '' },
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    serviceUsername: { type: String, default: '' },

    telecastGraphAuthMode: { type: String, enum: ['application', 'delegated'], default: 'application' },
    telecastGraphAccountUsername: { type: String, default: '' },
    telecastGraphRefreshTokenEnc: { type: String, default: '' },
    telecastGraphTokenUpdatedAt: { type: Date, default: null },
    graphRefreshTokenEnc: { type: String, default: '' },
    mailAccessTokenEnc: { type: String, default: '' },
    mailRefreshTokenEnc: { type: String, default: '' },
    mailTokenExpiresAt: { type: Date, default: null },
    graphTokenUpdatedAt: { type: Date, default: null },
    notificationRowSignatures: { type: [String], default: [] },
    notificationLastCheckedAt: { type: Date, default: null },
    notificationLastNewRowsCount: { type: Number, default: 0 },
    notificationLastNewRows: { type: [String], default: [] },
    lastUpdatedBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('SystemConfig', systemConfigSchema);
