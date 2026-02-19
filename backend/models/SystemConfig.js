import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    serviceEmail: { type: String, default: '' },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    encryptedPassword: { type: String, default: '' },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('SystemConfig', systemConfigSchema);
