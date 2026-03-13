import mongoose from 'mongoose';

const mailScheduleRunSchema = new mongoose.Schema(
  {
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'MailSchedule', required: true },
    scheduleName: { type: String, default: '' },
    runAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    sentCount: { type: Number, default: 0 },
    tenderCount: { type: Number, default: 0 },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('MailScheduleRun', mailScheduleRunSchema);
