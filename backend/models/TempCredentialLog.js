import mongoose from 'mongoose';

const tempCredentialLogSchema = new mongoose.Schema(
  {
    createdBy: { type: String, required: true },
    createdByRole: { type: String, required: true },
    targetEmails: { type: [String], default: [] },
    sentCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('TempCredentialLog', tempCredentialLogSchema);
