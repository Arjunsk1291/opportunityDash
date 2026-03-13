import mongoose from 'mongoose';

const mailScheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    templateKey: { type: String, default: 'weekly_pipeline' },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    weekday: { type: String, default: 'Monday' },
    monthDay: { type: Number, default: 1 },
    sendTime: { type: String, default: '08:30' },
    timezone: { type: String, default: 'Asia/Dubai' },
    attachmentMode: { type: String, enum: ['filtered_extract', 'full_sheet_copy'], default: 'filtered_extract' },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recipients: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('MailSchedule', mailScheduleSchema);
