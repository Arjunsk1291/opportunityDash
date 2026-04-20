import { isSubmissionWithinDays } from '@/lib/submissionDate';
import { CANONICAL_STATUS_ORDER, normalizeCanonicalStatus } from '@/lib/opportunityStatus';

export interface Opportunity {
  id: string;
  opportunityRefNo: string;
  adnocRftNo?: string;
  tenderNo: string;
  tenderName: string;
  clientName: string;
  clientType: string;
  clientLead: string;
  opportunityClassification: string;
  opportunityStatus: string;
  canonicalStage: string;
  qualificationStatus: string;
  groupClassification: string;
  domainSubGroup: string;
  internalLead: string;
  opportunityValue: number;
  opportunityValue_imputed: boolean;
  opportunityValue_imputation_reason: string;
  probability: number;
  probability_imputed: boolean;
  probability_imputation_reason: string;
  expectedValue: number;
  dateTenderReceived: string | null;
  tenderPlannedSubmissionDate: string | null;
  tenderPlannedSubmissionDate_imputed: boolean;
  tenderPlannedSubmissionDate_imputation_reason: string;
  tenderSubmittedDate: string | null;
  leadEmail?: string;
  leadEmailSource?: string;
  leadEmailAssignedBy?: string;
  leadEmailAssignedAt?: string | null;
  lastContactDate: string | null;
  lastContactDate_imputed: boolean;
  lastContactDate_imputation_reason: string;
  daysSinceTenderReceived: number;
  daysToPlannedSubmission: number;
  agedDays: number;
  willMissDeadline: boolean;
  isAtRisk: boolean;
  partnerInvolvement: boolean;
  partnerName: string;
  country: string;
  comments?: string;
  remarksReason?: string;
  tenderStatusRemark?: string;
  awardedDate?: string | null;
  awardStatus: string;
  rawSheetYear?: string;
  rawDateReceived?: unknown;
  rawSubmissionDeadline?: unknown;
  rawTenderSubmittedDate?: unknown;
  rawAvenirStatus?: string;
  rawTenderResult?: string;
  avenirStatus?: string;
  tenderResult?: string;
  postBidDetailType?: string;
  postBidDetailOther?: string;
  postBidDetailUpdatedBy?: string;
  postBidDetailUpdatedAt?: string | null;
  combinedStatuses?: string[];
  rawGraphData?: {
    year?: string;
    dateReceived?: string;
    rfpReceivedDisplay?: string;
    plannedSubmissionDisplay?: string;
    tenderSubmittedDisplay?: string;
    rowSnapshot?: Record<string, unknown>;
    [key: string]: unknown;
  };

  opportunityValueSheet?: number | null;
  opportunityValueManual?: number | null;
  opportunityValueSource?: 'sheet' | 'manual';
  opportunityValueConflict?: boolean;
}

export const STATUS_MAPPING: Record<string, string> = {
  'WORKING': 'WORKING',
  'SUBMITTED': 'SUBMITTED',
  'AWARDED': 'AWARDED',
  'LOST': 'LOST',
  'REGRETTED': 'REGRETTED',
  'TO START': 'TO START',
  'ONGOING': 'ONGOING',
  'HOLD / CLOSED': 'HOLD / CLOSED',
};

export const STAGE_ORDER = [...CANONICAL_STATUS_ORDER];

export const PROBABILITY_BY_STAGE: Record<string, number> = {
  'WORKING': 40,
  'SUBMITTED': 60,
  'AWARDED': 100,
  'LOST': 0,
  'REGRETTED': 0,
  'TO START': 10,
  'ONGOING': 80,
  'HOLD / CLOSED': 20,
};

const normalizeTenderName = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => String(value || '').trim().toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));

const getOpportunityTimestamp = (opp: Opportunity) => {
  const dateCandidates = [opp.tenderSubmittedDate, opp.dateTenderReceived, opp.tenderPlannedSubmissionDate];

  for (const candidate of dateCandidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
};

const getDedupBusinessKey = (opp: Opportunity, untitledIndex: number) => {
  const normalizedName = normalizeTenderName(opp.tenderName);
  const baseRefNo = getBaseRefNo(opp.opportunityRefNo);
  if (baseRefNo && normalizedName) return `${baseRefNo}::${normalizedName}`;
  if (baseRefNo) return baseRefNo;
  if (normalizedName) return normalizedName;
  return `__untitled__${opp.id || untitledIndex}`;
};

const normalizeComparisonText = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const hideConvertedEoiDuplicates = (data: Opportunity[]) => (
  data.filter((opp) => {
    if (!isEoiRefNo(opp.opportunityRefNo)) return true;

    const baseRefNo = normalizeComparisonText(getBaseRefNo(opp.opportunityRefNo));
    const tenderName = normalizeComparisonText(opp.tenderName);
    if (!baseRefNo || !tenderName) return true;

    const convertedTenderExists = data.some((candidate) => (
      candidate.id !== opp.id
      && !isEoiRefNo(candidate.opportunityRefNo)
      && normalizeComparisonText(candidate.opportunityRefNo) === baseRefNo
      && normalizeComparisonText(candidate.tenderName) === tenderName
      && normalizeComparisonText(candidate.opportunityClassification) === 'tender'
    ));

    return !convertedTenderExists;
  })
);

const classifyActiveTenderType = (opp: Opportunity) => {
  const type = String(opp.opportunityClassification || '').trim().toUpperCase();
  if (type === 'TENDER') return 'tender';
  if (type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo)) return 'eoi';
  return 'tender';
};

const getDedupPriority = (opp: Opportunity) => {
  const value = Number(opp.opportunityValue || 0);
  const hasMeaningfulValue = value > 0 ? 1 : 0;
  const isTenderType = String(opp.opportunityClassification || '').trim().toUpperCase() === 'TENDER' ? 1 : 0;
  const isConvertedTender = isEoiRefNo(opp.opportunityRefNo) ? 0 : 1;
  const timestamp = getOpportunityTimestamp(opp);

  return [
    hasMeaningfulValue,
    isConvertedTender,
    isTenderType,
    value,
    timestamp,
  ];
};

const shouldReplaceDedupCandidate = (candidate: Opportunity, current: Opportunity) => {
  const candidatePriority = getDedupPriority(candidate);
  const currentPriority = getDedupPriority(current);

  for (let index = 0; index < candidatePriority.length; index += 1) {
    const candidateScore = candidatePriority[index];
    const currentScore = currentPriority[index];
    if (candidateScore > currentScore) return true;
    if (candidateScore < currentScore) return false;
  }

  return false;
};

const getQuotedValueDedupedOpportunitiesInternal = (data: Opportunity[]) => {
  const uniqueTenders = new Map<string, Opportunity>();
  let untitledIndex = 0;

  data.forEach((opp) => {
    const key = getDedupBusinessKey(opp, untitledIndex++);
    const current = uniqueTenders.get(key);

    if (!current || shouldReplaceDedupCandidate(opp, current)) {
      uniqueTenders.set(key, opp);
    }
  });

  return Array.from(uniqueTenders.values());
};

export const getQuotedValueDedupedOpportunities = (data: Opportunity[]) => (
  getQuotedValueDedupedOpportunitiesInternal(data)
);

export const sumQuotedValueWithDedup = (data: Opportunity[]) => (
  getQuotedValueDedupedOpportunitiesInternal(data).reduce((sum, opp) => sum + Number(opp.opportunityValue || 0), 0)
);

export function calculateSummaryStats(data: Opportunity[]) {

  const activeOpps = data.filter(o =>
    ['WORKING', 'SUBMITTED', 'AWARDED'].includes(normalizeCanonicalStatus(o.canonicalStage))
  );
  const activeVisibleOpps = hideConvertedEoiDuplicates(activeOpps);
  const activeTenderTypeBreakdown = activeVisibleOpps.reduce((acc, opp) => {
    const type = classifyActiveTenderType(opp);
    acc[type] += 1;
    return acc;
  }, { tender: 0, eoi: 0 });
  const awardedOpps = data.filter(o => normalizeCanonicalStatus(o.canonicalStage) === 'AWARDED');
  const totalActiveValue = sumQuotedValueWithDedup(data);
  const awardedCount = awardedOpps.length;
  const awardedValue = awardedOpps.reduce((sum, o) => sum + Number(o.opportunityValue || 0), 0);

  const lostOpps = data.filter(o => normalizeCanonicalStatus(o.tenderResult) === 'LOST');
  const lostCount = lostOpps.length;
  const lostValue = lostOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const regrettedOpps = data.filter(o => normalizeCanonicalStatus(o.canonicalStage) === 'REGRETTED');
  const regrettedCount = regrettedOpps.length;
  const regrettedValue = regrettedOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const workingOpps = data.filter(o => normalizeCanonicalStatus(o.canonicalStage) === 'WORKING');
  const workingCount = workingOpps.length;
  const workingValue = workingOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const toStartOpps = data.filter(o => normalizeCanonicalStatus(o.canonicalStage) === 'TO START');
  const toStartCount = toStartOpps.length;
  const toStartValue = toStartOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const ongoingOpps = data.filter(o => normalizeCanonicalStatus(o.tenderResult) === 'ONGOING');
  const ongoingCount = ongoingOpps.length;
  const ongoingValue = ongoingOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const submissionNearOpps = data.filter((o) => isSubmissionWithinDays(o, 10));
  const submissionNearCount = submissionNearOpps.length;

  return {
    totalActive: activeOpps.length,
    activeTenderCount: activeTenderTypeBreakdown.tender,
    activeEoiCount: activeTenderTypeBreakdown.eoi,
    totalPipelineValue: totalActiveValue,
    weightedPipeline: awardedValue,
    wonCount: awardedCount,
    wonValue: awardedValue,
    lostCount: lostCount,
    lostValue: lostValue,
    regrettedCount: regrettedCount,
    regrettedValue: regrettedValue,
    atRiskCount: submissionNearCount,
    avgDaysToSubmission: 0,
    workingCount,
    workingValue,
    toStartCount,
    toStartValue,
    ongoingCount,
    ongoingValue,
    submissionNearCount,
    awardedCount,
    awardedValue,
  };
}

export function calculateFunnelData(data: Opportunity[]) {
  const stageCounts: Record<string, { count: number; value: number }> = {};
  
  STAGE_ORDER.forEach(stage => {
    stageCounts[stage] = { count: 0, value: 0 };
  });
  
  data.forEach(opp => {
    let stage = normalizeCanonicalStatus(opp.canonicalStage);
    
    if (normalizeCanonicalStatus(opp.tenderResult) === 'LOST' || normalizeCanonicalStatus(opp.tenderResult) === 'ONGOING') {
      stage = normalizeCanonicalStatus(opp.tenderResult);
    }
    
    if (stageCounts[stage]) {
      stageCounts[stage].count++;
      stageCounts[stage].value += opp.opportunityValue;
    }
  });
  
  const funnelData = STAGE_ORDER.map((stage, index) => {
    const current = stageCounts[stage];
    const previous = index > 0 ? stageCounts[STAGE_ORDER[index - 1]] : null;
    const conversionRate = previous && previous.count > 0 
      ? Math.round((current.count / previous.count) * 100) 
      : 100;
    
    return {
      stage,
      count: current.count,
      value: current.value,
      conversionRate,
    };
  });
  
  return funnelData;
}

export function getLeaderboardData(data: Opportunity[]) {
  const leadStats: Record<string, { count: number; value: number; won: number; lost: number }> = {};
  
  data.forEach(o => {
    if (!o.internalLead) return;
    
    if (!leadStats[o.internalLead]) {
      leadStats[o.internalLead] = { count: 0, value: 0, won: 0, lost: 0 };
    }
    
    leadStats[o.internalLead].count++;
    leadStats[o.internalLead].value += o.opportunityValue;
    
    if (normalizeCanonicalStatus(o.canonicalStage) === 'AWARDED') leadStats[o.internalLead].won++;
    // ✅ UPDATED: Count LOST from tenderResult, not canonicalStage
    if (normalizeCanonicalStatus(o.tenderResult) === 'LOST' || normalizeCanonicalStatus(o.canonicalStage) === 'REGRETTED') leadStats[o.internalLead].lost++;
  });
  
  return Object.entries(leadStats)
    .map(([name, stats]) => ({
      name,
      ...stats,
      winRate: stats.won + stats.lost > 0 
        ? Math.round((stats.won / (stats.won + stats.lost)) * 100) 
        : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function getClientData(data: Opportunity[]) {
  const clientStats: Record<string, { count: number; value: number }> = {};
  
  data.forEach(o => {
    const name = String(o.clientName || '').trim();
    if (!name) return;
    if (!clientStats[name]) {
      clientStats[name] = { count: 0, value: 0 };
    }
    clientStats[name].count++;
    if (normalizeCanonicalStatus(o.canonicalStage) === 'AWARDED') {
      clientStats[name].value += Number(o.opportunityValue || 0);
    }
  });
  
  return Object.entries(clientStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function calculateDataHealth(data: Opportunity[]) {
  const totalFields = data.length * 7;
  let completedFields = 0;
  let missingFieldCount = 0;
  const missingRows: Array<{ id: string; refNo: string; missingFields: string[] }> = [];
  const duplicateTenderRows: Array<{ id: string; refNo: string; tenderName: string; duplicateCount: number }> = [];
  let imputedCount = 0;
  const tenderNameGroups = new Map<string, Opportunity[]>();
  
  data.forEach(o => {
    const missing: string[] = [];

    if (!o.opportunityRefNo) missing.push('Ref No.');
    else completedFields++;

    if (!o.tenderName) missing.push('Tender Name');
    else completedFields++;

    if (!o.opportunityClassification) missing.push('Tender Type');
    else completedFields++;

    if (!o.clientName) missing.push('Client');
    else completedFields++;

    if (!o.groupClassification) missing.push('Group');
    else completedFields++;

    const hasRfpReceived = Boolean(o.dateTenderReceived || o.rawGraphData?.rfpReceivedDisplay);
    if (!hasRfpReceived) missing.push('RFP Received');
    else completedFields++;

    if (!o.tenderPlannedSubmissionDate) {
      missing.push('Submission');
    } else {
      completedFields++;
    }

    if (o.opportunityValue_imputed) imputedCount++;
    if (o.probability_imputed) imputedCount++;
    if (o.tenderPlannedSubmissionDate_imputed) imputedCount++;
    if (o.lastContactDate_imputed) imputedCount++;

    const tenderKey = normalizeTenderName(o.tenderName);
    if (tenderKey) {
      if (!tenderNameGroups.has(tenderKey)) tenderNameGroups.set(tenderKey, []);
      tenderNameGroups.get(tenderKey)!.push(o);
    }
    
    if (missing.length > 0) {
      missingFieldCount += missing.length;
      missingRows.push({ id: o.id, refNo: o.opportunityRefNo, missingFields: missing });
    }
  });

  tenderNameGroups.forEach((rows) => {
    if (rows.length < 2) return;
    const latest = [...rows].sort((a, b) => getOpportunityTimestamp(b) - getOpportunityTimestamp(a))[0];
    duplicateTenderRows.push({
      id: latest.id,
      refNo: latest.opportunityRefNo,
      tenderName: latest.tenderName,
      duplicateCount: rows.length,
    });
  });
  
  return {
    healthScore: totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 100,
    missingRows: missingRows.slice(0, 20),
    duplicateTenderRows: duplicateTenderRows
      .sort((a, b) => b.duplicateCount - a.duplicateCount || a.tenderName.localeCompare(b.tenderName))
      .slice(0, 20),
    missingFieldCount,
    imputedCount,
    totalRecords: data.length,
    completeRecords: data.length - missingRows.length,
    duplicateTenderCount: duplicateTenderRows.length,
  };
}

export const GROUP_CLASSIFICATIONS = [
  'GES',
  'GDS',
  'GTS',
];

export const OPPORTUNITY_STATUSES = [
  'WORKING',
  'SUBMITTED',
  'AWARDED',
  'LOST',
  'REGRETTED',
  'TO START',
  'ONGOING',
  'HOLD / CLOSED',
];

export const CLIENT_TYPES = [
  'Government',
  'Private',
  'Semi-Government',
  'Other',
];

export const QUALIFICATION_STATUSES = [
  'Qualified',
  'Not Qualified',
  'Under Review',
  'Pending',
];
