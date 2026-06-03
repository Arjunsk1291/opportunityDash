import mongoose from 'mongoose';

const authDiagnosticLogSchema = new mongoose.Schema(
  {
    email: { type: String, default: '' },
    route: { type: String, required: true },
    method: { type: String, default: '' },
    code: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: Number, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

authDiagnosticLogSchema.index({ createdAt: -1 });

export default mongoose.model('AuthDiagnosticLog', authDiagnosticLogSchema);
