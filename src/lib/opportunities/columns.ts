export type OpportunityColumnType =
  | 'string'
  | 'number'
  | 'date'
  | 'text'
  | 'enum'
  | 'percent';

export type OpportunityColumnGroup =
  | 'Identification'
  | 'Client & Scope'
  | 'Timeline'
  | 'Status'
  | 'Commercials'
  | 'Award';

export type OpportunityColumnDescriptor = {
  key: string;
  header: string;
  type: OpportunityColumnType;
  group: OpportunityColumnGroup;
  readOnly?: boolean;
  computed?: boolean;
};

export const OPPORTUNITY_COLUMNS: OpportunityColumnDescriptor[] = [
  { key: 'Sr.no', header: 'Sr.no', type: 'number', group: 'Identification', readOnly: true, computed: true },
  { key: 'rawSheetYear', header: 'Year', type: 'number', group: 'Identification' },
  { key: 'opportunityRefNo', header: 'Tender no', type: 'string', group: 'Identification' },
  { key: 'tenderName', header: 'Tender name', type: 'string', group: 'Identification' },
  { key: 'clientName', header: 'Client', type: 'string', group: 'Client & Scope' },
  { key: 'END USER', header: 'END USER', type: 'string', group: 'Client & Scope' },
  { key: 'adnocRftNo', header: 'ADNOC RFT NO', type: 'string', group: 'Identification' },
  { key: 'Tender Location (Execution)', header: 'Tender Location (Execution)', type: 'string', group: 'Client & Scope' },
  { key: 'groupClassification', header: 'GDS/GES', type: 'enum', group: 'Client & Scope' },
  { key: 'internalLead', header: 'Assigned Person', type: 'string', group: 'Client & Scope' },
  { key: 'Stage of project, Concept, FEED, DE', header: 'Stage of project, Concept, FEED, DE', type: 'enum', group: 'Client & Scope' },
  { key: 'opportunityClassification', header: 'Tender Type', type: 'string', group: 'Client & Scope' },
  { key: 'dateTenderReceived', header: 'date tender recd', type: 'date', group: 'Timeline' },
  { key: 'BID / NO BID DECISION', header: 'BID / NO BID DECISION', type: 'enum', group: 'Timeline' },
  { key: 'tenderPlannedSubmissionDate', header: 'Tender Due  date', type: 'date', group: 'Timeline' },
  { key: 'tenderSubmittedDate', header: 'Tender  Submitted  date', type: 'date', group: 'Timeline' },
  { key: 'avenirStatus', header: 'AVENIR STATUS', type: 'enum', group: 'Status' },
  { key: 'remarksReason', header: 'REMARKS/REASON', type: 'text', group: 'Status' },
  { key: 'tenderResult', header: 'TENDER RESULT', type: 'string', group: 'Status' },
  { key: 'tenderStatusRemark', header: 'TENDER STATUS', type: 'enum', group: 'Status' },
  { key: 'Currency, USD/AED', header: 'Currency, USD/AED', type: 'enum', group: 'Commercials' },
  { key: 'GM%', header: 'GM%', type: 'percent', group: 'Commercials' },
  { key: 'opportunityValue', header: 'Tender value', type: 'number', group: 'Commercials' },
  { key: 'Sub-contract value', header: 'Sub-contract value', type: 'number', group: 'Commercials' },
  { key: 'GM Value', header: 'GM Value', type: 'number', group: 'Commercials', readOnly: true, computed: true },
  { key: 'Go%', header: 'Go%', type: 'percent', group: 'Commercials' },
  { key: 'Get %', header: 'Get %', type: 'percent', group: 'Commercials' },
  { key: 'GO/Get %', header: 'GO/Get %', type: 'percent', group: 'Commercials', readOnly: true, computed: true },
  { key: 'go/get value', header: 'go/get value', type: 'number', group: 'Commercials', readOnly: true, computed: true },
  { key: 'USD to AED', header: 'USD to AED', type: 'number', group: 'Commercials', readOnly: true, computed: true },
  { key: 'who was awarded the project', header: 'who was awarded the project', type: 'string', group: 'Award' },
  { key: 'final awarded price', header: 'final awarded price', type: 'number', group: 'Award' },
];

export const OPPORTUNITY_COLUMN_HEADERS = OPPORTUNITY_COLUMNS.map((column) => column.header);

export const OPPORTUNITY_COLUMN_BY_KEY = new Map(OPPORTUNITY_COLUMNS.map((column) => [column.key, column] as const));

export const OPPORTUNITY_COLUMNS_BY_GROUP = OPPORTUNITY_COLUMNS.reduce<Record<OpportunityColumnGroup, OpportunityColumnDescriptor[]>>(
  (acc, column) => {
    acc[column.group].push(column);
    return acc;
  },
  {
    Identification: [],
    'Client & Scope': [],
    Timeline: [],
    Status: [],
    Commercials: [],
    Award: [],
  },
);

export const OPPORTUNITY_EDITABLE_COLUMNS = OPPORTUNITY_COLUMNS.filter((column) => !column.readOnly);
