export interface Opportunity {
  id: string;
  opportunityRefNo: string;
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
  awardStatus: string;
  avenirStatus?: string;
  tenderResult?: string;
  combinedStatuses?: string[];
  rawGraphData?: {
    year?: string;
    dateReceived?: string;
    rfpReceivedDisplay?: string;
    rowSnapshot?: Record<string, unknown>;
    [key: string]: unknown;
  };
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

export const STAGE_ORDER = ['WORKING', 'SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'TO START', 'ONGOING', 'HOLD / CLOSED'];

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

export function calculateSummaryStats(data: Opportunity[]) {
  const isSubmissionNear = (receivedDate: string | null): boolean => {
    if (!receivedDate) return false;
    
    const received = new Date(receivedDate);
    const today = new Date();
    const oneWeekAfterReceived = new Date(received);
    oneWeekAfterReceived.setDate(received.getDate() + 7);
    
    const diffDays = Math.ceil((oneWeekAfterReceived.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  };

  const activeOpps = data.filter(o => 
    ['WORKING', 'SUBMITTED', 'AWARDED'].includes(o.canonicalStage)
  );
  const awardedOpps = data.filter(o => o.canonicalStage === 'AWARDED');
  const totalActiveValue = awardedOpps.reduce((sum, o) => sum + o.opportunityValue, 0);
  const awardedCount = awardedOpps.length;
  const awardedValue = totalActiveValue;

  const lostOpps = data.filter(o => o.tenderResult === 'LOST');
  const lostCount = lostOpps.length;
  const lostValue = lostOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const regrettedOpps = data.filter(o => o.canonicalStage === 'REGRETTED');
  const regrettedCount = regrettedOpps.length;
  const regrettedValue = regrettedOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const workingOpps = data.filter(o => o.canonicalStage === 'WORKING');
  const workingCount = workingOpps.length;
  const workingValue = workingOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const toStartOpps = data.filter(o => o.canonicalStage === 'TO START');
  const toStartCount = toStartOpps.length;
  const toStartValue = toStartOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const ongoingOpps = data.filter(o => o.tenderResult === 'ONGOING');
  const ongoingCount = ongoingOpps.length;
  const ongoingValue = ongoingOpps.reduce((sum, o) => sum + o.opportunityValue, 0);

  const submissionNearOpps = data.filter(o => isSubmissionNear(o.dateTenderReceived));
  const submissionNearCount = submissionNearOpps.length;

  return {
    totalActive: activeOpps.length,
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
    let stage = opp.canonicalStage;
    
    if (opp.tenderResult === 'LOST' || opp.tenderResult === 'ONGOING') {
      stage = opp.tenderResult;
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
    
    if (o.canonicalStage === 'AWARDED') leadStats[o.internalLead].won++;
    // ✅ UPDATED: Count LOST from tenderResult, not canonicalStage
    if (o.tenderResult === 'LOST' || o.canonicalStage === 'REGRETTED') leadStats[o.internalLead].lost++;
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
    if (!clientStats[o.clientName]) {
      clientStats[o.clientName] = { count: 0, value: 0 };
    }
    clientStats[o.clientName].count++;
    clientStats[o.clientName].value += o.opportunityValue;
  });
  
  return Object.entries(clientStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function calculateDataHealth(data: Opportunity[]) {
  const mandatoryFields = ['internalLead', 'opportunityValue', 'tenderPlannedSubmissionDate'];
  let totalFields = data.length * mandatoryFields.length;
  let completedFields = 0;
  const missingRows: Array<{ id: string; refNo: string; missingFields: string[] }> = [];
  
  data.forEach(o => {
    const missing: string[] = [];
    
    if (!o.internalLead) missing.push('Internal Lead');
    else completedFields++;
    
    if (o.opportunityValue === 0) missing.push('Opportunity Value');
    else completedFields++;
    
    if (!o.tenderPlannedSubmissionDate) {
      missing.push('Planned Submission Date');
    } else {
      completedFields++;
    }
    
    if (missing.length > 0) {
      missingRows.push({ id: o.id, refNo: o.opportunityRefNo, missingFields: missing });
    }
  });
  
  return {
    healthScore: Math.round((completedFields / totalFields) * 100),
    missingRows: missingRows.slice(0, 20),
    imputedCount: 0,
  };
}

export const GROUP_CLASSIFICATIONS = [
  'GES',
  'GDS', 
  'GTN',
  'GTS',
  'General',
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
