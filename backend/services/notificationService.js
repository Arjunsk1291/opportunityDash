import NotificationRule from '../models/NotificationRule.js';
import AuthorizedUser from '../models/AuthorizedUser.js';
import { sendMailWithRuntimeConfig } from './mailService.js';

function applyTemplate(input, tender) {
  const replacements = {
    tenderName: tender.tenderName || 'N/A',
    value: tender.opportunityValue || 0,
    refNo: tender.opportunityRefNo || 'N/A',
    groupClassification: tender.groupClassification || 'N/A',
    clientName: tender.clientName || 'N/A',
  };

  return String(input || '').replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return replacements[key] !== undefined ? String(replacements[key]) : '';
  });
}

export async function notifySvpsForNewTenders(tenders) {
  if (!Array.isArray(tenders) || tenders.length === 0) return;

  const rules = await NotificationRule.find({
    triggerEvent: 'NEW_TENDER_SYNCED',
    recipientRole: 'SVP',
    isActive: true,
  }).lean();

  if (!rules.length) return;

  for (const tender of tenders) {
    for (const rule of rules) {
      try {
        const userQuery = { role: 'SVP', status: 'approved' };
        if (rule.useGroupMatching) {
          userQuery.assignedGroup = String(tender.groupClassification || '').toUpperCase();
        }

        const recipients = await AuthorizedUser.find(userQuery).lean();
        if (!recipients.length) continue;

        const subject = applyTemplate(rule.emailSubject, tender);
        const html = applyTemplate(rule.emailBody, tender);

        for (const recipient of recipients) {
          try {
            await sendMailWithRuntimeConfig({
              to: recipient.email,
              subject,
              html,
            });
          } catch (error) {
            console.error(`Notification email failed for ${recipient.email}:`, error.code || 'UNKNOWN', error.message);
          }
        }
      } catch (error) {
        console.error('Notification processing failed for tender:', tender.opportunityRefNo, error.message);
      }
    }
  }
}
