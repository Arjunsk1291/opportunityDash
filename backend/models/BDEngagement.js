import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';
import { applyBrandPlugin } from '../brandContext.js';

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
bdEngagementSchema.index({ createdAt: -1 });
applyBrandPlugin(bdEngagementSchema, { includeUniqueIndex: false });

export default brandModel('BDEngagement', bdEngagementSchema, brandCollection('bd_engagements'));
