import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    serviceEmail: { type: String, default: '' },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    encryptedPassword: { type: String, default: '' },
    tenantId: { type: String, default: '' },
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    serviceUsername: { type: String, default: '' },

    telecastGraphAuthMode: { type: String, enum: ['application', 'delegated'], default: 'application' },
    telecastGraphAccountUsername: { type: String, default: '' },
    telecastGraphRefreshTokenEnc: { type: String, default: '' },
    telecastGraphTokenUpdatedAt: { type: Date, default: null },
    graphRefreshTokenEnc: { type: String, default: '' },
    mailAccessTokenEnc: { type: String, default: '' },
    mailRefreshTokenEnc: { type: String, default: '' },
    mailTokenExpiresAt: { type: Date, default: null },
    graphTokenUpdatedAt: { type: Date, default: null },
    notificationRowSignatures: { type: [String], default: [] },
    notificationLastCheckedAt: { type: Date, default: null },
    notificationLastNewRowsCount: { type: Number, default: 0 },
    notificationLastNewRows: { type: [String], default: [] },
    notificationLastNewRowsPreview: { type: [Object], default: [] },
    telecastLastEligibleRowsPreview: { type: [Object], default: [] },
    telecastAlertedKeys: { type: [String], default: [] },
    telecastAlertedRefNos: { type: [String], default: [] },
    telecastAlertSeededAt: { type: Date, default: null },
    telecastAlertSeededCount: { type: Number, default: 0 },
    telecastTemplateSubject: { type: String, default: 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}' },
    telecastTemplateBody: { type: String, default: 'A new tender row was detected.\nRef: {{TENDER_NO}}\nTender: {{TENDER_NAME}}\nClient: {{CLIENT}}\nGroup: {{GROUP}}\nType: {{TENDER_TYPE}}\nDate Received: {{DATE_TENDER_RECD}}\nValue: {{VALUE}}' },
    telecastGroupRecipients: {
      type: Object,
      default: {
        GES: [],
        GDS: [],
        GTS: [],
      },
    },
    telecastKeywordHelp: { type: [String], default: [] },
    telecastWeeklyStats: {
      type: [
        {
          weekKey: { type: String },
          startDate: { type: String },
          endDate: { type: String },
          newRowsCount: { type: Number, default: 0 },
          byGroup: { type: Object, default: {} },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    pageRoleAccess: { type: Object, default: {} },
    lastUpdatedBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('SystemConfig', systemConfigSchema);
