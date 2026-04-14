import mongoose from 'mongoose';

const bdEngagementSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, trim: true },
    date: { type: String, default: '' },
    clientName: { type: String, default: '' },
    meetingType: { type: String, default: '' },
    status: { type: String, default: 'Open' },
    location: { type: String, default: '' },
    discussionPoints: { type: String, default: '' },
    reportSubmitted: { type: Boolean, default: false },
    leadGenerated: { type: Boolean, default: false },
    focalPerson: { type: String, default: '' },
    designation: { type: String, default: '' },
    email: { type: String, default: '' },
    mobileNumber: { type: String, default: '' },
    leadDescription: { type: String, default: '' },
    nextSteps: { type: String, default: '' },
    lastContact: { type: String, default: '' },
  },
  { timestamps: true }
);

bdEngagementSchema.index({ ref: 1, date: 1, clientName: 1 });

export default mongoose.model('BDEngagement', bdEngagementSchema);

