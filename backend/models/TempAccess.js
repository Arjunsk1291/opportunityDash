import mongoose from 'mongoose';

const tempAccessSchema = new mongoose.Schema(
  {
    accessId: { type: String, required: true, unique: true },
    displayName: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    allowedPages: { type: [String], default: [] },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

tempAccessSchema.index({ accessId: 1 });
tempAccessSchema.index({ isActive: 1, validUntil: 1 });

export default mongoose.model('TempAccess', tempAccessSchema);
