import mongoose from 'mongoose';

const notificationRuleSchema = new mongoose.Schema(
  {
    triggerEvent: {
      type: String,
      enum: ['NEW_TENDER_SYNCED'],
      default: 'NEW_TENDER_SYNCED',
      required: true,
    },
    recipientRole: {
      type: String,
      enum: ['SVP'],
      default: 'SVP',
      required: true,
    },
    useGroupMatching: {
      type: Boolean,
      default: true,
    },
    emailSubject: {
      type: String,
      default: 'New Tender Synced: {{tenderName}}',
    },
    emailBody: {
      type: String,
      default: '<p>Dear Team,</p><p>A new tender has been synced.</p><ul><li><strong>Name:</strong> {{tenderName}}</li><li><strong>Ref No:</strong> {{refNo}}</li><li><strong>Value:</strong> {{value}}</li><li><strong>Group:</strong> {{groupClassification}}</li></ul>',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      default: null,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('NotificationRule', notificationRuleSchema);
