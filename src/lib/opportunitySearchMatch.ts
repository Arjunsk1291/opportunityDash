import type { Opportunity } from '@/data/opportunityData';

export type OpportunitySearchMatchInfo = {
  matched: boolean;
  columns: string[];
};

const normalize = (value: unknown): string => String(value ?? '').toLowerCase();

const extractRowSnapshotText = (opp: Opportunity): string => {
  const snapshot = opp.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  return Object.values(snapshot as Record<string, unknown>).map((value) => String(value ?? '')).join(' ');
};

export function buildOpportunitySearchText(opportunity: Opportunity, options?: { approvalStatus?: string }): string {
  const approvalValue = String(options?.approvalStatus || '');
  const snapshotText = extractRowSnapshotText(opportunity);
  return [
    opportunity.opportunityRefNo,
    opportunity.tenderNo,
    opportunity.tenderName,
    opportunity.opportunityClassification,
    opportunity.clientName,
    opportunity.groupClassification,
    opportunity.awardedDate,
    opportunity.dateTenderReceived,
    opportunity.tenderPlannedSubmissionDate,
    opportunity.tenderSubmittedDate,
    opportunity.internalLead,
    opportunity.opportunityValue,
    opportunity.avenirStatus,
    opportunity.tenderResult,
    opportunity.tenderStatusRemark,
    opportunity.remarksReason,
    opportunity.comments,
    opportunity.adnocRftNo,
    snapshotText,
    approvalValue,
  ].map((value) => normalize(value)).join(' ');
}

export function getSearchMatchInfo(opportunity: Opportunity, searchText: string): OpportunitySearchMatchInfo {
  const query = String(searchText || '').trim().toLowerCase();
  if (!query) return { matched: true, columns: [] };

  const candidates: Array<{ label: string; value: string }> = [
    { label: 'Ref No', value: String(opportunity.opportunityRefNo ?? '') },
    { label: 'Tender No', value: String(opportunity.tenderNo ?? '') },
    { label: 'Tender Name', value: String(opportunity.tenderName ?? '') },
    { label: 'Classification', value: String(opportunity.opportunityClassification ?? '') },
    { label: 'Client', value: String(opportunity.clientName ?? '') },
    { label: 'Vertical', value: String(opportunity.groupClassification ?? '') },
    { label: 'Awarded Date', value: String(opportunity.awardedDate ?? '') },
    { label: 'Date Tender Received', value: String(opportunity.dateTenderReceived ?? '') },
    { label: 'Planned Submission Date', value: String(opportunity.tenderPlannedSubmissionDate ?? '') },
    { label: 'Submitted Date', value: String(opportunity.tenderSubmittedDate ?? '') },
    { label: 'Lead', value: String(opportunity.internalLead ?? '') },
    { label: 'Value', value: String(opportunity.opportunityValue ?? '') },
    { label: 'Status', value: String(opportunity.avenirStatus ?? '') },
    { label: 'Result', value: String(opportunity.tenderResult ?? '') },
    { label: 'Tender Status', value: String(opportunity.tenderStatusRemark ?? '') },
    { label: 'Remarks/Reason', value: String(opportunity.remarksReason ?? '') },
    { label: 'Comments', value: String(opportunity.comments ?? '') },
    { label: 'ADNOC RFT NO', value: String(opportunity.adnocRftNo ?? '') },
    { label: 'Who was awarded the project', value: String((opportunity.rawGraphData?.rowSnapshot as Record<string, unknown> | undefined)?.['who was awarded the project'] ?? '') },
    { label: 'Final awarded price', value: String((opportunity.rawGraphData?.rowSnapshot as Record<string, unknown> | undefined)?.['final awarded price'] ?? '') },
    { label: 'Sheet Row (snapshot)', value: extractRowSnapshotText(opportunity) },
  ];

  const matchedColumns = candidates
    .filter((candidate) => normalize(candidate.value).includes(query))
    .map((candidate) => candidate.label);

  return { matched: matchedColumns.length > 0, columns: matchedColumns };
}
