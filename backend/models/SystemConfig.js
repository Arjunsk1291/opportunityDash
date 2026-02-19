import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    serviceEmail: { type: String, default: '' },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    encryptedPassword: { type: String, default: '' },
    graphRefreshTokenEnc: { type: String, default: '' },
    graphTokenUpdatedAt: { type: Date, default: null },
    lastUpdatedBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('SystemConfig', systemConfigSchema);
