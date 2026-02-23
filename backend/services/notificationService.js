import NotificationRule from '../models/NotificationRule.js';
import AuthorizedUser from '../models/AuthorizedUser.js';
import { sendMailWithRuntimeConfig } from './mailService.js';

function notificationDebugEnabled() {
  return String(process.env.NOTIFICATION_DEBUG || process.env.MAIL_DEBUG || '').toLowerCase() === 'true';
}

function notificationDebug(...args) {
  if (!notificationDebugEnabled()) return;
  console.log('[notification-debug]', ...args);
}

function applyTemplate(input, tender) {
  const replacements = {
    tenderName: tender.tenderName || 'N/A',
    value: tender.opportunityValue || 0,
    refNo: tender.opportunityRefNo || 'N/A',
    groupClassification: tender.groupClassification || 'N/A',
    clientName: tender.clientName || 'N/A',
    tenderType: tender.opportunityClassification || 'N/A',
    internalLead: tender.internalLead || 'N/A',
    country: tender.country || 'N/A',
    probability: tender.probability ?? 'N/A',
    avenirStatus: tender.avenirStatus || 'N/A',
    tenderResult: tender.tenderResult || 'N/A',
    submissionDate: tender.tenderSubmittedDate || tender.tenderPlannedSubmissionDate || 'N/A',
    rfpReceivedDate: tender.dateTenderReceived || tender.rawGraphData?.rfpReceivedDisplay || 'N/A',
  };

  return String(input || '').replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return replacements[key] !== undefined ? String(replacements[key]) : '';
  });
}

export async function notifySvpsForNewTenders(tenders) {
  if (!Array.isArray(tenders) || tenders.length === 0) return;

  notificationDebug('notify:start', { tenderCount: tenders.length });

  const rules = await NotificationRule.find({
    triggerEvent: 'NEW_TENDER_SYNCED',
    recipientRole: 'SVP',
    isActive: true,
  }).lean();

  if (!rules.length) return;
  notificationDebug('notify:rules-loaded', { ruleCount: rules.length });

  for (const tender of tenders) {
    for (const rule of rules) {
      try {
        const userQuery = { role: 'SVP', status: 'approved' };
        if (rule.useGroupMatching) {
          userQuery.assignedGroup = String(tender.groupClassification || '').toUpperCase();
        }

        notificationDebug('notify:rule-eval', {
          tenderRefNo: tender.opportunityRefNo || '',
          ruleId: String(rule._id || rule.id || ''),
          triggerEvent: rule.triggerEvent,
          useGroupMatching: !!rule.useGroupMatching,
          targetGroup: userQuery.assignedGroup || null,
        });

        const recipients = await AuthorizedUser.find(userQuery).lean();
        notificationDebug('notify:recipient-query-result', {
          tenderRefNo: tender.opportunityRefNo || '',
          ruleId: String(rule._id || rule.id || ''),
          recipientCount: recipients.length,
        });
        if (!recipients.length) continue;

        const subject = applyTemplate(rule.emailSubject, tender);
        const html = `<div style="font-weight:700;">${applyTemplate(rule.emailBody, tender)}</div>`;

        for (const recipient of recipients) {
          try {
            notificationDebug('notify:send-attempt', {
              tenderRefNo: tender.opportunityRefNo || '',
              ruleId: String(rule._id || rule.id || ''),
              recipient: recipient.email,
            });
            await sendMailWithRuntimeConfig({
              to: recipient.email,
              subject,
              html,
            });
            notificationDebug('notify:send-success', {
              tenderRefNo: tender.opportunityRefNo || '',
              recipient: recipient.email,
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
