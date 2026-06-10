import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock, Users, Trash2, CheckCircle, XCircle, Clock, RefreshCw, Download, Database, Send, Cpu, HardDrive, Server, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_PAGE_ROLE_ACCESS, PAGE_GROUPS, PAGE_LABELS, PageKey } from '@/config/navigation';
import { UserRole } from '@/contexts/AuthContext';
import { ACTION_DESCRIPTIONS, ACTION_LABELS, ActionKey, DEFAULT_ACTION_ROLE_ACCESS } from '@/config/actionPermissions';
import { RecipientBlockSelector } from '@/components/Admin/RecipientBlockSelector';
import defaultExportLogo from '@/assets/avenir-logo.png';
import { DEFAULT_EXPORT_TEMPLATE, ExportTemplateConfig, normalizeExportTemplate } from '@/lib/exportTemplate';
import { ExportTemplateSpreadsheet } from '@/components/Admin/ExportTemplateSpreadsheet';
import { downloadWorkbook, getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToObjects } from '@/lib/excelWorkbook';
import { UserMultiEmailPicker } from '@/components/Admin/UserMultiEmailPicker';
import { PermissionsPanel } from '@/components/Admin/PermissionsPanel';
import { diag } from '@/lib/diagnostics';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { statusConsole } from '@/lib/statusConsole';
import { UsersPanel } from '@/components/Admin/UsersPanel';
import { TempAccessPanel } from '@/components/Admin/TempAccessPanel';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ROLE_OPTIONS: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];
const GROUP_OPTIONS = ['GES', 'GDS', 'GTS'] as const;

const DEFAULT_SERVICE_ACCOUNT = (import.meta.env.VITE_DEFAULT_SERVICE_ACCOUNT || import.meta.env.VITE_DEFAULT_MASTER_USERNAME || 'tender-notify@avenirengineering.com').toLowerCase();

function parseApiErrorPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const data = payload as { error?: string; message?: string; code?: string; troubleshooting?: string[]; details?: { troubleshooting?: string[] } };
  const base = data.message || data.error || fallback;
  const codePart = data.code ? ` [${data.code}]` : '';
  const troubleshooting = Array.isArray(data.troubleshooting)
    ? data.troubleshooting
    : Array.isArray(data.details?.troubleshooting)
      ? data.details?.troubleshooting
      : [];
  const tips = troubleshooting?.length ? ` | Tips: ${troubleshooting.join(' | ')}` : '';
  return `${base}${codePart}${tips}`;
}

interface AuthorizedUser {
  _id: string;
  email: string;
  role: 'Master' | 'Admin' | 'ProposalHead' | 'SVP' | 'BDTeam' | 'Basic' | 'TempUser' | 'MASTER' | 'PROPOSAL_HEAD';
  assignedGroup?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  lastLogin?: Date;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  tempAccessExpiresAt?: string | null;
}

interface LeadEmailSuggestion {
  leadName: string;
  leadNameKey: string;
  tenderCount: number;
  tenders: Array<{ refNo: string; tenderName: string }>;
  suggestedEmail: string;
  score: number;
}

interface LeadEmailAssigned {
  leadName: string;
  leadNameKey?: string;
  leadEmail: string;
  count: number;
  tenders: Array<{ refNo: string; tenderName: string }>;
}

interface CollectionStats {
  totalTenders: number;
  totalValue: number;
  lastSync?: Date;
  statusDistribution: Record<string, number>;
}

interface GraphConfig {
  id?: string;
  shareLink: string;
  driveId: string;
  fileId: string;
  worksheetName: string;
  dataRange: string;
  headerRowOffset: number;
  syncIntervalMinutes: number;
  fieldMapping?: Record<string, string | string[]>;
  lastResolvedAt?: string;
  lastSyncAt?: string;
}

interface GraphAuthStatus {
  authMode: 'application' | 'delegated';
  accountUsername: string;
  hasRefreshToken: boolean;
  tokenUpdatedAt?: string | null;
}

interface TelecastAuthStatus {
  authMode: 'application' | 'delegated';
  accountUsername: string;
  hasRefreshToken: boolean;
  tokenUpdatedAt?: string | null;
  appConfigured?: boolean;
  senderConfigured?: boolean;
  senderEmail?: string;
}

interface TelecastTemplateStyle {
  key: string;
  label: string;
  description: string;
  colors: {
    pageBg: string;
    cardBorder: string;
    headerGradient: string;
    summaryBg: string;
    summaryBorder: string;
    summaryText: string;
    tableHeaderBg: string;
    tableHeaderText: string;
    tableRowAlt: string;
  };
}

interface WeeklyTelecastStat {
  weekKey: string;
  startDate: string;
  endDate: string;
  newRowsCount: number;
  byGroup?: Record<string, number>;
}

interface NotificationRowPreview {
  signature?: string;
  tenderNo?: string;
  tenderName?: string;
  client?: string;
  group?: string;
  type?: string;
  dateTenderReceived?: string;
  value?: number | null;
}

interface NotificationSyncStatus {
  lastCheckedAt?: string | null;
  lastNewRowsCount: number;
  trackedRows: number;
  alertWindowDays?: number;
  alertSeededAt?: string | null;
  alertSeededCount?: number;
  alertedKeysTracked?: number;
  alertedRefNosTracked?: number;
  alertedRefNosPreview?: string[];
  weeklyStats?: WeeklyTelecastStat[];
  lastNewRowsPreview?: NotificationRowPreview[];
  telecastEligibleRowsPreview?: NotificationRowPreview[];
}

interface ManualUpdateSummary {
  receivedRows: number;
  matchedRows: number;
  manualDocsUpdated: number;
  syncedRowsPatched: number;
}

interface TempCredentialLogRow {
  _id: string;
  createdBy: string;
  createdByRole: string;
  targetEmails: string[];
  tempPasswords?: string[];
  sentCount: number;
  sentAt: string;
  expiresAt: string;
}

interface AuthDiagnosticLogRow {
  _id: string;
  email?: string;
  route: string;
  method: string;
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
}

interface LiveActionStatus {
  name: string;
  percent: number;
  detail: string;
  startedAt: number;
}

interface SystemConfigMeta {
  systemConfigUpdatedAt: string | null;
  systemConfigUpdatedBy: string | null;
  systemConfigFingerprint: string | null;
}

interface SystemHealthSnapshot {
  status: 'ok' | 'warning' | 'critical';
  platform?: string;
  hostname?: string;
  arch?: string;
  nodeVersion?: string;
  uptimeSeconds?: number;
  uptimeHuman?: string;
  loadAverage?: number[];
  memory?: {
    totalBytes?: number;
    freeBytes?: number;
    usedBytes?: number;
    usedPercent?: number | null;
    processRssBytes?: number;
    processHeapUsedBytes?: number;
    processHeapTotalBytes?: number;
    processExternalBytes?: number;
    processArrayBuffersBytes?: number;
    processHeapPercent?: number | null;
  };
  disk?: {
    path?: string;
    totalBytes?: number;
    freeBytes?: number;
    usedBytes?: number;
    usedPercent?: number | null;
  } | null;
  temperature?: {
    celsius?: number | null;
    source?: string | null;
  };
}

interface BackendHealthSnapshot {
  ok: boolean;
  dbState: number;
  timestamp?: string;
  system?: SystemHealthSnapshot;
  dbPingMs?: number | null;
  responseMs?: number;
}

interface AdminBootstrapResponse {
  success: boolean;
  backendHealth?: {
    ok: boolean;
    dbState: number;
    timestamp?: string;
    system?: SystemHealthSnapshot;
  };
  users?: AuthorizedUser[];
  collectionStats?: CollectionStats;
  graphConfig?: Partial<GraphConfig>;
  graphAuthStatus?: GraphAuthStatus;
  consentUrl?: string;
  postBidConfig?: {
    success?: boolean;
    allowedEmails?: string[];
    canEdit?: boolean;
  };
  telecastConfig?: {
    templateSubject?: string;
    templateBody?: string;
    templateStyle?: string;
    approvalAlertEnabled?: boolean;
    approvalTemplateSubject?: string;
    approvalTemplateBody?: string;
    approvalTemplateStyle?: string;
    deadlineAlertEnabled?: boolean;
    deadlineTemplateSubject?: string;
    deadlineTemplateBody?: string;
    deadlineTemplateStyle?: string;
    deadlineAlertClients?: string[];
    telecastSendDelayMinutes?: number;
    templateStyles?: TelecastTemplateStyle[];
    groupRecipients?: Record<'GES' | 'GDS' | 'GTS', string[]>;
    keywords?: string[];
    weeklyStats?: WeeklyTelecastStat[];
  };
  eoiDuplicateConfig?: {
    showConvertedEoiRowsDefault?: boolean;
  };
  reportingConfig?: {
    templateStyle?: string;
    templateStyles?: TelecastTemplateStyle[];
  };
  exportTemplateConfig?: Partial<ExportTemplateConfig>;
  navigationPermissions?: {
    permissions?: Record<PageKey, UserRole[]>;
    excludePermissions?: Record<PageKey, UserRole[]>;
    emailPermissions?: Record<PageKey, string[]>;
  } | null;
  actionPermissions?: {
    permissions?: Record<ActionKey, UserRole[]>;
    emailPermissions?: Record<ActionKey, string[]>;
  } | null;
  worksheets?: Array<{ id: string; name: string }>;
  notificationStatus?: NotificationSyncStatus | null;
  errors?: Array<{ key: string; message: string }>;
}

const EXPORT_TEMPLATE_PREVIEW_HEADERS = ['Avenir Ref', 'Tender Name', 'Client', 'Status', 'RFP Received'];
const EXPORT_TEMPLATE_PREVIEW_ROW = ['AC26144', 'HSE MONITORING SYSTEM', 'L&T', 'Submitted', '2026-04-07'];
const EXPORT_PREVIEW_GRID_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const EXPORT_PREVIEW_GRID_ROWS = Array.from({ length: 12 }, (_, index) => index + 1);
const EXPORT_DESIGNER_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const EXPORT_DESIGNER_ROWS = Array.from({ length: 20 }, (_, index) => index + 1);
const EXPORT_BLOCK_OPTIONS = [
  { key: 'title', label: 'Title' },
  { key: 'intro', label: 'Intro' },
  { key: 'logo', label: 'Logo' },
  { key: 'header', label: 'Header Row' },
] as const;
const MANUAL_UPDATE_TEMPLATE_COLUMNS = [
  { key: 'opportunityRefNo', label: 'Avenir Ref', required: true, help: 'Required unique row key used to map into MongoDB.' },
  { key: 'adnocRftNo', label: 'CLIENT Ref', required: false, help: 'Client or ADNOC reference number.' },
  { key: 'tenderName', label: 'Tender Name', required: false, help: 'Tender or opportunity name.' },
  { key: 'opportunityClassification', label: 'Tender Type', required: false, help: 'Use EOI or Tender.' },
  { key: 'clientName', label: 'Client', required: false, help: 'Client name override.' },
  { key: 'opportunityValue', label: 'Value (AED)', required: false, help: 'Numeric value in AED.' },
  { key: 'dateTenderReceived', label: 'RFP Received', required: false, help: 'Proper date preferred, year-only also allowed.' },
  { key: 'tenderPlannedSubmissionDate', label: 'Submission', required: false, help: 'Proper date preferred, year-only also allowed.' },
] as const;
const DEFAULT_MANUAL_TEMPLATE_SELECTION = MANUAL_UPDATE_TEMPLATE_COLUMNS.reduce<Record<string, boolean>>((acc, column) => {
  acc[column.key] = column.required || ['adnocRftNo', 'dateTenderReceived', 'tenderPlannedSubmissionDate'].includes(column.key);
  return acc;
}, {});

const DEFAULT_TELECAST_TEMPLATE_STYLE: TelecastTemplateStyle = {
  key: 'avenir_blue',
  label: 'Avenir Blue',
  description: 'Deep navy header with blue summary styling.',
  colors: {
    pageBg: '#f8fafc',
    cardBorder: '#dbeafe',
    headerGradient: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%)',
    summaryBg: '#eff6ff',
    summaryBorder: '#bfdbfe',
    summaryText: '#1e3a8a',
    tableHeaderBg: '#f8fafc',
    tableHeaderText: '#475569',
    tableRowAlt: '#f8fafc',
  },
};

const SAMPLE_TELECAST_VALUES = {
  TENDER_NO: 'AVR-TEST-368',
  TENDER_NAME: 'District Cooling Plant Expansion',
  CLIENT: 'Avenir Demo Client',
  GROUP: 'GDS',
  TENDER_TYPE: 'Proposal',
  DATE_TENDER_RECD: '2026-03-11',
  SUBMISSION_DATE: '2026-03-18',
  YEAR: '2026',
  LEAD: 'arjun.s@avenirengineering.com',
  OPPORTUNITY_ID: 'telecast-preview',
  COMMENTS: 'Sample values inserted for preview.',
};

const DEADLINE_TEMPLATE_PRESETS = [
  {
    key: 'concise',
    label: 'Concise Reminder',
    subject: 'Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}',
    body: 'Quick reminder that {{TENDER_NAME}} ({{TENDER_NO}}) is due tomorrow ({{SUBMISSION_DATE}}) for {{CLIENT}}.',
    style: 'sunset_alert',
  },
  {
    key: 'action',
    label: 'Action Required',
    subject: 'Action Required: {{TENDER_NAME}} Due {{SUBMISSION_DATE}}',
    body: 'Please finalize submission for {{CLIENT}}. Tender {{TENDER_NO}} is due on {{SUBMISSION_DATE}}. Reply with any blockers.',
    style: 'emerald_signal',
  },
  {
    key: 'ops',
    label: 'Ops Snapshot',
    subject: 'Submission Due Tomorrow: {{TENDER_NO}}',
    body: 'Upcoming deadline alert for {{TENDER_NAME}} ({{TENDER_NO}}). Client: {{CLIENT}}. Due: {{SUBMISSION_DATE}}.',
    style: 'avenir_blue',
  },
];
const MAX_MANUAL_UPDATE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_MANUAL_UPDATE_ROWS = 5000;

const renderTemplatePreview = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((output, [key, value]) => output.split(`{{${key}}}`).join(value), String(template || ''));

interface AdminProps {
  initialTab?: string;
}

export default function Admin({ initialTab }: AdminProps = {}) {
  const {
    user,
    isMaster,
    token,
    pagePermissions,
    pageExcludePermissions,
    pageEmailPermissions,
    updatePagePermissions,
    reloadPagePermissions,
    canAccessPage,
    actionPermissions,
    actionEmailPermissions,
    updateActionPermissions,
    reloadActionPermissions,
    canPerformAction,
  } = useAuth();
  const canAccessPanel = isMaster || user?.role === 'Admin';
  const navigate = useNavigate();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const { status: trackedStatus, run: runTrackedAction } = useTrackedAction();
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);
  const [graphConfig, setGraphConfig] = useState<GraphConfig>({
    shareLink: '',
    driveId: '',
    fileId: '',
    worksheetName: '',
    dataRange: '',
    headerRowOffset: 0,
    syncIntervalMinutes: 10,
    fieldMapping: {},
  });
  const [worksheets, setWorksheets] = useState<Array<{ id: string; name: string }>>([]);
  const [mappingText, setMappingText] = useState('{}');
  const [configSaving, setConfigSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [graphAuthStatus, setGraphAuthStatus] = useState<GraphAuthStatus>({
    authMode: 'application',
    accountUsername: '',
    hasRefreshToken: false,
  });
  const [telecastAuthStatus, setTelecastAuthStatus] = useState<TelecastAuthStatus>({
    authMode: 'application',
    accountUsername: '',
    hasRefreshToken: false,
    appConfigured: false,
    senderConfigured: false,
    senderEmail: '',
  });
  const [notificationSyncStatus, setNotificationSyncStatus] = useState<NotificationSyncStatus>({
    lastCheckedAt: null,
    lastNewRowsCount: 0,
    trackedRows: 0,
    alertWindowDays: 28,
    alertSeededAt: null,
    alertSeededCount: 0,
    alertedKeysTracked: 0,
    alertedRefNosTracked: 0,
    alertedRefNosPreview: [],
    lastNewRowsPreview: [],
    telecastEligibleRowsPreview: [],
  });
  const [bootstrapUsername, setBootstrapUsername] = useState(DEFAULT_SERVICE_ACCOUNT);
  const [bootstrapPassword, setBootstrapPassword] = useState(DEFAULT_SERVICE_ACCOUNT);
  const [consentUrl, setConsentUrl] = useState('');
  const [telecastRecipientEmail, setTelecastRecipientEmail] = useState('');
  const [telecastUsername, setTelecastUsername] = useState(DEFAULT_SERVICE_ACCOUNT);
  const [telecastPassword, setTelecastPassword] = useState('');
  const [telecastDeviceCode, setTelecastDeviceCode] = useState('');
  const [telecastUserCode, setTelecastUserCode] = useState('');
  const [telecastVerificationUri, setTelecastVerificationUri] = useState('');
  const [telecastSending, setTelecastSending] = useState(false);
  const [reportingTemplateSending, setReportingTemplateSending] = useState(false);
  const [telecastTemplateSubject, setTelecastTemplateSubject] = useState('New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [telecastTemplateBody, setTelecastTemplateBody] = useState('A new tender row was detected for {{CLIENT}} in {{GROUP}}.');
  const [telecastTemplateStyle, setTelecastTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [telecastTemplateStyles, setTelecastTemplateStyles] = useState<TelecastTemplateStyle[]>([DEFAULT_TELECAST_TEMPLATE_STYLE]);
  const [telecastSendDelayMinutes, setTelecastSendDelayMinutes] = useState(10);
  const [approvalAlertEnabled, setApprovalAlertEnabled] = useState(false);
  const [approvalTemplateSubject, setApprovalTemplateSubject] = useState('Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [approvalTemplateBody, setApprovalTemplateBody] = useState('A tender has been approved by the Tender Manager and is ready for SVP review.');
  const [approvalTemplateStyle, setApprovalTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [awardAlertEnabled, setAwardAlertEnabled] = useState(false);
  const [awardTemplateSubject, setAwardTemplateSubject] = useState('Awarded: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [awardTemplateBody, setAwardTemplateBody] = useState('Tender {{TENDER_NAME}} has transitioned to AWARDED for {{CLIENT}}.');
  const [awardTemplateStyle, setAwardTemplateStyle] = useState('emerald_signal');
  const [awardRoleRecipients, setAwardRoleRecipients] = useState<string[]>(['Master', 'Admin']);
  const [awardGroupRecipients, setAwardGroupRecipients] = useState<Record<'GES' | 'GDS' | 'GTS', string[]>>({ GES: [], GDS: [], GTS: [] });
  const [approvalTemplateSending, setApprovalTemplateSending] = useState(false);
  // F7 — TL assignment alert
  const [tlAssignAlertEnabled, setTlAssignAlertEnabled] = useState(false);
  const [tlAssignTemplateSubject, setTlAssignTemplateSubject] = useState('Action Required: TL Assignment for Awarded Tenders — {{GROUP}}');
  const [tlAssignTemplateBody, setTlAssignTemplateBody] = useState('Please assign a Team Lead for the following newly awarded tenders in your vertical.');
  const [tlAssignSeededAt, setTlAssignSeededAt] = useState<string | null>(null);
  // F27 — PM assignment alert
  const [pmAssignAlertEnabled, setPmAssignAlertEnabled] = useState(false);
  const [pmAssignTemplateSubject, setPmAssignTemplateSubject] = useState('Action Required: PM Assignment for Awarded Tenders — {{GROUP}}');
  const [pmAssignTemplateBody, setPmAssignTemplateBody] = useState('Please assign a Project Manager for the following newly awarded tenders in your vertical.');
  const [pmAssignSeededAt, setPmAssignSeededAt] = useState<string | null>(null);
  const [awardAssignSeedBusy, setAwardAssignSeedBusy] = useState(false);
  // F16 — lead notification
  const [leadNotifEnabled, setLeadNotifEnabled] = useState(false);
  const [leadNotifTrigger, setLeadNotifTrigger] = useState<'new_row' | 'awarded' | 'any_stage'>('new_row');
  const [leadNotifRecipients, setLeadNotifRecipients] = useState<string[]>([]);
  const [leadNotifTemplateSubject, setLeadNotifTemplateSubject] = useState('Notification: New Tender — {{TENDER_NO}}');
  const [leadNotifTemplateBody, setLeadNotifTemplateBody] = useState('This is an automated notification for the following opportunity.');
  const [leadNotifSeededAt, setLeadNotifSeededAt] = useState<string | null>(null);
  const [leadNotifSeedBusy, setLeadNotifSeedBusy] = useState(false);
  const [leadNotifEmailInput, setLeadNotifEmailInput] = useState('');
  // F22 — award value report
  const [awardReportSending, setAwardReportSending] = useState(false);
  // F25 — top performer card visibility
  const [topPerformerCardVisible, setTopPerformerCardVisible] = useState(false);
  const [deadlineAlertEnabled, setDeadlineAlertEnabled] = useState(false);
  const [deadlineTemplateSubject, setDeadlineTemplateSubject] = useState('Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [deadlineTemplateBody, setDeadlineTemplateBody] = useState('Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.');
  const [deadlineTemplateStyle, setDeadlineTemplateStyle] = useState('sunset_alert');
  const [deadlineAlertClients, setDeadlineAlertClients] = useState<string[]>([]);
  const [deadlineClientQuery, setDeadlineClientQuery] = useState('');
  const [deadlineTestSending, setDeadlineTestSending] = useState(false);
  const [deadlineStatusRows, setDeadlineStatusRows] = useState<Array<{
    refNo: string;
    tenderName: string;
    clientName: string;
    leadName: string;
    leadEmail: string;
    submissionDate: string;
    sent: boolean;
    reason: string;
  }>>([]);
  const [deadlineStatusDate, setDeadlineStatusDate] = useState('');
  const [deadlineStatusLoading, setDeadlineStatusLoading] = useState(false);
  const [issueReportTemplateStyle, setIssueReportTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [issueReportTemplateStyles, setIssueReportTemplateStyles] = useState<TelecastTemplateStyle[]>([DEFAULT_TELECAST_TEMPLATE_STYLE]);
  const [telecastKeywords, setTelecastKeywords] = useState<string[]>([]);
  const [telecastWeeklyStats, setTelecastWeeklyStats] = useState<WeeklyTelecastStat[]>([]);
  const [telecastGroupRecipients, setTelecastGroupRecipients] = useState<Record<'GES' | 'GDS' | 'GTS', string[]>>({ GES: [], GDS: [], GTS: [] });
  const [telecastRefNosToUnalert, setTelecastRefNosToUnalert] = useState('');
  const [telecastBulkUpdating, setTelecastBulkUpdating] = useState(false);
  const [showConvertedEoiRowsDefault, setShowConvertedEoiRowsDefault] = useState(false);
  const [eoiDuplicateConfigSaving, setEoiDuplicateConfigSaving] = useState(false);
  const [availableClients, setAvailableClients] = useState<string[]>([]);
  const [newAuthorizedUser, setNewAuthorizedUser] = useState<{
    email: string;
    displayName: string;
    role: UserRole;
    assignedGroup: string;
    status: 'approved' | 'pending';
    password: string;
    tempAccessExpiresAt: string;
  }>({
    email: '',
    displayName: '',
    role: 'Basic',
    assignedGroup: 'GES',
    status: 'approved',
    password: '',
    tempAccessExpiresAt: '',
  });
  const [leadEmailSuggestions, setLeadEmailSuggestions] = useState<LeadEmailSuggestion[]>([]);
  const [leadEmailLoading, setLeadEmailLoading] = useState(false);
  const [leadEmailApproving, setLeadEmailApproving] = useState(false);
  const [assignedLeadEmails, setAssignedLeadEmails] = useState<LeadEmailAssigned[]>([]);
  const [assignedLeadLoading, setAssignedLeadLoading] = useState(false);
  const [leadEmailEditKey, setLeadEmailEditKey] = useState<string | null>(null);
  const [leadEmailEditValue, setLeadEmailEditValue] = useState('');
  const [leadEmailSaving, setLeadEmailSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'general');
  const [draftPagePermissions, setDraftPagePermissions] = useState<Record<PageKey, UserRole[]>>(DEFAULT_PAGE_ROLE_ACCESS as Record<PageKey, UserRole[]>);
  const [draftPageExcludePermissions, setDraftPageExcludePermissions] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [draftPageEmailPermissions, setDraftPageEmailPermissions] = useState<Record<PageKey, string[]>>({} as Record<PageKey, string[]>);
  const [draftActionPermissions, setDraftActionPermissions] = useState<Record<ActionKey, UserRole[]>>(DEFAULT_ACTION_ROLE_ACCESS as Record<ActionKey, UserRole[]>);
  const [draftActionEmailPermissions, setDraftActionEmailPermissions] = useState<Record<ActionKey, string[]>>({} as Record<ActionKey, string[]>);
  const [postBidAllowedEmails, setPostBidAllowedEmails] = useState<string[]>([]);
  const [postBidSaving, setPostBidSaving] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplateConfig>(DEFAULT_EXPORT_TEMPLATE);
  const [exportTemplateSaving, setExportTemplateSaving] = useState(false);
  const [selectedExportBlock, setSelectedExportBlock] = useState<(typeof EXPORT_BLOCK_OPTIONS)[number]['key']>('title');
  const [manualTemplateSelection, setManualTemplateSelection] = useState<Record<string, boolean>>(DEFAULT_MANUAL_TEMPLATE_SELECTION);
  const [manualUpdateUploading, setManualUpdateUploading] = useState(false);
  const [manualUpdateFileName, setManualUpdateFileName] = useState('');
  const [manualUpdateSummary, setManualUpdateSummary] = useState<ManualUpdateSummary | null>(null);
  const [tempCredentialLogs, setTempCredentialLogs] = useState<TempCredentialLogRow[]>([]);
  const [tempCredentialLogsLoading, setTempCredentialLogsLoading] = useState(false);
  const [authDiagnostics, setAuthDiagnostics] = useState<AuthDiagnosticLogRow[]>([]);
  const [authDiagnosticsLoading, setAuthDiagnosticsLoading] = useState(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealthSnapshot | null>(null);
  const [backendHealthLoading, setBackendHealthLoading] = useState(false);
  const [systemConfigMeta, setSystemConfigMeta] = useState<SystemConfigMeta>({
    systemConfigUpdatedAt: null,
    systemConfigUpdatedBy: null,
    systemConfigFingerprint: null,
  });
  const [userManagementBusy, setUserManagementBusy] = useState(false);
  const [permissionsBusy, setPermissionsBusy] = useState(false);
  const [permissionsProgress, setPermissionsProgress] = useState(0);
  const [tempCredentialSelection, setTempCredentialSelection] = useState<string[]>([]);
  const [tempCredentialConfirmOpen, setTempCredentialConfirmOpen] = useState(false);
  const patchUserList = (nextUser: AuthorizedUser) => {
    const normalizedEmail = String(nextUser.email || '').trim().toLowerCase();
    setUsers((previous) => {
      const index = previous.findIndex((candidate) => String(candidate.email || '').trim().toLowerCase() === normalizedEmail);
      if (index >= 0) {
        const next = previous.slice();
        next[index] = { ...previous[index], ...nextUser };
        return next;
      }
      return [nextUser, ...previous].sort((a, b) => new Date(String(b.createdAt || '')).getTime() - new Date(String(a.createdAt || '')).getTime());
    });
  };

  const removeUserFromList = (email: string) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    setUsers((previous) => previous.filter((candidate) => String(candidate.email || '').trim().toLowerCase() !== normalizedEmail));
  };

  const snapshotUsers = () => users.map((candidate) => ({ ...candidate }));

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const copyAuthDiagnostic = async (row: AuthDiagnosticLogRow) => {
    const payload = JSON.stringify(row, null, 2);
    await navigator.clipboard.writeText(payload);
    toast.success('Diagnostic copied to clipboard');
  };

  const applySystemConfigMeta = (payload: unknown, response?: Response) => {
    const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const nextMeta: SystemConfigMeta = {
      systemConfigUpdatedAt: String(data.systemConfigUpdatedAt || response?.headers.get('X-System-Config-Updated-At') || '') || null,
      systemConfigUpdatedBy: String(data.systemConfigUpdatedBy || response?.headers.get('X-System-Config-Updated-By') || '') || null,
      systemConfigFingerprint: String(data.systemConfigFingerprint || response?.headers.get('X-System-Config-Fingerprint') || '') || null,
    };
    setSystemConfigMeta(nextMeta);
    return nextMeta;
  };

  const formatBytes = (bytes: number | null | undefined) => {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let current = value;
    let index = 0;
    while (current >= 1024 && index < units.length - 1) {
      current /= 1024;
      index += 1;
    }
    return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const formatPercent = (value: number | null | undefined) => (
    Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}%` : '—'
  );

  const configsMatch = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

  // runTrackedAction now delegates to useTrackedAction hook (defined above as { status: trackedStatus, run: runTrackedAction })
  // keeping the same call signature so all existing call sites work unchanged

  const tabConfig = useMemo(
    () => ([
      { value: 'general', label: 'General', pageKey: 'master_general' as PageKey },
      { value: 'users', label: 'User Management', pageKey: 'master_users' as PageKey },
      { value: 'temp-access', label: 'Temp Access', pageKey: 'master_users' as PageKey },
      { value: 'auth-diagnostics', label: 'Auth Diagnostics', pageKey: 'master_users' as PageKey },
      { value: 'telecast', label: '📣 Telecast', pageKey: 'master_telecast' as PageKey },
      { value: 'update', label: 'Update', pageKey: 'master_update' as PageKey },
      { value: 'export', label: 'Export', pageKey: 'master_export' as PageKey },
    ]),
    [],
  );

  const allowedTabs = useMemo(
    () => tabConfig.filter((tab) => canAccessPage(tab.pageKey)),
    [tabConfig, canAccessPage],
  );
  const allowedTabValues = useMemo(
    () => new Set(allowedTabs.map((tab) => tab.value)),
    [allowedTabs],
  );

  // Telecast mail auth is env-driven (server-side ROPC). UI should not handle credentials/tokens.
  const telecastMailReady = true;

  useEffect(() => {
    if (!canAccessPanel) return;

    let cancelled = false;
    const run = async () => {
      const bootstrapped = await loadAdminBootstrap();
      if (!cancelled && !bootstrapped) {
        loadBackendHealth();
        loadUsers();
        loadCollectionStats();
        loadGraphConfig();
        loadGraphAuthStatus();
        loadTelecastConfig();
        loadEoiDuplicateConfig();
        loadReportingConfig();
        loadExportTemplateConfig();
        loadNotificationStatus();
        fetchConsentUrl();
      }
      if (!cancelled && diag.enabled) {
        fetch(API_URL + '/version', { headers: token ? { Authorization: 'Bearer ' + token } : undefined })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) statusConsole.info('backend version', data); })
          .catch(() => {});
      }
    };
    void run();

    const healthInterval = setInterval(() => {
      if (!cancelled) loadBackendHealth();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(healthInterval);
    };
  }, [canAccessPanel, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canAccessPanel) return;
    if (activeTab === 'telecast') {
      loadClients();
      loadDeadlineStatus();
      loadEoiDuplicateConfig();
    }
  }, [activeTab, canAccessPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canAccessPanel || !token) return;
    if (activeTab === 'users') {
      loadLeadEmailSuggestions();
      loadAssignedLeadEmails();
      loadPostBidConfig();
      loadTempCredentialLogs();
    }
    if (activeTab === 'auth-diagnostics') {
      loadAuthDiagnostics();
    }
  }, [activeTab, canAccessPanel, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraftPagePermissions((pagePermissions || DEFAULT_PAGE_ROLE_ACCESS) as Record<PageKey, UserRole[]>);
  }, [pagePermissions]);

  useEffect(() => {
    setDraftPageExcludePermissions((pageExcludePermissions || {}) as Record<PageKey, UserRole[]>);
  }, [pageExcludePermissions]);

  useEffect(() => {
    setDraftPageEmailPermissions((pageEmailPermissions || {}) as Record<PageKey, string[]>);
  }, [pageEmailPermissions]);

  useEffect(() => {
    setDraftActionPermissions((actionPermissions || DEFAULT_ACTION_ROLE_ACCESS) as Record<ActionKey, UserRole[]>);
  }, [actionPermissions]);

  useEffect(() => {
    setDraftActionEmailPermissions((actionEmailPermissions || {}) as Record<ActionKey, string[]>);
  }, [actionEmailPermissions]);

  useEffect(() => {
    if (!allowedTabs.length) return;
    if (!allowedTabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(allowedTabs[0].value);
    }
  }, [allowedTabs, activeTab]);

  const telecastRecipientUsers = useMemo(
    () => users.filter((candidate) => candidate.status === 'approved').map((candidate) => ({
      id: candidate._id,
      email: candidate.email,
      displayName: candidate.email,
      role: candidate.role,
      assignedGroup: candidate.assignedGroup,
    })),
    [users],
  );

  const selectedTelecastTemplateStyle = useMemo(
    () => telecastTemplateStyles.find((style) => style.key === telecastTemplateStyle) || DEFAULT_TELECAST_TEMPLATE_STYLE,
    [telecastTemplateStyle, telecastTemplateStyles],
  );

  const selectedIssueReportTemplateStyle = useMemo(
    () => issueReportTemplateStyles.find((style) => style.key === issueReportTemplateStyle) || DEFAULT_TELECAST_TEMPLATE_STYLE,
    [issueReportTemplateStyle, issueReportTemplateStyles],
  );

  const selectedApprovalTemplateStyle = useMemo(
    () => telecastTemplateStyles.find((style) => style.key === approvalTemplateStyle) || DEFAULT_TELECAST_TEMPLATE_STYLE,
    [approvalTemplateStyle, telecastTemplateStyles],
  );

  const selectedAwardTemplateStyle = useMemo(
    () => telecastTemplateStyles.find((style) => style.key === awardTemplateStyle) || DEFAULT_TELECAST_TEMPLATE_STYLE,
    [awardTemplateStyle, telecastTemplateStyles],
  );

  const selectedDeadlineTemplateStyle = useMemo(
    () => telecastTemplateStyles.find((style) => style.key === deadlineTemplateStyle) || DEFAULT_TELECAST_TEMPLATE_STYLE,
    [deadlineTemplateStyle, telecastTemplateStyles],
  );

  const telecastPreviewSubject = useMemo(
    () => renderTemplatePreview(telecastTemplateSubject, SAMPLE_TELECAST_VALUES),
    [telecastTemplateSubject],
  );

  const telecastPreviewBody = useMemo(
    () => renderTemplatePreview(telecastTemplateBody, SAMPLE_TELECAST_VALUES),
    [telecastTemplateBody],
  );

  const approvalPreviewSubject = useMemo(
    () => renderTemplatePreview(approvalTemplateSubject, SAMPLE_TELECAST_VALUES),
    [approvalTemplateSubject],
  );

  const approvalPreviewBody = useMemo(
    () => renderTemplatePreview(approvalTemplateBody, SAMPLE_TELECAST_VALUES),
    [approvalTemplateBody],
  );

  const awardPreviewSubject = useMemo(
    () => renderTemplatePreview(awardTemplateSubject, SAMPLE_TELECAST_VALUES),
    [awardTemplateSubject],
  );

  const awardPreviewBody = useMemo(
    () => renderTemplatePreview(awardTemplateBody, SAMPLE_TELECAST_VALUES),
    [awardTemplateBody],
  );

  const deadlinePreviewSubject = useMemo(
    () => renderTemplatePreview(deadlineTemplateSubject, SAMPLE_TELECAST_VALUES),
    [deadlineTemplateSubject],
  );

  const deadlinePreviewBody = useMemo(
    () => renderTemplatePreview(deadlineTemplateBody, SAMPLE_TELECAST_VALUES),
    [deadlineTemplateBody],
  );

  const filteredDeadlineClients = useMemo(() => {
    const query = deadlineClientQuery.trim().toLowerCase();
    if (!query) return availableClients;
    return availableClients.filter((client) => client.toLowerCase().includes(query));
  }, [availableClients, deadlineClientQuery]);

  const normalizeRecipientList = (value: unknown): string[] => {
    if (!value) return [];
    const list = Array.isArray(value) ? value : String(value).split(/[\n,;]+/g);
    return [...new Set(list.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];
  };

  const canManageLeadEmails = canPerformAction('lead_email_manage');
  const canManageManualUpdates = canPerformAction('manual_opportunity_updates_write');
  const canManageExportTemplate = canPerformAction('export_template_write');
  const canManageUsers = canPerformAction('users_manage');
  const approvedUsers = useMemo(
    () => users.filter((candidate) => candidate.status === 'approved'),
    [users],
  );
  const exportTemplateLogoPreview = exportTemplate.logoDataUrl || defaultExportLogo;

  const loadAdminBootstrap = async () => {
    if (!token) return false;
    setBackendHealthLoading(true);
    try {
      const response = await fetch(API_URL + '/admin/bootstrap', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(data, 'Failed to load admin bootstrap data'));
      }

      const bootstrap = data as AdminBootstrapResponse;
      if (bootstrap.backendHealth) {
        setBackendHealth({
          ok: Boolean(bootstrap.backendHealth.ok),
          dbState: Number.isFinite(Number(bootstrap.backendHealth.dbState)) ? Number(bootstrap.backendHealth.dbState) : -1,
          timestamp: bootstrap.backendHealth.timestamp,
          system: bootstrap.backendHealth.system || undefined,
        });
      }
      if (bootstrap.postBidConfig) {
        setPostBidAllowedEmails(Array.isArray(bootstrap.postBidConfig.allowedEmails) ? bootstrap.postBidConfig.allowedEmails : []);
      }
      if (Array.isArray(bootstrap.users)) {
        setUsers(bootstrap.users);
      }
      if (bootstrap.collectionStats) {
        setCollectionStats(bootstrap.collectionStats);
      }
      if (bootstrap.graphConfig) {
        const next: GraphConfig = {
          shareLink: String(bootstrap.graphConfig.shareLink || ''),
          driveId: String(bootstrap.graphConfig.driveId || ''),
          fileId: String(bootstrap.graphConfig.fileId || ''),
          worksheetName: String(bootstrap.graphConfig.worksheetName || ''),
          dataRange: String(bootstrap.graphConfig.dataRange || ''),
          headerRowOffset: Number(bootstrap.graphConfig.headerRowOffset || 0),
          syncIntervalMinutes: Number(bootstrap.graphConfig.syncIntervalMinutes || 10),
          fieldMapping: (bootstrap.graphConfig.fieldMapping || {}) as Record<string, string | string[]>,
          lastResolvedAt: bootstrap.graphConfig.lastResolvedAt,
          lastSyncAt: bootstrap.graphConfig.lastSyncAt,
        };
        setGraphConfig(next);
        setMappingText(JSON.stringify(next.fieldMapping || {}, null, 2));
      }
      if (Array.isArray(bootstrap.worksheets)) {
        setWorksheets(bootstrap.worksheets);
      }
      if (bootstrap.graphAuthStatus) {
        setGraphAuthStatus({
          authMode: bootstrap.graphAuthStatus.authMode || 'application',
          accountUsername: bootstrap.graphAuthStatus.accountUsername || '',
          hasRefreshToken: Boolean(bootstrap.graphAuthStatus.hasRefreshToken),
          tokenUpdatedAt: bootstrap.graphAuthStatus.tokenUpdatedAt || null,
        });
      }
      if (bootstrap.consentUrl !== undefined) {
        setConsentUrl(bootstrap.consentUrl || '');
      }
      if (bootstrap.telecastConfig) {
        setTelecastTemplateSubject(bootstrap.telecastConfig.templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}');
        setTelecastTemplateBody(bootstrap.telecastConfig.templateBody || 'A new tender row was detected for {{CLIENT}} in {{GROUP}}.');
        setTelecastTemplateStyle(bootstrap.telecastConfig.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
        setApprovalAlertEnabled(Boolean(bootstrap.telecastConfig.approvalAlertEnabled));
        setApprovalTemplateSubject(bootstrap.telecastConfig.approvalTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}');
        setApprovalTemplateBody(bootstrap.telecastConfig.approvalTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.');
        setApprovalTemplateStyle(bootstrap.telecastConfig.approvalTemplateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
        setDeadlineAlertEnabled(Boolean(bootstrap.telecastConfig.deadlineAlertEnabled));
        setDeadlineTemplateSubject(bootstrap.telecastConfig.deadlineTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}');
        setDeadlineTemplateBody(bootstrap.telecastConfig.deadlineTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.');
        setDeadlineTemplateStyle(bootstrap.telecastConfig.deadlineTemplateStyle || 'sunset_alert');
        setDeadlineAlertClients(Array.isArray(bootstrap.telecastConfig.deadlineAlertClients) ? bootstrap.telecastConfig.deadlineAlertClients : []);
        const delayValue = Number(bootstrap.telecastConfig.telecastSendDelayMinutes);
        setTelecastSendDelayMinutes(Number.isFinite(delayValue) ? delayValue : 10);
        setTelecastTemplateStyles(Array.isArray(bootstrap.telecastConfig.templateStyles) && bootstrap.telecastConfig.templateStyles.length ? bootstrap.telecastConfig.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
        setTelecastKeywords(Array.isArray(bootstrap.telecastConfig.keywords) ? bootstrap.telecastConfig.keywords : []);
        setTelecastGroupRecipients({
          GES: normalizeRecipientList(bootstrap.telecastConfig.groupRecipients?.GES),
          GDS: normalizeRecipientList(bootstrap.telecastConfig.groupRecipients?.GDS),
          GTS: normalizeRecipientList(bootstrap.telecastConfig.groupRecipients?.GTS),
        });
        setTelecastWeeklyStats(Array.isArray(bootstrap.telecastConfig.weeklyStats) ? bootstrap.telecastConfig.weeklyStats : []);
      }
      if (bootstrap.eoiDuplicateConfig) {
        setShowConvertedEoiRowsDefault(Boolean(bootstrap.eoiDuplicateConfig.showConvertedEoiRowsDefault));
      }
      if (bootstrap.reportingConfig) {
        setIssueReportTemplateStyle(bootstrap.reportingConfig.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
        setIssueReportTemplateStyles(Array.isArray(bootstrap.reportingConfig.templateStyles) && bootstrap.reportingConfig.templateStyles.length ? bootstrap.reportingConfig.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
      }
      if (bootstrap.exportTemplateConfig) {
        setExportTemplate(normalizeExportTemplate(bootstrap.exportTemplateConfig as ExportTemplateConfig));
      }
      if (bootstrap.notificationStatus) {
        setNotificationSyncStatus({
          lastCheckedAt: bootstrap.notificationStatus.lastCheckedAt || null,
          lastNewRowsCount: Number(bootstrap.notificationStatus.lastNewRowsCount || 0),
          trackedRows: Number(bootstrap.notificationStatus.trackedRows || 0),
          alertWindowDays: Number(bootstrap.notificationStatus.alertWindowDays || 28),
          alertSeededAt: bootstrap.notificationStatus.alertSeededAt || null,
          alertSeededCount: Number(bootstrap.notificationStatus.alertSeededCount || 0),
          alertedKeysTracked: Number(bootstrap.notificationStatus.alertedKeysTracked || 0),
          alertedRefNosTracked: Number(bootstrap.notificationStatus.alertedRefNosTracked || 0),
          alertedRefNosPreview: Array.isArray(bootstrap.notificationStatus.alertedRefNosPreview) ? bootstrap.notificationStatus.alertedRefNosPreview : [],
          weeklyStats: Array.isArray(bootstrap.notificationStatus.weeklyStats) ? bootstrap.notificationStatus.weeklyStats : [],
          lastNewRowsPreview: Array.isArray(bootstrap.notificationStatus.lastNewRowsPreview) ? bootstrap.notificationStatus.lastNewRowsPreview : [],
          telecastEligibleRowsPreview: Array.isArray(bootstrap.notificationStatus.telecastEligibleRowsPreview) ? bootstrap.notificationStatus.telecastEligibleRowsPreview : [],
        });
      }

      setBackendHealthLoading(false);
      setLoading(false);

      return true;
    } catch (error) {
      return false;
    }
  };

  const loadBackendHealth = async () => {
    setBackendHealthLoading(true);
    try {
      const t0 = Date.now();
      const response = await fetch(API_URL + '/health', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      });
      const responseMs = Date.now() - t0;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(data, 'Failed to load backend health'));
      }
      setBackendHealth({
        ok: Boolean(data?.ok),
        dbState: Number.isFinite(Number(data?.dbState)) ? Number(data.dbState) : -1,
        timestamp: data?.timestamp ? String(data.timestamp) : undefined,
        system: data?.system || undefined,
        dbPingMs: Number.isFinite(Number(data?.dbPingMs)) ? Number(data.dbPingMs) : null,
        responseMs,
      });
    } catch (error) {
      setBackendHealth(null);
      toast.error((error as Error).message);
    } finally {
      setBackendHealthLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    setLoading(true);
	    try {
	      const response = await fetch(API_URL + '/users/authorized', {
	        headers: {
	          'Authorization': 'Bearer ' + token,
	          'Content-Type': 'application/json',
	        },
	      });
	      const data = await response.json().catch(() => ({}));
	      if (!response.ok) {
	        throw new Error(parseApiErrorPayload(data, 'Failed to load users'));
	      }
	      setUsers(data as AuthorizedUser[]);
	    } catch (error) {
	      setMessage({ type: 'error', text: 'Failed to load users: ' + (error as Error).message });
	    } finally {
	      setLoading(false);
    }
  };

  const loadLeadEmailSuggestions = async () => {
    if (!token) return;
    setLeadEmailLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/lead-email/suggestions', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load lead email suggestions');
      }
      const data = await response.json();
      setLeadEmailSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load lead email suggestions');
    } finally {
      setLeadEmailLoading(false);
    }
  };

  const loadAssignedLeadEmails = async () => {
    if (!token) return;
    setAssignedLeadLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/lead-email/assigned', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load assigned lead emails');
      }
      const data = await response.json();
      setAssignedLeadEmails(Array.isArray(data?.leads) ? data.leads : []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load assigned lead emails');
    } finally {
      setAssignedLeadLoading(false);
    }
  };

  const loadTempCredentialLogs = async () => {
    if (!token || !isMaster) return;
    setTempCredentialLogsLoading(true);
    try {
      const response = await fetch(API_URL + '/users/temp-credential-logs', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(data, 'Failed to load temporary credential logs'));
      }
      setTempCredentialLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load temporary credential logs');
    } finally {
      setTempCredentialLogsLoading(false);
    }
  };

  const loadAuthDiagnostics = async () => {
    if (!token || !isMaster) return;
    setAuthDiagnosticsLoading(true);
    try {
      const response = await fetch(API_URL + '/auth/diagnostics', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(data, 'Failed to load auth diagnostics'));
      }
      setAuthDiagnostics(Array.isArray(data?.logs) ? data.logs : []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load auth diagnostics');
    } finally {
      setAuthDiagnosticsLoading(false);
    }
  };

  const loadPostBidConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/opportunities/post-bid-config', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (response.status === 503) return null;
      if (!response.ok) {
        throw new Error('Failed to load post-bid assignees');
      }
      const data = await response.json();
      applySystemConfigMeta(data, response);
      setPostBidAllowedEmails(Array.isArray(data?.allowedEmails) ? data.allowedEmails : []);
      return data;
    } catch (error) {
      if (!String((error as Error)?.message || '').includes('503')) {
        toast.error((error as Error).message || 'Failed to load post-bid assignees');
      }
      return null;
    }
  };

  const loadExportTemplateConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/export-template/config', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load export template');
      }
      const data = await response.json();
      applySystemConfigMeta(data, response);
      setExportTemplate(normalizeExportTemplate(data));
      return data;
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load export template');
      return null;
    }
  };

  const saveExportTemplateConfig = async () => {
    if (!token) return;
    try {
      setExportTemplateSaving(true);
      await runTrackedAction('Save Export Template', async (setProgress) => {
        setProgress(30, 'Sending update');
        const response = await fetch(API_URL + '/export-template/config', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(exportTemplate),
        });
        setProgress(70, 'Processing response');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to save export template');
        }
        applySystemConfigMeta(data, response);
        setProgress(80, 'Applying persisted template');
        const persisted = normalizeExportTemplate(data);
        setExportTemplate(persisted);
        if (!configsMatch(normalizeExportTemplate(exportTemplate), persisted)) {
          throw new Error('Export template save did not persist');
        }
        setProgress(95, 'Applying updates');
        toast.success('Export template saved.');
        window.dispatchEvent(new CustomEvent('app:config-updated'));
      });
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save export template');
    } finally {
      setExportTemplateSaving(false);
    }
  };

  const updateExportTemplateField = (field: keyof ExportTemplateConfig, value: string | boolean | number) => {
    setExportTemplate((prev) => normalizeExportTemplate({ ...prev, [field]: value } as Partial<ExportTemplateConfig>));
  };

  const updateExportTemplateArrayField = (field: 'columnWidths' | 'rowHeights', index: number, value: number) => {
    setExportTemplate((prev) => {
      const nextArray = [...prev[field]];
      nextArray[index] = value;
      return normalizeExportTemplate({ ...prev, [field]: nextArray });
    });
  };

  const placeSelectedExportBlock = (row: number, column: number) => {
    setExportTemplate((prev) => {
      if (selectedExportBlock === 'title') {
        return normalizeExportTemplate({ ...prev, titleRow: row, titleColumn: column });
      }
      if (selectedExportBlock === 'intro') {
        return normalizeExportTemplate({ ...prev, introRow: row, introColumn: column });
      }
      if (selectedExportBlock === 'logo') {
        return normalizeExportTemplate({ ...prev, logoRow: row, logoColumn: column });
      }
      return normalizeExportTemplate({ ...prev, headerRow: row, headerColumn: column });
    });
  };

  const handleExportLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      toast.error('Use a PNG or JPG logo.');
      event.target.value = '';
      return;
    }
    try {
      const reader = new FileReader();
      const nextDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read logo file'));
        reader.readAsDataURL(file);
      });
      updateExportTemplateField('logoDataUrl', nextDataUrl);
      updateExportTemplateField('showLogo', true);
      toast.success('Logo ready for export template.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load logo file');
    } finally {
      event.target.value = '';
    }
  };

  const toggleManualTemplateColumn = (key: string, checked: boolean) => {
    setManualTemplateSelection((prev) => ({
      ...prev,
      [key]: key === 'opportunityRefNo' ? true : checked,
    }));
  };

  const downloadManualUpdateTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const selectedColumns = MANUAL_UPDATE_TEMPLATE_COLUMNS.filter((column) => column.required || manualTemplateSelection[column.key]);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Update Template');
      worksheet.addRow(selectedColumns.map((column) => column.label));
      worksheet.addRow(selectedColumns.map(() => ''));
      await downloadWorkbook(workbook, `opportunity-update-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Update template downloaded.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to download update template');
    }
  };

  const handleManualUpdateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    if (file.size > MAX_MANUAL_UPDATE_UPLOAD_BYTES) {
      toast.error('File too large. Maximum allowed size is 5MB.');
      event.target.value = '';
      return;
    }
    if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
      toast.error('Only .xlsx files are supported.');
      event.target.value = '';
      return;
    }

    setManualUpdateUploading(true);
    setManualUpdateFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('Workbook is empty.');
      const rows = worksheetToObjects(worksheet, { headerRow: 1, maxRows: MAX_MANUAL_UPDATE_ROWS });
      if (!rows.length) {
        throw new Error('No data rows found in the first sheet.');
      }
      if (rows.length > MAX_MANUAL_UPDATE_ROWS) {
        throw new Error(`Too many rows (${rows.length}). Limit is ${MAX_MANUAL_UPDATE_ROWS}.`);
      }

      const response = await fetch(API_URL + '/opportunities/manual-sheet-updates', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to apply manual workbook updates');
      }

      setManualUpdateSummary({
        receivedRows: Number(data?.receivedRows || 0),
        matchedRows: Number(data?.matchedRows || 0),
        manualDocsUpdated: Number(data?.manualDocsUpdated || 0),
        syncedRowsPatched: Number(data?.syncedRowsPatched || 0),
      });
      toast.success(data?.message || 'Manual workbook updates applied.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to upload update workbook');
    } finally {
      setManualUpdateUploading(false);
      event.target.value = '';
    }
  };

  const savePostBidConfig = async () => {
    if (!token) return;
    try {
      setPostBidSaving(true);
      await runTrackedAction('Save Post-Bid Assignees', async (setProgress) => {
        setProgress(30, 'Sending update');
        const response = await fetch(API_URL + '/opportunities/post-bid-config', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emails: postBidAllowedEmails }),
        });
        setProgress(70, 'Processing response');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to save post-bid assignees');
        }
        setProgress(80, 'Reloading persisted assignees');
        const persisted = await loadPostBidConfig();
        const persistedEmails = Array.isArray(persisted?.allowedEmails) ? persisted.allowedEmails.map((email: string) => String(email).trim().toLowerCase()).sort() : [];
        const responseEmails = Array.isArray(data?.allowedEmails) ? data.allowedEmails.map((email: string) => String(email).trim().toLowerCase()).sort() : [];
        if (!configsMatch(persistedEmails, responseEmails)) {
          throw new Error('Post-bid assignees did not persist');
        }
        setProgress(95, 'Applying updates');
        toast.success('Post-bid assignees updated.');
        window.dispatchEvent(new CustomEvent('app:config-updated'));
      });
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save post-bid assignees');
    } finally {
      setPostBidSaving(false);
    }
  };

  const togglePostBidAllowedEmail = (email: string, checked: boolean) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    setPostBidAllowedEmails((prev) => {
      const current = new Set(prev);
      if (checked) current.add(normalizedEmail);
      else current.delete(normalizedEmail);
      return Array.from(current).sort();
    });
  };

  const approveLeadEmailMapping = async (suggestion: LeadEmailSuggestion) => {
    if (!token) return;
    if (!suggestion?.leadName || !suggestion?.suggestedEmail) {
      toast.error('Missing lead name or suggested email.');
      return;
    }
    setLeadEmailApproving(true);
    try {
      const response = await fetch(`${API_URL}/opportunities/lead-email/approve`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadName: suggestion.leadName,
          leadNameKey: suggestion.leadNameKey,
          email: suggestion.suggestedEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Approval failed');
      }
      toast.success('Lead email mapping approved.');
      await loadLeadEmailSuggestions();
      await loadAssignedLeadEmails();
    } catch (error) {
      toast.error((error as Error).message || 'Approval failed');
    } finally {
      setLeadEmailApproving(false);
    }
  };

  const startLeadEmailEdit = (row: LeadEmailAssigned) => {
    setLeadEmailEditKey(row.leadNameKey || row.leadName);
    setLeadEmailEditValue(row.leadEmail || '');
  };

  const cancelLeadEmailEdit = () => {
    setLeadEmailEditKey(null);
    setLeadEmailEditValue('');
  };

  const saveLeadEmailEdit = async (row: LeadEmailAssigned) => {
    if (!token) return;
    const email = String(leadEmailEditValue || '').trim().toLowerCase();
    if (!email) {
      toast.error('Lead email is required.');
      return;
    }
    try {
      setLeadEmailSaving(true);
      await runTrackedAction('Save Lead Email Mapping', async (setProgress) => {
        setProgress(25, 'Sending update');
        const response = await fetch(`${API_URL}/opportunities/lead-email/approve`, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            leadName: row.leadName,
            leadNameKey: row.leadNameKey || row.leadName,
            email,
          }),
        });
        setProgress(60, 'Processing response');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Update failed');
        }
        toast.success('Lead email updated.');
        setProgress(80, 'Refreshing lists');
        cancelLeadEmailEdit();
        await loadAssignedLeadEmails();
        await loadLeadEmailSuggestions();
        setProgress(95, 'Applying updates');
      });
    } catch (error) {
      toast.error((error as Error).message || 'Update failed');
    } finally {
      setLeadEmailSaving(false);
    }
  };

  const loadCollectionStats = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/opportunities/stats', {
        headers: {
          'Authorization': 'Bearer ' + token,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCollectionStats(data);
      }
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };

  const syncFromGraphExcel = async () => {
    toast.error('Graph sync has been disabled. Use Opportunities upload as the source of truth.');
  };

  const seedClientsFromOpportunities = async () => {
    if (!token) return;
    setSyncLoading(true);
    try {
      const response = await fetch(API_URL + '/clients/seed', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to seed clients');
      }
      toast.success(`Seeded ${result.created || 0} clients, updated ${result.updated || 0}`);
    } catch (error) {
      toast.error((error as Error).message || 'Client seed failed');
    } finally {
      setSyncLoading(false);
    }
  };

  const resetSyncedOpportunities = async () => {
    if (!token) return;
    const confirmed = window.confirm(
      'This will clear all currently synced opportunities from MongoDB. Your Graph config stays intact, and the next sync will rebuild the data from Excel. Continue?'
    );
    if (!confirmed) return;

    setSyncLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/reset-synced', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(result, 'Failed to clear synced opportunities'));
      }

      setMessage({ type: 'success', text: result.message || 'Cleared synced opportunities. Run sync again to rebuild.' });
      await loadCollectionStats();
      toast.success(result.message || 'Cleared synced opportunities');
      setTimeout(() => setMessage(null), 4000);
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message || 'Failed to clear synced opportunities' });
      toast.error((error as Error).message || 'Failed to clear synced opportunities');
    } finally {
      setSyncLoading(false);
    }
  };

  const loadGraphAuthStatus = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/graph/auth/status', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setGraphAuthStatus({
        authMode: data.authMode || 'application',
        accountUsername: data.accountUsername || '',
        hasRefreshToken: !!data.hasRefreshToken,
        tokenUpdatedAt: data.tokenUpdatedAt || null,
      });
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };

  const loadTelecastAuthStatus = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/telecast/auth/status', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setTelecastAuthStatus({
        authMode: data.authMode || 'application',
        accountUsername: data.accountUsername || '',
        hasRefreshToken: !!data.hasRefreshToken,
        tokenUpdatedAt: data.tokenUpdatedAt || null,
        appConfigured: Boolean(data.appConfigured),
        senderConfigured: Boolean(data.senderConfigured),
        senderEmail: data.senderEmail || '',
      });
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };


  const loadTelecastConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/telecast/config', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      applySystemConfigMeta(data, response);
      setTelecastTemplateSubject(data.templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}');
      setTelecastTemplateBody(data.templateBody || 'A new tender row was detected for {{CLIENT}} in {{GROUP}}.');
      setTelecastTemplateStyle(data.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setApprovalAlertEnabled(Boolean(data.approvalAlertEnabled));
      setApprovalTemplateSubject(data.approvalTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}');
      setApprovalTemplateBody(data.approvalTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.');
      setApprovalTemplateStyle(data.approvalTemplateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setAwardAlertEnabled(Boolean(data.awardAlertEnabled));
      setAwardTemplateSubject(data.awardTemplateSubject || 'Awarded: {{TENDER_NO}} - {{TENDER_NAME}}');
      setAwardTemplateBody(data.awardTemplateBody || 'Tender {{TENDER_NAME}} has transitioned to AWARDED for {{CLIENT}}.');
      setAwardTemplateStyle(data.awardTemplateStyle || 'emerald_signal');
      setAwardRoleRecipients(Array.isArray(data.awardRoleRecipients) && data.awardRoleRecipients.length ? data.awardRoleRecipients : ['Master', 'Admin']);
      setAwardGroupRecipients({
        GES: normalizeRecipientList(data.awardGroupRecipients?.GES),
        GDS: normalizeRecipientList(data.awardGroupRecipients?.GDS),
        GTS: normalizeRecipientList(data.awardGroupRecipients?.GTS),
      });
      setDeadlineAlertEnabled(Boolean(data.deadlineAlertEnabled));
      setDeadlineTemplateSubject(data.deadlineTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}');
      setDeadlineTemplateBody(data.deadlineTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.');
      setDeadlineTemplateStyle(data.deadlineTemplateStyle || 'sunset_alert');
      setDeadlineAlertClients(Array.isArray(data.deadlineAlertClients) ? data.deadlineAlertClients : []);
      const delayValue = Number(data.telecastSendDelayMinutes);
      setTelecastSendDelayMinutes(Number.isFinite(delayValue) ? delayValue : 10);
      setTelecastTemplateStyles(Array.isArray(data.templateStyles) && data.templateStyles.length ? data.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
      setTelecastKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      setTelecastGroupRecipients({
        GES: normalizeRecipientList(data.groupRecipients?.GES),
        GDS: normalizeRecipientList(data.groupRecipients?.GDS),
        GTS: normalizeRecipientList(data.groupRecipients?.GTS),
      });
      setTelecastWeeklyStats(Array.isArray(data.weeklyStats) ? data.weeklyStats : []);
      // F7/F27/F16/F25 new fields
      setTlAssignAlertEnabled(Boolean(data.tlAssignAlertEnabled));
      setTlAssignTemplateSubject(data.tlAssignAlertTemplateSubject || 'Action Required: TL Assignment for Awarded Tenders — {{GROUP}}');
      setTlAssignTemplateBody(data.tlAssignAlertTemplateBody || 'Please assign a Team Lead for the following newly awarded tenders in your vertical.');
      setTlAssignSeededAt(data.tlAssignAlertSeededAt || null);
      setPmAssignAlertEnabled(Boolean(data.pmAssignAlertEnabled));
      setPmAssignTemplateSubject(data.pmAssignAlertTemplateSubject || 'Action Required: PM Assignment for Awarded Tenders — {{GROUP}}');
      setPmAssignTemplateBody(data.pmAssignAlertTemplateBody || 'Please assign a Project Manager for the following newly awarded tenders in your vertical.');
      setPmAssignSeededAt(data.pmAssignAlertSeededAt || null);
      setLeadNotifEnabled(Boolean(data.leadNotifEnabled));
      setLeadNotifTrigger(data.leadNotifTrigger || 'new_row');
      setLeadNotifRecipients(Array.isArray(data.leadNotifRecipients) ? data.leadNotifRecipients : []);
      setLeadNotifTemplateSubject(data.leadNotifTemplateSubject || 'Notification: New Tender — {{TENDER_NO}}');
      setLeadNotifTemplateBody(data.leadNotifTemplateBody || 'This is an automated notification for the following opportunity.');
      setLeadNotifSeededAt(data.leadNotifSeededAt || null);
      setTopPerformerCardVisible(Boolean(data.topPerformerCardVisible));
      return data;
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
      return null;
    }
  };

  const loadEoiDuplicateConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/eoi-duplicates/config', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (response.status === 503) return null;
      if (!response.ok) return;
      const data = await response.json();
      applySystemConfigMeta(data, response);
      setShowConvertedEoiRowsDefault(Boolean(data.showConvertedEoiRowsDefault));
      return data;
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
      return null;
    }
  };

  const loadClients = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/clients', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const names = Array.isArray(data)
        ? data.map((client) => String(client?.companyName || '').trim()).filter(Boolean)
        : [];
      setAvailableClients([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };

  const loadDeadlineStatus = async () => {
    if (!token) return;
    setDeadlineStatusLoading(true);
    try {
      const response = await fetch(API_URL + '/telecast/deadline-status', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load deadline status');
      }
      const data = await response.json();
      setDeadlineStatusDate(String(data?.tomorrow || ''));
	      setDeadlineStatusRows(
	        Array.isArray(data?.rows)
	          ? data.rows.map((row: Record<string, unknown>) => ({
	            ...row,
	            reason: typeof row?.reason === 'string' && row.reason ? row.reason : 'pending',
	          }))
	          : []
	      );
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    } finally {
      setDeadlineStatusLoading(false);
    }
  };

  const loadReportingConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/reporting/config', {
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      applySystemConfigMeta(data, response);
      setIssueReportTemplateStyle(data.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setIssueReportTemplateStyles(Array.isArray(data.templateStyles) && data.templateStyles.length ? data.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
      return data;
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
      return null;
    }
  };

  const loadNotificationStatus = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/notifications/status', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setNotificationSyncStatus({
        lastCheckedAt: data.lastCheckedAt || null,
        lastNewRowsCount: Number(data.lastNewRowsCount || 0),
        trackedRows: Number(data.trackedRows || 0),
        alertWindowDays: Number(data.alertWindowDays || 28),
        alertSeededAt: data.alertSeededAt || null,
        alertSeededCount: Number(data.alertSeededCount || 0),
        alertedKeysTracked: Number(data.alertedKeysTracked || 0),
        alertedRefNosTracked: Number(data.alertedRefNosTracked || 0),
        alertedRefNosPreview: Array.isArray(data.alertedRefNosPreview) ? data.alertedRefNosPreview : [],
        weeklyStats: Array.isArray(data.weeklyStats) ? data.weeklyStats : [],
        lastNewRowsPreview: Array.isArray(data.lastNewRowsPreview) ? data.lastNewRowsPreview : [],
        telecastEligibleRowsPreview: Array.isArray(data.telecastEligibleRowsPreview) ? data.telecastEligibleRowsPreview : [],
      });
      if (Array.isArray(data.weeklyStats)) setTelecastWeeklyStats(data.weeklyStats);
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };

  const forceRefreshNotificationSync = async () => {
    if (!token) return;
    setSyncLoading(true);
    try {
      await runTrackedAction('Force Refresh Notifications', async (setProgress) => {
        setProgress(25, 'Calling force refresh endpoint');
        const response = await fetch(API_URL + '/notifications/force-refresh', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
        });

        setProgress(60, 'Reading response');
        const data = await response.json();
        if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to force refresh notifications'));

        setProgress(82, 'Refreshing notification status');
        toast.success(data.message || `Force refresh complete. ${data.newRowsCount || 0} new rows detected.`);
        await loadNotificationStatus();
        setProgress(92, 'Refreshing collection stats');
        await loadCollectionStats();
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSyncLoading(false);
    }
  };

  const fetchConsentUrl = async (loginHint?: string) => {
    if (!token) return;
    try {
      const query = loginHint ? `?loginHint=${encodeURIComponent(loginHint)}` : '';
      const response = await fetch(API_URL + '/graph/auth/consent-url' + query, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch consent URL');
      setConsentUrl(data.consentUrl || '');
      return data.consentUrl || '';
    } catch (error) {
      return '';
    }
  };

  const bootstrapGraphAuth = async () => {
    if (!token || !bootstrapUsername || !bootstrapPassword) {
      toast.error('Username and password are required');
      return;
    }

    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/graph/auth/bootstrap', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: bootstrapUsername, password: bootstrapPassword }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === 'MFA_REQUIRED') throw new Error('MFA is enabled on this account. Use a non-MFA service account.');
        if (data.error === 'INVALID_CREDENTIALS') throw new Error('Invalid username or password.');
        if (data.error === 'USER_NOT_FOUND') throw new Error('User not found in this tenant.');
        if (data.error === 'CONSENT_REQUIRED') {
          setConsentUrl(data.consentUrl || '');
          throw new Error('Consent required for this account. Open the consent URL, accept once, then retry Connect Excel.');
        }
        throw new Error(data.message || data.error || 'Failed to bootstrap graph auth');
      }

      setBootstrapPassword('');
      toast.success('Connected! Delegated Graph token stored securely.');
      await loadGraphAuthStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const clearGraphAuth = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/graph/auth/clear', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to clear graph auth');

      toast.success('Cleared delegated token. Using application auth now.');
      await loadGraphAuthStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const loadGraphConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/graph/config', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const next: GraphConfig = {
        shareLink: data.shareLink || '',
        driveId: data.driveId || '',
        fileId: data.fileId || '',
        worksheetName: data.worksheetName || '',
        dataRange: data.dataRange || '',
        headerRowOffset: Number(data.headerRowOffset || 0),
        syncIntervalMinutes: data.syncIntervalMinutes || 10,
        fieldMapping: data.fieldMapping || {},
        lastResolvedAt: data.lastResolvedAt,
        lastSyncAt: data.lastSyncAt,
      };
      setGraphConfig(next);
      setMappingText(JSON.stringify(next.fieldMapping || {}, null, 2));
      if (next.driveId && next.fileId) {
        await loadWorksheets(next.driveId, next.fileId);
      }
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };

  const loadWorksheets = async (driveId: string, fileId: string) => {
    if (!token || !driveId || !fileId) return;
    try {
      const response = await fetch(API_URL + '/graph/worksheets', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ driveId, fileId }),
      });
      const data = await response.json();
      if (response.ok) {
        setWorksheets(data.sheets || []);
      }
    } catch (error) {
      // Keep console quiet; surface toasts/messages instead.
    }
  };


  const loadSheetsFromIds = async () => {
    if (!graphConfig.driveId || !graphConfig.fileId) {
      toast.error('Drive ID and File ID are required');
      return;
    }
    try {
      await runTrackedAction('Load Worksheets', async (setProgress) => {
        setProgress(35, 'Requesting worksheet list');
        await loadWorksheets(graphConfig.driveId, graphConfig.fileId);
        setProgress(90, 'Worksheet list loaded');
      });
    } catch {
      // loadWorksheets already logs failure details.
    }
  };

  const resolveShareLink = async () => {
    if (!token || !graphConfig.shareLink) return;
    setConfigSaving(true);
    try {
      await runTrackedAction('Resolve Share Link', async (setProgress) => {
        setProgress(25, 'Resolving shared link');
        const response = await fetch(API_URL + '/graph/resolve-share-link', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ shareLink: graphConfig.shareLink }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to resolve share link'));
        }

        setProgress(72, 'Updating IDs and loading worksheets');
        setGraphConfig((prev) => ({
          ...prev,
          driveId: data.driveId || prev.driveId,
          fileId: data.fileId || prev.fileId,
        }));
        await loadWorksheets(data.driveId, data.fileId);
        toast.success('Share link resolved successfully');
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const previewHeaderRows = async () => {
    if (!token || !graphConfig.driveId || !graphConfig.fileId || !graphConfig.worksheetName) {
      toast.error('Drive ID, File ID and Worksheet are required for preview');
      return;
    }

    setConfigSaving(true);
    try {
      await runTrackedAction('Preview Rows', async (setProgress) => {
        setProgress(25, 'Requesting preview rows');
        const response = await fetch(API_URL + '/graph/preview-rows', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            driveId: graphConfig.driveId,
            fileId: graphConfig.fileId,
            worksheetName: graphConfig.worksheetName,
            dataRange: graphConfig.dataRange || 'B4:Z60',
          }),
        });

        setProgress(70, 'Parsing preview payload');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to preview rows'));
        }

        setProgress(90, 'Rendering preview rows');
        setPreviewRows(data.previewRows || []);
        toast.success('Preview loaded. Choose the header row below.');
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const saveGraphConfig = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
      await runTrackedAction('Save Graph Config', async (setProgress) => {
        setProgress(20, 'Validating mapping JSON');
        let mapping: Record<string, unknown> = {};
        try {
          mapping = JSON.parse(mappingText || '{}');
        } catch {
          throw new Error('Field mapping must be valid JSON');
        }

        const payload = {
          ...graphConfig,
          fieldMapping: mapping,
        };

        setProgress(45, 'Saving configuration');
        const response = await fetch(API_URL + '/graph/config', {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        setProgress(78, 'Reading save response');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to save graph config');
        }

        setProgress(92, 'Applying latest config locally');
        setGraphConfig((prev) => ({ ...prev, ...(data.config || {}) }));
        toast.success('Graph configuration saved');
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const approveUser = async (email: string) => {
    if (!token) return;
    let previousUsers: AuthorizedUser[] = [];
    try {
      if (!canManageUsers) {
        toast.error('You do not have permission to approve users.');
        return;
      }
      setUserManagementBusy(true);
      previousUsers = snapshotUsers();
      setUsers((current) => current.map((candidate) => (
        String(candidate.email || '').trim().toLowerCase() === email.trim().toLowerCase()
          ? { ...candidate, status: 'approved', approvedBy: user?.email || candidate.approvedBy, approvedAt: new Date().toISOString() }
          : candidate
      )));
      await runTrackedAction('Approve User', async (setProgress) => {
        setProgress(40, 'Sending approve request');
        const response = await fetch(API_URL + '/users/approve', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to approve user'));
        }

        setProgress(75, 'Applying updates');
        if (data?.user) patchUserList(data.user as AuthorizedUser);
        setMessage({ type: 'success', text: '✅ User approved: ' + email });
        setProgress(90, 'Refreshing user list');
        setTimeout(() => setMessage(null), 3000);
      });
    } catch (error) {
      setUsers(previousUsers);
      setMessage({ type: 'error', text: '❌ Failed to approve user: ' + (error as Error).message });
    } finally {
      setUserManagementBusy(false);
    }
  };

  const rejectUser = async (email: string) => {
    if (!token) return;
    let previousUsers: AuthorizedUser[] = [];
    try {
      if (!canManageUsers) {
        toast.error('You do not have permission to reject users.');
        return;
      }
      setUserManagementBusy(true);
      previousUsers = snapshotUsers();
      setUsers((current) => current.map((candidate) => (
        String(candidate.email || '').trim().toLowerCase() === email.trim().toLowerCase()
          ? { ...candidate, status: 'rejected', approvedBy: user?.email || candidate.approvedBy, approvedAt: new Date().toISOString() }
          : candidate
      )));
      await runTrackedAction('Reject User', async (setProgress) => {
        setProgress(40, 'Sending reject request');
        const response = await fetch(API_URL + '/users/reject', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to reject user'));
        }

        setProgress(75, 'Applying updates');
        if (data?.user) patchUserList(data.user as AuthorizedUser);
        setMessage({ type: 'success', text: '❌ User rejected: ' + email });
        setProgress(90, 'Refreshing user list');
        setTimeout(() => setMessage(null), 3000);
      });
    } catch (error) {
      setUsers(previousUsers);
      setMessage({ type: 'error', text: '❌ Failed to reject user: ' + (error as Error).message });
    } finally {
      setUserManagementBusy(false);
    }
  };

  const changeUserRole = async (email: string, newRole: string, assignedGroup?: string | null) => {
    if (!token) return;
    setChangingRole(email);
    let previousUsers: AuthorizedUser[] = [];
    try {
      if (!canManageUsers) {
        toast.error('You do not have permission to change user roles.');
        return;
      }
      setUserManagementBusy(true);
      previousUsers = snapshotUsers();
      setUsers((current) => current.map((candidate) => {
        if (String(candidate.email || '').trim().toLowerCase() !== email.trim().toLowerCase()) return candidate;
        return {
          ...candidate,
          role: newRole as UserRole,
          assignedGroup: newRole === 'SVP' ? (assignedGroup || candidate.assignedGroup || 'GES') : null,
        };
      }));
      await runTrackedAction('Change User Role', async (setProgress) => {
        setProgress(40, 'Sending role update');
        const response = await fetch(API_URL + '/users/change-role', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, newRole, assignedGroup: newRole === 'SVP' ? assignedGroup : null }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to change role'));
        }

        setProgress(75, 'Applying updates');
        if (data?.user) patchUserList(data.user as AuthorizedUser);
        setMessage({ type: 'success', text: '🔄 User role changed to ' + newRole + ': ' + email });
        setProgress(90, 'Refreshing user list');
        setTimeout(() => setMessage(null), 3000);
      });
    } catch (error) {
      setUsers(previousUsers);
      setMessage({ type: 'error', text: '❌ Failed to change role: ' + (error as Error).message });
    } finally {
      setChangingRole(null);
      setUserManagementBusy(false);
    }
  };

  const togglePagePermission = (pageKey: PageKey, role: UserRole, checked: boolean) => {
    setDraftPagePermissions((prev) => {
      const current = new Set(prev[pageKey] || []);
      if (checked) current.add(role);
      else current.delete(role);
      const nextRoles = Array.from(current) as UserRole[];
      return { ...prev, [pageKey]: nextRoles.length ? nextRoles : prev[pageKey] };
    });
  };

  const updatePageEmailPermission = (pageKey: PageKey, rawValue: string) => {
    setDraftPageEmailPermissions((prev) => ({
      ...prev,
      [pageKey]: normalizeRecipientList(rawValue),
    }));
  };

  const togglePageExcludePermission = (pageKey: PageKey, role: UserRole, checked: boolean) => {
    setDraftPageExcludePermissions((prev) => {
      const current = new Set(prev[pageKey] || []);
      if (checked) current.add(role);
      else current.delete(role);
      return { ...prev, [pageKey]: Array.from(current) as UserRole[] };
    });
  };

  const savePagePermissions = async () => {
    if (!isMaster) {
      toast.error('Only Master users can update page permissions.');
      return;
    }
    try {
      setPermissionsBusy(true);
      setPermissionsProgress(10);
      await runTrackedAction('Save Page Permissions', async (setProgress) => {
        setProgress(30, 'Saving page visibility permissions');
        setPermissionsProgress(30);
        await updatePagePermissions(draftPagePermissions, draftPageEmailPermissions, draftPageExcludePermissions);
        setProgress(65, 'Applying updates');
        setPermissionsProgress(65);
        await reloadPagePermissions();
        setProgress(90, 'Refreshing permissions state');
        setPermissionsProgress(90);
        window.dispatchEvent(new CustomEvent('app:config-updated'));
        toast.success('Page visibility permissions updated');
        setTimeout(() => setMessage(null), 3000);
      });
      setPermissionsProgress(100);
      setTimeout(() => setPermissionsProgress(0), 800);
    } catch (error) {
      setPermissionsProgress(0);
      setMessage({ type: 'error', text: '❌ Failed to save page permissions: ' + (error as Error).message });
    } finally {
      setPermissionsBusy(false);
    }
  };

  const toggleActionPermission = (actionKey: ActionKey, role: UserRole, checked: boolean) => {
    setDraftActionPermissions((prev) => {
      const current = new Set(prev[actionKey] || []);
      if (checked) current.add(role);
      else current.delete(role);
      const nextRoles = Array.from(current) as UserRole[];
      return { ...prev, [actionKey]: nextRoles.length ? nextRoles : prev[actionKey] };
    });
  };

  const updateActionEmailPermission = (actionKey: ActionKey, rawValue: string) => {
    setDraftActionEmailPermissions((prev) => ({
      ...prev,
      [actionKey]: normalizeRecipientList(rawValue),
    }));
  };

  const saveActionPermissions = async () => {
    if (!isMaster) {
      toast.error('Only Master users can update action permissions.');
      return;
    }
    try {
      setPermissionsBusy(true);
      setPermissionsProgress(10);
      await runTrackedAction('Save Action Permissions', async (setProgress) => {
        setProgress(30, 'Saving action permissions');
        setPermissionsProgress(30);
        await updateActionPermissions(draftActionPermissions, draftActionEmailPermissions);
        setProgress(65, 'Applying updates');
        setPermissionsProgress(65);
        await reloadActionPermissions();
        setProgress(90, 'Refreshing permissions state');
        setPermissionsProgress(90);
        window.dispatchEvent(new CustomEvent('app:config-updated'));
        toast.success('Action permissions updated');
        setTimeout(() => setMessage(null), 3000);
      });
      setPermissionsProgress(100);
      setTimeout(() => setPermissionsProgress(0), 800);
    } catch (error) {
      setPermissionsProgress(0);
      setMessage({ type: 'error', text: '❌ Failed to save action permissions: ' + (error as Error).message });
    } finally {
      setPermissionsBusy(false);
    }
  };

  const removeUser = async (email: string) => {
    if (!token || !confirm('Are you sure you want to remove ' + email + '?')) return;
    let previousUsers: AuthorizedUser[] = [];
    try {
      if (!canManageUsers) {
        toast.error('You do not have permission to remove users.');
        return;
      }
      setUserManagementBusy(true);
      previousUsers = snapshotUsers();
      removeUserFromList(email);
      await runTrackedAction('Remove User', async (setProgress) => {
        setProgress(40, 'Sending remove request');
        const response = await fetch(API_URL + '/users/remove', {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to remove user'));
        }

        setProgress(75, 'Applying updates');
        setMessage({ type: 'success', text: '🗑️ User removed: ' + email });
        setProgress(90, 'Refreshing user list');
        setTimeout(() => setMessage(null), 3000);
      });
    } catch (error) {
      setUsers(previousUsers);
      setMessage({ type: 'error', text: '❌ Failed to remove user: ' + (error as Error).message });
    } finally {
      setUserManagementBusy(false);
    }
  };

  const toggleTempCredentialSelection = (email: string, checked: boolean) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    setTempCredentialSelection((current) => {
      const next = new Set(current.map((value) => value.toLowerCase()));
      if (checked) next.add(normalized);
      else next.delete(normalized);
      return Array.from(next);
    });
  };

  const sendTemporaryPasswords = async () => {
    if (!token) return;
    if (!isMaster) {
      toast.error('Only Master users can send temporary passwords.');
      return;
    }
    if (!tempCredentialSelection.length) {
      toast.error('Select at least one user.');
      return;
    }
    try {
      setUserManagementBusy(true);
      await runTrackedAction('Send Temporary Passwords', async (setProgress) => {
        setProgress(25, 'Generating credentials');
        const response = await fetch(API_URL + '/users/send-temp-credential', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emails: tempCredentialSelection }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseApiErrorPayload(data, 'Failed to send temporary passwords'));
        }
        setProgress(80, `Sent to ${data?.sentCount ?? 0} user(s)`);
        toast.success(`Temporary passwords sent to ${data?.sentCount ?? 0} user(s).`);
        setTempCredentialSelection([]);
        await loadTempCredentialLogs();
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUserManagementBusy(false);
    }
  };


  const addAuthorizedUser = async () => {
    if (!token) return;
    if (!canManageUsers) {
      toast.error('You do not have permission to add or update users.');
      return;
    }
    if (!newAuthorizedUser.email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (newAuthorizedUser.role === 'TempUser') {
      if (!newAuthorizedUser.password) {
        toast.error('Temp password is required for TempUser');
        return;
      }
      if (!newAuthorizedUser.tempAccessExpiresAt) {
        toast.error('Expiry time is required for TempUser');
        return;
      }
    }
    let previousUsers: AuthorizedUser[] = [];
    try {
      setUserManagementBusy(true);
      previousUsers = snapshotUsers();
      await runTrackedAction('Add/Update Authorized User', async (setProgress) => {
        setProgress(25, 'Validating payload');
        const response = await fetch(API_URL + '/users/add', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...newAuthorizedUser,
            tempAccessExpiresAt: newAuthorizedUser.tempAccessExpiresAt
              ? new Date(newAuthorizedUser.tempAccessExpiresAt).toISOString()
              : '',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to add user'));

        setProgress(75, 'Resetting form');
        if (data?.user) patchUserList(data.user as AuthorizedUser);
        toast.success('Authorized user added/updated');
        setNewAuthorizedUser({ email: '', displayName: '', role: 'Basic', assignedGroup: 'GES', status: 'approved', password: '', tempAccessExpiresAt: '' });
        setProgress(90, 'Refreshing user list');
      });
    } catch (error) {
      setUsers(previousUsers);
      toast.error((error as Error).message);
    } finally {
      setUserManagementBusy(false);
    }
  };

  const saveTelecastConfig = async () => {
    if (!token) return;
    try {
      setConfigSaving(true);
      await runTrackedAction('Save Telecast Config', async (setProgress) => {
        setProgress(30, 'Sending update');
        const response = await fetch(API_URL + '/telecast/config', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateSubject: telecastTemplateSubject,
            templateBody: telecastTemplateBody,
            templateStyle: telecastTemplateStyle,
            approvalAlertEnabled,
            approvalTemplateSubject,
            approvalTemplateBody,
            approvalTemplateStyle,
            awardAlertEnabled,
            awardTemplateSubject,
            awardTemplateBody,
            awardTemplateStyle,
            awardRoleRecipients,
            awardGroupRecipients: {
              GES: normalizeRecipientList(awardGroupRecipients.GES),
              GDS: normalizeRecipientList(awardGroupRecipients.GDS),
              GTS: normalizeRecipientList(awardGroupRecipients.GTS),
            },
            deadlineAlertEnabled,
            deadlineTemplateSubject,
            deadlineTemplateBody,
            deadlineTemplateStyle,
            deadlineAlertClients,
            telecastSendDelayMinutes,
            groupRecipients: {
              GES: normalizeRecipientList(telecastGroupRecipients.GES),
              GDS: normalizeRecipientList(telecastGroupRecipients.GDS),
              GTS: normalizeRecipientList(telecastGroupRecipients.GTS),
            },
            tlAssignAlertEnabled,
            tlAssignAlertTemplateSubject: tlAssignTemplateSubject,
            tlAssignAlertTemplateBody: tlAssignTemplateBody,
            pmAssignAlertEnabled,
            pmAssignAlertTemplateSubject: pmAssignTemplateSubject,
            pmAssignAlertTemplateBody: pmAssignTemplateBody,
            leadNotifEnabled,
            leadNotifTrigger,
            leadNotifRecipients,
            leadNotifTemplateSubject,
            leadNotifTemplateBody,
            topPerformerCardVisible,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save telecast config');
        setProgress(80, 'Reloading persisted config');
        const persisted = await loadTelecastConfig();
        if (!configsMatch(String(persisted?.templateSubject || ''), String(telecastTemplateSubject || ''))) {
          throw new Error('Telecast template subject did not persist');
        }
        toast.success('Telecast template and recipients saved');
        setProgress(95, 'Applying updates');
        window.dispatchEvent(new CustomEvent('app:config-updated'));
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const seedAwardAlerts = async () => {
    if (!token) return;
    setAwardAssignSeedBusy(true);
    try {
      const res = await fetch(API_URL + '/telecast/seed-award-alerts', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Seed failed');
      toast.success(`Seeded: ${data.seededCount ?? 0} awarded rows marked as notified`);
      await loadTelecastConfig();
    } catch (err) { toast.error((err as Error).message); }
    finally { setAwardAssignSeedBusy(false); }
  };

  const seedLeadNotif = async () => {
    if (!token) return;
    setLeadNotifSeedBusy(true);
    try {
      const res = await fetch(API_URL + '/telecast/seed-lead-notif', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Seed failed');
      toast.success(`Seeded: ${data.seededCount ?? 0} rows marked as notified`);
      await loadTelecastConfig();
    } catch (err) { toast.error((err as Error).message); }
    finally { setLeadNotifSeedBusy(false); }
  };

  const sendAwardValueReport = async () => {
    if (!token) return;
    setAwardReportSending(true);
    try {
      const res = await fetch(API_URL + '/admin/award-value-report', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      toast.success(`Report sent to ${data.recipientCount} master(s) — ${data.missingCount} tenders missing value`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setAwardReportSending(false); }
  };

  const saveEoiDuplicateConfig = async () => {
    if (!token) return;
    try {
      setEoiDuplicateConfigSaving(true);
      await runTrackedAction('Save EOI Duplicate Config', async (setProgress) => {
        setProgress(30, 'Sending update');
        const response = await fetch(API_URL + '/eoi-duplicates/config', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ showConvertedEoiRowsDefault }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save EOI duplicate config');
        setProgress(80, 'Reloading persisted config');
        const persisted = await loadEoiDuplicateConfig();
        if (Boolean(persisted?.showConvertedEoiRowsDefault) !== Boolean(showConvertedEoiRowsDefault)) {
          throw new Error('EOI duplicate config did not persist');
        }
        toast.success('EOI duplicate visibility default updated');
        setProgress(95, 'Applying updates');
        window.dispatchEvent(new CustomEvent('app:config-updated'));
      });
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save EOI duplicate config');
    } finally {
      setEoiDuplicateConfigSaving(false);
    }
  };

  const saveReportingConfig = async () => {
    if (!token) return;
    try {
      setConfigSaving(true);
      await runTrackedAction('Save Reporting Config', async (setProgress) => {
        setProgress(30, 'Sending update');
        const response = await fetch(API_URL + '/reporting/config', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ templateStyle: issueReportTemplateStyle }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to save reporting template'));
        setProgress(80, 'Reloading persisted config');
        const persisted = await loadReportingConfig();
        if (String(persisted?.templateStyle || '') !== String(issueReportTemplateStyle || '')) {
          throw new Error('Reporting template did not persist');
        }
        toast.success('Issue reporting template saved.');
        setProgress(95, 'Applying updates');
        window.dispatchEvent(new CustomEvent('app:config-updated'));
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const cleanupLogs = async () => {
    if (!token || !confirm('Delete login logs older than 15 days?')) return;
    try {
      const response = await fetch(API_URL + '/logs/cleanup', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to cleanup logs');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: '🗑️ Cleaned up ' + result.deletedCount + ' old login logs' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to cleanup logs: ' + (error as Error).message });
    }
  };



  const connectTelecastWithPassword = async () => {
    toast.error('Telecast ID/password connect is deprecated. Use Device Code (delegated) or Application mode (client credentials).');
  };

  const startTelecastDeviceCode = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/telecast/auth/device-code/start', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loginHint: telecastUsername }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to start device code flow');

      setTelecastDeviceCode(String(data.deviceCode || ''));
      setTelecastUserCode(String(data.userCode || ''));
      setTelecastVerificationUri(String(data.verificationUri || ''));
      toast.success('Device code started. Complete sign-in, then click Finish.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const finishTelecastDeviceCode = async () => {
    if (!token) return;
    if (!telecastDeviceCode) {
      toast.error('Start device code flow first.');
      return;
    }
    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/telecast/auth/device-code/complete', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceCode: telecastDeviceCode, username: telecastUsername }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to finish device code flow');

      setTelecastDeviceCode('');
      setTelecastUserCode('');
      setTelecastVerificationUri('');
      setTelecastPassword('');
      toast.success(data.message || 'Telecast account connected');
      await loadTelecastAuthStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const clearTelecastAuth = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/telecast/auth/clear', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to clear telecast auth');

      toast.success(data.message || 'Telecast auth cleared');
      await loadTelecastAuthStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const sendTelecastTestMail = async () => {
    if (!token) return;
    if (!telecastRecipientEmail.trim()) {
      toast.error('Recipient Email is required');
      return;
    }

    setTelecastSending(true);
    try {
      const response = await fetch(API_URL + '/telecast/test-mail', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientEmail: telecastRecipientEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send test mail');
      toast.success(data.message || 'Test mail sent');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setTelecastSending(false);
    }
  };

  const sendReportingTestMail = async () => {
    if (!token) return;
    if (!telecastRecipientEmail.trim()) {
      toast.error('Recipient email is required');
      return;
    }

    setReportingTemplateSending(true);
    try {
      const response = await fetch(API_URL + '/reporting/test-mail', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientEmail: telecastRecipientEmail.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to send reporting template preview'));
      toast.success(data.message || `Issue reporting preview sent to ${telecastRecipientEmail.trim()}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setReportingTemplateSending(false);
    }
  };

  const sendApprovalTestMail = async () => {
    if (!token) return;
    if (!telecastRecipientEmail.trim()) {
      toast.error('Recipient email is required');
      return;
    }

    setApprovalTemplateSending(true);
    try {
      const response = await fetch(API_URL + '/telecast/test-approval-mail', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientEmail: telecastRecipientEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to send approval alert preview'));
      toast.success(data.message || `Approval alert preview sent to ${telecastRecipientEmail.trim()}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setApprovalTemplateSending(false);
    }
  };

  const sendDeadlineTestMail = async () => {
    if (!token) return;
    if (!telecastRecipientEmail.trim()) {
      toast.error('Recipient email is required');
      return;
    }

    setDeadlineTestSending(true);
    try {
      const response = await fetch(API_URL + '/telecast/test-deadline-mail', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientEmail: telecastRecipientEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to send deadline alert preview'));
      toast.success(data.message || `Deadline alert preview sent to ${telecastRecipientEmail.trim()}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeadlineTestSending(false);
    }
  };

  const markAllTelecastAlerted = async () => {
    if (!token) return;
    setTelecastBulkUpdating(true);
    try {
      const response = await fetch(API_URL + '/notifications/mark-all-alerted', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to mark all as alerted');
      toast.success(data.message || 'All tenders marked as alerted');
      await loadNotificationStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setTelecastBulkUpdating(false);
    }
  };

  const markSelectedTelecastUnalerted = async () => {
    if (!token) return;
    const refNos = [...new Set(
      telecastRefNosToUnalert
        .split(/[\n,;]+/g)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )];
    if (!refNos.length) {
      toast.error('Enter one or more Ref Nos');
      return;
    }

    setTelecastBulkUpdating(true);
    try {
      const response = await fetch(API_URL + '/notifications/mark-unalerted', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refNos }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to mark selected tenders as unalerted');
      toast.success(data.message || 'Selected tenders marked as unalerted');
      await loadNotificationStatus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setTelecastBulkUpdating(false);
    }
  };

  const getDeadlineReasonBadge = (reason: string) => {
    switch (reason) {
      case 'sent':
        return { label: 'Already sent', variant: 'default' as const };
      case 'missing_lead_email':
        return { label: 'Missing lead email', variant: 'secondary' as const };
      case 'client_filtered':
        return { label: 'Client filtered', variant: 'outline' as const };
      case 'pending':
      default:
        return { label: 'Pending', variant: 'secondary' as const };
    }
  };

  const activeTabMeta = allowedTabs.find((tab) => tab.value === activeTab);
  const activeTabDescriptions: Record<string, string> = {
    general: 'User context and privilege overview.',
    users: 'Role access, user management, and approval controls.',
    'auth-diagnostics': 'Login failures, temp credential checks, and authentication diagnostics.',
    update: 'Manual opportunity updates and update templates.',
    export: 'Export layout designer and template configuration.',
    telecast: 'Telecast rules, template styles, and notification status.',
  };

  if (!canAccessPanel) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert className="max-w-md" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Access Denied</strong>
            <p className="text-sm mt-2">Only Master/Admin users can access this panel.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground mt-2">System administration and control</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
          onClick={() => setActiveTab('telecast')}
          disabled={!allowedTabValues.has('telecast')}
        >
          <Send className="h-4 w-4" />
          Open Telecast
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <ActionProgressBar status={trackedStatus} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <Card className="border bg-card/70 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admin Sections</CardTitle>
            <CardDescription>
              {activeTabMeta ? `${activeTabMeta.label}: ${activeTabDescriptions[activeTabMeta.value] || 'Configuration panel.'}` : 'Configuration panel.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TabsList className="w-full flex flex-wrap h-auto justify-start gap-2 bg-muted/40 p-1.5 rounded-md">
              {allowedTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:shadow-sm data-[state=active]:bg-background">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardContent>
        </Card>

        {allowedTabValues.has('general') && (
	        <TabsContent value="general" className="mt-6">
	          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
	            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Current User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 md:space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-mono text-sm">{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <Badge>{user?.role}</Badge>
                </div>
              </CardContent>
            </Card>
	            <Card>
	              <CardHeader>
	                <CardTitle>Master Privileges</CardTitle>
	              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Approve and reject tenders</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Revert approvals to pending</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Manage authorized users</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Sync data from Graph Excel</span>
                </div>
	              </CardContent>
	            </Card>
	            <Card>
	              <CardHeader>
	                <CardTitle className="flex items-center gap-2">
	                  <Database className="h-5 w-5" />
	                  Backend / DB Health
	                </CardTitle>
	                <CardDescription>Quick visibility into MongoDB connectivity from the backend.</CardDescription>
	              </CardHeader>
	              <CardContent className="space-y-3">
	                <div className="flex flex-wrap items-center gap-2">
	                  {backendHealthLoading ? (
	                    <Badge variant="secondary">Checking…</Badge>
	                  ) : backendHealth ? (
	                    backendHealth.ok ? (
	                      <Badge className="bg-success/20 text-success">OK</Badge>
	                    ) : (
	                      <Badge variant="destructive">DB Not Ready</Badge>
	                    )
	                  ) : (
	                    <Badge variant="secondary">Unknown</Badge>
	                  )}
	                  <Badge variant="outline">dbState: {backendHealth ? backendHealth.dbState : '—'}</Badge>
	                  {backendHealth?.dbPingMs != null && (
	                    <Badge variant="outline">DB ping: {backendHealth.dbPingMs}ms</Badge>
	                  )}
	                  {backendHealth?.responseMs != null && (
	                    <Badge variant="outline">API: {backendHealth.responseMs}ms</Badge>
	                  )}
	                  {backendHealth?.timestamp && (
	                    <Badge variant="outline">{new Date(backendHealth.timestamp).toLocaleString()}</Badge>
	                  )}
	                </div>
	                {backendHealth?.system && (
	                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
	                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
	                      <div className="flex items-center gap-2 text-sm font-semibold">
	                        <Server className="h-4 w-4" />
	                        Host
	                      </div>
	                      <p className="mt-2 text-sm">{backendHealth.system.platform || 'Unknown platform'}</p>
	                      <p className="text-xs text-muted-foreground font-mono break-all">{backendHealth.system.hostname || '—'}</p>
	                      <p className="text-xs text-muted-foreground mt-1">Node {backendHealth.system.nodeVersion || '—'} • {backendHealth.system.arch || '—'}</p>
	                    </div>
	                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
	                      <div className="flex items-center gap-2 text-sm font-semibold">
	                        <Clock className="h-4 w-4" />
	                        Uptime / Load
	                      </div>
	                      <p className="mt-2 text-sm">Uptime: {backendHealth.system.uptimeHuman || '—'}</p>
	                      <p className="text-xs text-muted-foreground">
	                        Load avg: {(backendHealth.system.loadAverage || []).slice(0, 3).map((value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—').join(' / ')}
	                      </p>
	                    </div>
	                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
	                      <div className="flex items-center gap-2 text-sm font-semibold">
	                        <Cpu className="h-4 w-4" />
	                        Memory
	                      </div>
	                      <p className="mt-2 text-sm">
	                        Host used: {formatPercent(backendHealth.system.memory?.usedPercent)} · RSS: {formatBytes(backendHealth.system.memory?.processRssBytes)}
	                      </p>
	                      <p className="text-xs text-muted-foreground">
	                        Heap: {formatBytes(backendHealth.system.memory?.processHeapUsedBytes)} / {formatBytes(backendHealth.system.memory?.processHeapTotalBytes)}
	                      </p>
	                    </div>
	                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
	                      <div className="flex items-center gap-2 text-sm font-semibold">
	                        <HardDrive className="h-4 w-4" />
	                        Disk / Temp
	                      </div>
	                      <p className="mt-2 text-sm">
	                        Free: {formatBytes(backendHealth.system.disk?.freeBytes)} / {formatBytes(backendHealth.system.disk?.totalBytes)}
	                      </p>
	                      <p className="text-xs text-muted-foreground">
	                        Used: {formatPercent(backendHealth.system.disk?.usedPercent)} • Temp: {backendHealth.system.temperature?.celsius !== null && backendHealth.system.temperature?.celsius !== undefined ? `${backendHealth.system.temperature.celsius}°C` : '—'}
	                      </p>
	                      <p className="text-xs text-muted-foreground">
	                        Mount: {backendHealth.system.disk?.path || '—'} {backendHealth.system.temperature?.source ? `• Sensor: ${backendHealth.system.temperature.source}` : ''}
	                      </p>
	                    </div>
	                  </div>
	                )}
	                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
	                  <Badge variant="secondary">Config {systemConfigMeta.systemConfigFingerprint || '—'}</Badge>
	                  <Badge variant="outline">Updated {systemConfigMeta.systemConfigUpdatedAt ? new Date(systemConfigMeta.systemConfigUpdatedAt).toLocaleString() : '—'}</Badge>
	                  <Badge variant="outline">{systemConfigMeta.systemConfigUpdatedBy || 'unknown'}</Badge>
	                </div>
	                <Button type="button" variant="outline" onClick={loadBackendHealth} disabled={backendHealthLoading}>
	                  <RefreshCw className="mr-2 h-4 w-4" />
	                  Refresh Health
	                </Button>
	              </CardContent>
	            </Card>
	          </div>
	        </TabsContent>
        )}

        {allowedTabValues.has('users') && (
        <TabsContent value="users" className="mt-6">
          <PermissionsPanel token={token} />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Lead Email Suggestions</CardTitle>
              <CardDescription>Review lead name to email matches and approve to apply across all matching opportunities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={loadLeadEmailSuggestions}
                    disabled={!canManageLeadEmails || leadEmailLoading}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${leadEmailLoading ? 'animate-spin' : ''}`} />
                    Refresh Suggestions
                  </Button>
                  <Button
                    variant="outline"
                    onClick={loadAssignedLeadEmails}
                    disabled={!canManageLeadEmails || assignedLeadLoading}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${assignedLeadLoading ? 'animate-spin' : ''}`} />
                    Refresh Approved
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Pending: {leadEmailSuggestions.length}
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Suggested Email</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Tenders</TableHead>
                      <TableHead>Sample Tenders</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadEmailSuggestions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          No pending lead email suggestions.
                        </TableCell>
                      </TableRow>
                    )}
                    {leadEmailSuggestions.map((suggestion) => (
                      <TableRow key={suggestion.leadNameKey}>
                        <TableCell className="max-w-[180px] truncate">{suggestion.leadName || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{suggestion.suggestedEmail || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{suggestion.score ?? 0}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{suggestion.tenderCount ?? '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {Array.isArray(suggestion.tenders) && suggestion.tenders.length
                            ? suggestion.tenders.map((tender) => tender.refNo).filter(Boolean).join(', ')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => approveLeadEmailMapping(suggestion)}
                            disabled={!canManageLeadEmails || leadEmailApproving || !suggestion.suggestedEmail}
                          >
                            Approve & Assign
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Approved Lead Emails</p>
                  <span className="text-xs text-muted-foreground">{assignedLeadEmails.length} leads</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Lead Email</TableHead>
                        <TableHead>Tenders</TableHead>
                        <TableHead>Sample Tenders</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignedLeadEmails.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                            No approved lead emails yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {assignedLeadEmails.map((row) => {
                        const isEditing = leadEmailEditKey === (row.leadNameKey || row.leadName);
                        return (
                          <TableRow key={row.leadNameKey || row.leadName}>
                            <TableCell className="max-w-[200px] truncate">{row.leadName || '—'}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {isEditing ? (
                                <Input
                                  value={leadEmailEditValue}
                                  onChange={(e) => setLeadEmailEditValue(e.target.value)}
                                  className="h-8 text-xs font-mono"
                                  placeholder="lead@company.com"
                                />
                              ) : (
                                row.leadEmail || '—'
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.count ?? '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {Array.isArray(row.tenders) && row.tenders.length
                                ? row.tenders.map((tender) => tender.refNo).filter(Boolean).join(', ')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => saveLeadEmailEdit(row)}
                                    disabled={!canManageLeadEmails || leadEmailSaving}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelLeadEmailEdit}
                                    disabled={leadEmailSaving}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startLeadEmailEdit(row)}
                                  disabled={!canManageLeadEmails}
                                >
                                  Edit
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Post-Bid Detail Assignees</CardTitle>
              <CardDescription>Only Master can choose who may enter post-bid details after a tender is fully approved.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Allowed users can update the dashboard-only <strong>Post bid details</strong> column with:
                {' '}Technical Clarification meeting, Technical presentation, No response, or Other.
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 text-center">Allow</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Group</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          No approved users available.
                        </TableCell>
                      </TableRow>
                    )}
                    {approvedUsers.map((candidate) => {
                      const email = String(candidate.email || '').trim().toLowerCase();
                      return (
                        <TableRow key={`post-bid-${candidate._id}`}>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={postBidAllowedEmails.includes(email)}
                              onCheckedChange={(checked) => togglePostBidAllowedEmail(email, Boolean(checked))}
                              disabled={!isMaster}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{candidate.email}</TableCell>
                          <TableCell>{candidate.role}</TableCell>
                          <TableCell>{candidate.assignedGroup || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Selected: {postBidAllowedEmails.length}
                </div>
                {isMaster && (
                  <Button onClick={savePostBidConfig} loading={postBidSaving}>
                    Save Post-Bid Assignees
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>


          <UsersPanel token={token} isMaster={isMaster} canManageUsers={canManageUsers} />

        </TabsContent>
        )}

        {allowedTabValues.has('temp-access') && (
        <TabsContent value="temp-access" className="mt-6">
          <TempAccessPanel token={token} isMaster={isMaster} />
        </TabsContent>
        )}

        {allowedTabValues.has('auth-diagnostics') && (
        <TabsContent value="auth-diagnostics" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Auth Diagnostics</CardTitle>
              <CardDescription>
                Copyable report of the most recent authentication failures and their diagnostic codes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {authDiagnostics.length} diagnostic entries loaded
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadAuthDiagnostics}
                  disabled={authDiagnosticsLoading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${authDiagnosticsLoading ? 'animate-spin' : ''}`} />
                  Refresh Diagnostics
                </Button>
              </div>
              <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                {authDiagnosticsLoading ? (
                  <div className="rounded-xl border p-4 text-sm text-muted-foreground">Loading diagnostics...</div>
                ) : authDiagnostics.length ? (
                  authDiagnostics.map((row) => (
                    <div key={row._id} className="rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{row.code}</Badge>
                            <Badge variant="secondary">{row.status}</Badge>
                            <span className="text-xs text-muted-foreground">{row.method}</span>
                            <span className="text-xs text-muted-foreground">{row.route}</span>
                          </div>
                          <div className="mt-2 text-sm font-medium">{row.message}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                            {row.email ? ` · ${row.email}` : ''}
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => copyAuthDiagnostic(row)}>
                          Copy JSON
                        </Button>
                      </div>
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
{JSON.stringify(row, null, 2)}
                      </pre>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border p-4 text-sm text-muted-foreground">No auth diagnostics captured yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {allowedTabValues.has('update') && (
        <TabsContent value="update" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Manual Opportunity Updates</CardTitle>
                <CardDescription>
                  Upload a workbook keyed by Avenir Ref to backfill blank synced fields. Synced sheet values always stay authoritative, and proper dates in the workbook are preserved while year-only cells remain year-only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">1. Build a template</p>
                    <p className="text-xs text-muted-foreground">Pick the columns your team wants to fill. `Avenir Ref` is always included because it drives the MongoDB mapping.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {MANUAL_UPDATE_TEMPLATE_COLUMNS.map((column) => (
                      <label key={column.key} className="flex items-start gap-3 rounded-lg border p-3">
                        <Checkbox
                          checked={column.required || Boolean(manualTemplateSelection[column.key])}
                          onCheckedChange={(checked) => toggleManualTemplateColumn(column.key, Boolean(checked))}
                          disabled={column.required}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{column.label}</span>
                            {column.required && <Badge variant="secondary">Required</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{column.help}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Template downloads as Excel and can be shared with the team for controlled updates.
                    </p>
                    <Button type="button" variant="outline" onClick={downloadManualUpdateTemplate}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">2. Upload completed workbook</p>
                    <p className="text-xs text-muted-foreground">The importer reads the first sheet, matches rows by Avenir Ref case-insensitively, and only backfills fields when the synced source is blank.</p>
                  </div>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleManualUpdateUpload}
                    disabled={!canManageManualUpdates || manualUpdateUploading}
                  />
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Latest file:
                    {' '}
                    {manualUpdateFileName || 'No workbook uploaded in this session'}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Importer rules:</p>
                    <p>1. Blank workbook cells do nothing.</p>
                    <p>2. Workbook values fill MongoDB only when the synced field is blank.</p>
                    <p>3. If a later Graph sync brings a different non-empty value, the synced value wins and becomes the new baseline.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Update Summary</CardTitle>
                <CardDescription>Quick check of what the last workbook upload changed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Workbook Rows</div>
                    <div className="mt-2 text-2xl font-semibold">{manualUpdateSummary?.receivedRows ?? 0}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Matched Refs</div>
                    <div className="mt-2 text-2xl font-semibold">{manualUpdateSummary?.matchedRows ?? 0}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Manual Records Saved</div>
                    <div className="mt-2 text-2xl font-semibold">{manualUpdateSummary?.manualDocsUpdated ?? 0}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Live Rows Patched</div>
                    <div className="mt-2 text-2xl font-semibold">{manualUpdateSummary?.syncedRowsPatched ?? 0}</div>
                  </div>
                </div>
                <Alert>
                  <Database className="h-4 w-4" />
                  <AlertDescription>
                    Use this page for controlled backfills only. It does not replace the normal Graph sync and does not modify your existing date parsing logic in the sync service.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

        {allowedTabValues.has('export') && (
        <TabsContent value="export" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Excel Export Template</CardTitle>
                <CardDescription>
                  Control the default title block, logo, intro copy, and heading styling used when dashboard exports are downloaded.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Sheet Name</Label>
                    <Input
                      value={exportTemplate.sheetName}
                      onChange={(e) => updateExportTemplateField('sheetName', e.target.value)}
                      placeholder="Opportunities"
                      disabled={!canManageExportTemplate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Export Title</Label>
                    <Input
                      value={exportTemplate.title}
                      onChange={(e) => updateExportTemplateField('title', e.target.value)}
                      placeholder="Opportunity Export"
                      disabled={!canManageExportTemplate}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Intro Text</Label>
                  <Textarea
                    value={exportTemplate.introText}
                    onChange={(e) => updateExportTemplateField('introText', e.target.value)}
                    placeholder="Add any default note, summary, or cover text that should appear above the table."
                    rows={4}
                    disabled={!canManageExportTemplate}
                  />
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Show logo in export</p>
                      <p className="text-xs text-muted-foreground">PNG and JPG logos work best for Excel export. Uploaded logos are now preserved as saved data URLs.</p>
                    </div>
                    <Switch
                      checked={exportTemplate.showLogo}
                      onCheckedChange={(checked) => updateExportTemplateField('showLogo', checked)}
                      disabled={!canManageExportTemplate}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Logo Preview</div>
                      <div className="flex min-h-[88px] items-center justify-center rounded-md bg-white p-3">
                        {exportTemplate.showLogo ? (
                          <img src={exportTemplateLogoPreview} alt="Export logo preview" className="max-h-16 w-auto object-contain" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Logo hidden</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="export-logo-upload">Upload Logo</Label>
                        <Input
                          id="export-logo-upload"
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={handleExportLogoUpload}
                          disabled={!canManageExportTemplate}
                        />
                      </div>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Source:
                        {' '}
                        {exportTemplate.logoDataUrl ? 'Custom logo saved in MongoDB' : 'Default Avenir logo'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateExportTemplateField('logoDataUrl', '')}
                          disabled={!canManageExportTemplate || !exportTemplate.logoDataUrl}
                        >
                          Use Default Logo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setExportTemplate(DEFAULT_EXPORT_TEMPLATE)}
                          disabled={!canManageExportTemplate}
                        >
                          Reset Template
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Excel Layout Designer</p>
                    <p className="text-xs text-muted-foreground">Pick a block, then place it on the sheet preview like Excel. You can merge by increasing row span and column span, adjust alignment, and fine-tune row and column sizing.</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Active Block</Label>
                      <Select value={selectedExportBlock} onValueChange={(value) => setSelectedExportBlock(value as typeof selectedExportBlock)}>
                        <SelectTrigger disabled={!canManageExportTemplate}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPORT_BLOCK_OPTIONS.map((option) => (
                            <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                      Click any cell in the sheet preview to move the selected block there.
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {selectedExportBlock === 'logo' ? (
                      <>
                        {[
                          ['logoRow', 'Logo Row'],
                          ['logoColumn', 'Logo Column'],
                          ['logoWidth', 'Logo Width'],
                          ['logoHeight', 'Logo Height'],
                        ].map(([field, label]) => (
                          <div key={field} className="space-y-2">
                            <Label>{label}</Label>
                            <Input
                              type="number"
                              value={String(exportTemplate[field as keyof ExportTemplateConfig] as number)}
                              onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, Number(e.target.value))}
                              disabled={!canManageExportTemplate}
                            />
                          </div>
                        ))}
                      </>
                    ) : selectedExportBlock === 'header' ? (
                      <>
                        {[
                          ['headerRow', 'Header Row'],
                          ['headerColumn', 'Header Column'],
                        ].map(([field, label]) => (
                          <div key={field} className="space-y-2">
                            <Label>{label}</Label>
                            <Input
                              type="number"
                              value={String(exportTemplate[field as keyof ExportTemplateConfig] as number)}
                              onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, Number(e.target.value))}
                              disabled={!canManageExportTemplate}
                            />
                          </div>
                        ))}
                        <div className="space-y-2">
                          <Label>Horizontal Align</Label>
                          <Select
                            value={exportTemplate.headerHorizontalAlign}
                            onValueChange={(value) => updateExportTemplateField('headerHorizontalAlign', value)}
                          >
                            <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Vertical Align</Label>
                          <Select
                            value={exportTemplate.headerVerticalAlign}
                            onValueChange={(value) => updateExportTemplateField('headerVerticalAlign', value)}
                          >
                            <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Top</SelectItem>
                              <SelectItem value="middle">Middle</SelectItem>
                              <SelectItem value="bottom">Bottom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <>
                        {selectedExportBlock === 'title' ? (
                          <>
                            {[
                              ['titleRow', 'Title Row'],
                              ['titleColumn', 'Title Column'],
                              ['titleRowSpan', 'Title Row Span'],
                              ['titleColumnSpan', 'Title Col Span'],
                            ].map(([field, label]) => (
                              <div key={field} className="space-y-2">
                                <Label>{label}</Label>
                                <Input
                                  type="number"
                                  value={String(exportTemplate[field as keyof ExportTemplateConfig] as number)}
                                  onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, Number(e.target.value))}
                                  disabled={!canManageExportTemplate}
                                />
                              </div>
                            ))}
                            <div className="space-y-2">
                              <Label>Horizontal Align</Label>
                              <Select
                                value={exportTemplate.titleHorizontalAlign}
                                onValueChange={(value) => updateExportTemplateField('titleHorizontalAlign', value)}
                              >
                                <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Vertical Align</Label>
                              <Select
                                value={exportTemplate.titleVerticalAlign}
                                onValueChange={(value) => updateExportTemplateField('titleVerticalAlign', value)}
                              >
                                <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="top">Top</SelectItem>
                                  <SelectItem value="middle">Middle</SelectItem>
                                  <SelectItem value="bottom">Bottom</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (
                          <>
                            {[
                              ['introRow', 'Intro Row'],
                              ['introColumn', 'Intro Column'],
                              ['introRowSpan', 'Intro Row Span'],
                              ['introColumnSpan', 'Intro Col Span'],
                            ].map(([field, label]) => (
                              <div key={field} className="space-y-2">
                                <Label>{label}</Label>
                                <Input
                                  type="number"
                                  value={String(exportTemplate[field as keyof ExportTemplateConfig] as number)}
                                  onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, Number(e.target.value))}
                                  disabled={!canManageExportTemplate}
                                />
                              </div>
                            ))}
                            <div className="space-y-2">
                              <Label>Horizontal Align</Label>
                              <Select
                                value={exportTemplate.introHorizontalAlign}
                                onValueChange={(value) => updateExportTemplateField('introHorizontalAlign', value)}
                              >
                                <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Vertical Align</Label>
                              <Select
                                value={exportTemplate.introVerticalAlign}
                                onValueChange={(value) => updateExportTemplateField('introVerticalAlign', value)}
                              >
                                <SelectTrigger disabled={!canManageExportTemplate}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="top">Top</SelectItem>
                                  <SelectItem value="middle">Middle</SelectItem>
                                  <SelectItem value="bottom">Bottom</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Sheet Dimensions</p>
                    <p className="text-xs text-muted-foreground">Fine tune the exact width of each column and the height of each row, similar to Excel sizing.</p>
                  </div>

                  <div className="space-y-3">
                    <Label>Column Widths</Label>
                    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                      {EXPORT_DESIGNER_COLUMNS.map((column, index) => (
                        <div key={column} className="space-y-1">
                          <Label className="text-xs">{column}</Label>
                          <Input
                            type="number"
                            value={String(exportTemplate.columnWidths[index] ?? 18)}
                            onChange={(e) => updateExportTemplateArrayField('columnWidths', index, Number(e.target.value))}
                            disabled={!canManageExportTemplate}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Row Heights</Label>
                    <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-5">
                      {EXPORT_DESIGNER_ROWS.map((row, index) => (
                        <div key={row} className="space-y-1">
                          <Label className="text-xs">Row {row}</Label>
                          <Input
                            type="number"
                            value={String(exportTemplate.rowHeights[index] ?? 24)}
                            onChange={(e) => updateExportTemplateArrayField('rowHeights', index, Number(e.target.value))}
                            disabled={!canManageExportTemplate}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['headerBackgroundColor', 'Header Background'],
                    ['headerTextColor', 'Header Text'],
                    ['titleColor', 'Title'],
                    ['introColor', 'Intro'],
                  ].map(([field, label]) => (
                    <div key={field} className="space-y-2">
                      <Label>{label}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={exportTemplate[field as keyof ExportTemplateConfig] as string}
                          onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, e.target.value)}
                          disabled={!canManageExportTemplate}
                          className="h-10 w-14 p-1"
                        />
                        <Input
                          value={exportTemplate[field as keyof ExportTemplateConfig] as string}
                          onChange={(e) => updateExportTemplateField(field as keyof ExportTemplateConfig, e.target.value)}
                          disabled={!canManageExportTemplate}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    These defaults apply to dashboard Excel exports and are stored in MongoDB.
                  </p>
                  <Button onClick={saveExportTemplateConfig} loading={exportTemplateSaving} disabled={!canManageExportTemplate}>
                    Save Export Template
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Live Excel Designer</CardTitle>
                <CardDescription>Use a real spreadsheet surface to drag, merge, and size your template. Move the marker cells, then apply the layout.</CardDescription>
              </CardHeader>
              <CardContent>
                <ExportTemplateSpreadsheet
                  exportTemplate={exportTemplate}
                  onTemplateChange={setExportTemplate}
                  canEdit={canManageExportTemplate}
                  previewHeaders={EXPORT_TEMPLATE_PREVIEW_HEADERS}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}


        {allowedTabValues.has('telecast') && (
        <TabsContent value="telecast" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Telecast Rules (Active)</CardTitle>
                <CardDescription>These rules are enforced by backend before any new-row telecast email is sent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="list-disc pl-5 text-xs sm:text-sm md:text-base space-y-1">
                  <li>Only tenders received within the last {notificationSyncStatus.alertWindowDays || 28} days are eligible.</li>
                  <li>If an existing row is edited, it is not treated as a new-row alert.</li>
                  <li>A tender that was already alerted is never sent again.</li>
                  <li>Historical tenders are seeded as already alerted and blocked from duplicate telecast.</li>
                </ul>
                <div className="rounded border p-3 text-xs sm:text-sm text-muted-foreground">
                  <p>Alert baseline seeded: {notificationSyncStatus.alertSeededAt ? new Date(notificationSyncStatus.alertSeededAt).toLocaleString() : 'not yet'}</p>
                  <p>Seeded tenders count: {notificationSyncStatus.alertSeededCount || 0}</p>
                  <p>Tracked alerted refs: {notificationSyncStatus.alertedRefNosTracked || 0} • tracked alerted keys: {notificationSyncStatus.alertedKeysTracked || 0}</p>
                </div>
                {(notificationSyncStatus.alertedRefNosPreview?.length || 0) > 0 && (
                  <div className="rounded border p-3 text-xs sm:text-sm">
                    <p className="font-medium mb-2">Recently tracked alerted Ref Nos (preview)</p>
                    <p className="text-muted-foreground break-words">{notificationSyncStatus.alertedRefNosPreview?.join(', ')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>EOI Duplicate Visibility Control</CardTitle>
                <CardDescription>
                  Controls default behavior for converted EOI duplicate rows. This setting is reversible and only changes default visibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Show converted EOI duplicates by default</p>
                    <p className="text-xs text-muted-foreground">
                      When disabled, EOI rows that already have converted tender rows are hidden by default in table view.
                    </p>
                  </div>
                  <Switch
                    checked={showConvertedEoiRowsDefault}
                    onCheckedChange={(checked) => setShowConvertedEoiRowsDefault(Boolean(checked))}
                  />
                </div>
                <Button onClick={saveEoiDuplicateConfig} loading={eoiDuplicateConfigSaving || configSaving}>
                  Save EOI Duplicate Visibility
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Telecast Debug (Latest Sync)</CardTitle>
                <CardDescription>Compares newly detected rows vs rows eligible for telecast (new + within the recent window).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded border p-3 text-xs sm:text-sm space-y-2">
                  <p className="font-medium">New rows (preview)</p>
                  {(notificationSyncStatus.lastNewRowsPreview?.length || 0) === 0 && (
                    <p className="text-muted-foreground">No new rows detected in the latest sync.</p>
                  )}
                  {(notificationSyncStatus.lastNewRowsPreview || []).slice(0, 12).map((row, idx) => (
                    <div key={`${row.signature || row.tenderNo || 'new'}-${idx}`} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
                      <p className="font-medium">{row.tenderNo || 'Unknown Ref'} • {row.tenderName || 'Untitled'}</p>
                      <p className="text-muted-foreground">Client: {row.client || 'N/A'} • Group: {row.group || 'N/A'} • Date: {row.dateTenderReceived || 'N/A'}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded border p-3 text-xs sm:text-sm space-y-2">
                  <p className="font-medium">Telecast-eligible rows (preview)</p>
                  {(notificationSyncStatus.telecastEligibleRowsPreview?.length || 0) === 0 && (
                    <p className="text-muted-foreground">No telecast-eligible rows from the latest sync.</p>
                  )}
                  {(notificationSyncStatus.telecastEligibleRowsPreview || []).slice(0, 12).map((row, idx) => (
                    <div key={`${row.signature || row.tenderNo || 'eligible'}-${idx}`} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
                      <p className="font-medium">{row.tenderNo || 'Unknown Ref'} • {row.tenderName || 'Untitled'}</p>
                      <p className="text-muted-foreground">Client: {row.client || 'N/A'} • Group: {row.group || 'N/A'} • Date: {row.dateTenderReceived || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Telecast
                </CardTitle>
                <CardDescription>Configure automated new-row notifications. Mail auth is server-side (ROPC via env vars).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 md:space-y-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base">
                  <span>Status:</span>
                  <Badge className={telecastMailReady ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                    {telecastMailReady ? 'Connected' : 'Not Connected'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">(ROPC env)</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weekly New-Row Tracker</CardTitle>
                <CardDescription>Tracks newly detected rows per week and per group.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {telecastWeeklyStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No weekly data yet.</p>
                  ) : telecastWeeklyStats.slice().reverse().map((week) => (
                    <div key={week.weekKey} className="border rounded p-2 sm:p-3 md:p-4 text-xs sm:text-sm md:text-base">
                      <div className="font-medium">{week.weekKey} ({week.startDate} to {week.endDate})</div>
                      <div className="text-muted-foreground">New rows: {week.newRowsCount}</div>
                      <div className="text-xs text-muted-foreground">GES: {week.byGroup?.GES || 0} • GDS: {week.byGroup?.GDS || 0} • GTS: {week.byGroup?.GTS || 0}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alert Flag Controls</CardTitle>
                <CardDescription>
                  `telecastAlerted=true` blocks sending. `telecastAlerted=false` allows sending on force refresh (if within {notificationSyncStatus.alertWindowDays || 28} days).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Button
                    onClick={markAllTelecastAlerted}
                    disabled={telecastBulkUpdating}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    Mark All `true`
                  </Button>
                  <Button
                    onClick={forceRefreshNotificationSync}
                    disabled={syncLoading}
                    className="w-full sm:w-auto"
                  >
                    {syncLoading ? 'Refreshing...' : 'Force Refresh'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Set Selected Ref Nos to `false`</p>
                  <Textarea
                    rows={5}
                    placeholder={'Paste Ref Nos separated by comma/newline\nExample:\nAC26095\nAC26096'}
                    value={telecastRefNosToUnalert}
                    onChange={(e) => setTelecastRefNosToUnalert(e.target.value)}
                    className="text-xs sm:text-sm"
                  />
                  <Button
                    onClick={markSelectedTelecastUnalerted}
                    disabled={telecastBulkUpdating}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    Apply Selected `false`
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Template & Recipients for New Rows</CardTitle>
                <CardDescription>Use keywords in template, choose a visual message style, and map recipients by group. New-row emails are sent to the recipients of the detected row group.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Message Style</p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {telecastTemplateStyles.map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        onClick={() => setTelecastTemplateStyle(style.key)}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${telecastTemplateStyle === style.key ? 'border-primary ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="h-20 px-4 py-3 text-white" style={{ background: style.colors.headerGradient }}>
                          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">Avenir Telecast</p>
                          <p className="mt-2 text-base font-semibold">{style.label}</p>
                        </div>
                        <div className="p-4 space-y-2" style={{ backgroundColor: style.colors.pageBg }}>
                          <div className="rounded-lg border px-3 py-2 text-xs" style={{ backgroundColor: style.colors.summaryBg, borderColor: style.colors.summaryBorder, color: style.colors.summaryText }}>
                            Summary block preview
                          </div>
                          <p className="text-xs text-muted-foreground">{style.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" value={telecastTemplateSubject} onChange={(e) => setTelecastTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Body Template</p>
                  <Textarea rows={8} className="text-xs sm:text-sm md:text-base" value={telecastTemplateBody} onChange={(e) => setTelecastTemplateBody(e.target.value)} />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-sm font-medium">Delay Between Telecast Emails (minutes)</p>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base"
                    value={telecastSendDelayMinutes}
                    onChange={(e) => setTelecastSendDelayMinutes(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <p className="text-xs text-muted-foreground">Applies between each tender alert mail.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Live Preview</p>
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: selectedTelecastTemplateStyle.colors.cardBorder, backgroundColor: selectedTelecastTemplateStyle.colors.pageBg }}>
                    <div className="px-5 py-4 text-white" style={{ background: selectedTelecastTemplateStyle.colors.headerGradient }}>
                      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Avenir Telecast</p>
                      <p className="mt-2 text-lg font-semibold">⚠ {telecastPreviewSubject}</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-sm text-slate-600 whitespace-pre-line">{telecastPreviewBody}</div>
                      <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: selectedTelecastTemplateStyle.colors.summaryBg, borderColor: selectedTelecastTemplateStyle.colors.summaryBorder, color: selectedTelecastTemplateStyle.colors.summaryText }}>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Summary</p>
                        <div className="mt-3 rounded-lg border overflow-hidden bg-white">
                          <div className="grid grid-cols-[180px_minmax(0,1fr)] text-xs">
                            {[
                              ['Tender Ref', SAMPLE_TELECAST_VALUES.TENDER_NO],
                              ['Tender Name', SAMPLE_TELECAST_VALUES.TENDER_NAME],
                              ['Client', SAMPLE_TELECAST_VALUES.CLIENT],
                              ['Group', SAMPLE_TELECAST_VALUES.GROUP],
                              ['Tender Type', SAMPLE_TELECAST_VALUES.TENDER_TYPE],
                              ['Date Received', SAMPLE_TELECAST_VALUES.DATE_TENDER_RECD],
                              ['Lead', SAMPLE_TELECAST_VALUES.LEAD],
                            ].map(([label, value], index) => (
                              <div key={label} className="contents">
                                <div
                                  className="px-3 py-2 font-semibold uppercase tracking-[0.14em] border-b"
                                  style={{ backgroundColor: selectedTelecastTemplateStyle.colors.tableHeaderBg, color: selectedTelecastTemplateStyle.colors.tableHeaderText }}
                                >
                                  {label}
                                </div>
                                <div
                                  className="px-3 py-2 border-b text-slate-900"
                                  style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : selectedTelecastTemplateStyle.colors.tableRowAlt }}
                                >
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  {(['GES', 'GDS', 'GTS'] as const).map((group) => (
                    <div key={group} className="space-y-1">
                      <RecipientBlockSelector
                        group={group}
                        selectedEmails={telecastGroupRecipients[group]}
                        onSelectionChange={(emails) => setTelecastGroupRecipients((prev) => ({ ...prev, [group]: emails }))}
                        allUsers={telecastRecipientUsers}
                        disabled={configSaving}
                      />
                    </div>
                  ))}
                </div>
                <div className="rounded border p-3 text-xs">
                  <p className="font-semibold mb-1">Supported keywords (exact):</p>
                  <p>{(telecastKeywords.length ? telecastKeywords : ['{{TENDER_NO}}','{{TENDER_NAME}}','{{CLIENT}}','{{GROUP}}','{{TENDER_TYPE}}','{{DATE_TENDER_RECD}}','{{SUBMISSION_DATE}}','{{YEAR}}','{{LEAD}}','{{OPPORTUNITY_ID}}','{{COMMENTS}}']).join(', ')}</p>
                </div>
                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save Template & Recipients</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Send Test Mail</CardTitle>
                <CardDescription>Sends the current telecast subject and body template to the entered email using sample tender values so you can review the final alert exactly as recipients would see it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3 md:space-y-4">
                <p className="text-xs sm:text-sm md:text-base font-medium">Recipient Email</p>
                <Input type="email" className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" placeholder="name@company.com" value={telecastRecipientEmail} onChange={(e) => setTelecastRecipientEmail(e.target.value)} />
                <Button onClick={sendTelecastTestMail} loading={telecastSending} disabled={!telecastMailReady} className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  Send Template Preview
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Approval Telecast</CardTitle>
                <CardDescription>When enabled, sends the group SVP an automated alert as soon as the Tender Manager approves a tender.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable Approval Alert</p>
                    <p className="text-xs text-muted-foreground">Disabled means no SVP approval alert will be sent after Tender Manager approval.</p>
                  </div>
                  <Switch checked={approvalAlertEnabled} onCheckedChange={setApprovalAlertEnabled} disabled={configSaving} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Message Style</p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {telecastTemplateStyles.map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        onClick={() => setApprovalTemplateStyle(style.key)}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${approvalTemplateStyle === style.key ? 'border-primary ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="h-20 px-4 py-3 text-white" style={{ background: style.colors.headerGradient }}>
                          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">Avenir Approval Telecast</p>
                          <p className="mt-2 text-base font-semibold">{style.label}</p>
                        </div>
                        <div className="p-4 space-y-2" style={{ backgroundColor: style.colors.pageBg }}>
                          <div className="rounded-lg border px-3 py-2 text-xs" style={{ backgroundColor: style.colors.summaryBg, borderColor: style.colors.summaryBorder, color: style.colors.summaryText }}>
                            Approval summary preview
                          </div>
                          <p className="text-xs text-muted-foreground">{style.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" value={approvalTemplateSubject} onChange={(e) => setApprovalTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Body Template</p>
                  <Textarea rows={6} className="text-xs sm:text-sm md:text-base" value={approvalTemplateBody} onChange={(e) => setApprovalTemplateBody(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Live Preview</p>
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: selectedApprovalTemplateStyle.colors.cardBorder, backgroundColor: selectedApprovalTemplateStyle.colors.pageBg }}>
                    <div className="px-5 py-4 text-white" style={{ background: selectedApprovalTemplateStyle.colors.headerGradient }}>
                      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Avenir Approval Telecast</p>
                      <p className="mt-2 text-lg font-semibold">✅ {approvalPreviewSubject}</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-sm text-slate-600 whitespace-pre-line">{approvalPreviewBody}</div>
                      <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: selectedApprovalTemplateStyle.colors.summaryBg, borderColor: selectedApprovalTemplateStyle.colors.summaryBorder, color: selectedApprovalTemplateStyle.colors.summaryText }}>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Summary</p>
                        <div className="mt-3 rounded-lg border overflow-hidden bg-white">
                          <div className="grid grid-cols-[180px_minmax(0,1fr)] text-xs">
                            {[
                              ['Tender Ref', SAMPLE_TELECAST_VALUES.TENDER_NO],
                              ['Tender Name', SAMPLE_TELECAST_VALUES.TENDER_NAME],
                              ['Client', SAMPLE_TELECAST_VALUES.CLIENT],
                              ['Group', SAMPLE_TELECAST_VALUES.GROUP],
                              ['Tender Type', SAMPLE_TELECAST_VALUES.TENDER_TYPE],
                              ['Date Received', SAMPLE_TELECAST_VALUES.DATE_TENDER_RECD],
                              ['Lead', SAMPLE_TELECAST_VALUES.LEAD],
                            ].map(([label, value], index) => (
                              <div key={label} className="contents">
                                <div className="px-3 py-2 font-semibold uppercase tracking-[0.14em] border-b" style={{ backgroundColor: selectedApprovalTemplateStyle.colors.tableHeaderBg, color: selectedApprovalTemplateStyle.colors.tableHeaderText }}>
                                  {label}
                                </div>
                                <div className="px-3 py-2 border-b text-slate-900" style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : selectedApprovalTemplateStyle.colors.tableRowAlt }}>
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                    Save Approval Alert
                  </Button>
                  <Button
                    onClick={sendApprovalTestMail}
                    loading={approvalTemplateSending}
                    disabled={!telecastMailReady || !telecastRecipientEmail}
                    variant="outline"
                    className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                  >
                    Send Approval Template Preview
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Award Event Telecast</CardTitle>
                <CardDescription>Sends exactly one alert when a tender transitions to AWARDED.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable Award Alert</p>
                    <p className="text-xs text-muted-foreground">Triggers only on status transition to AWARDED and is deduplicated per award event.</p>
                  </div>
                  <Switch checked={awardAlertEnabled} onCheckedChange={setAwardAlertEnabled} disabled={configSaving} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Role Recipients</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ROLE_OPTIONS.map((role) => {
                      const checked = awardRoleRecipients.includes(role);
                      return (
                        <label key={role} className="inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              setAwardRoleRecipients((prev) => {
                                if (next) return Array.from(new Set([...prev, role]));
                                return prev.filter((item) => item !== role);
                              });
                            }}
                            disabled={configSaving}
                          />
                          {role}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(['GES', 'GDS', 'GTS'] as const).map((group) => (
                    <RecipientBlockSelector
                      key={group}
                      group={group}
                      selectedEmails={awardGroupRecipients[group]}
                      onSelectionChange={(emails) => setAwardGroupRecipients((prev) => ({ ...prev, [group]: emails }))}
                      allUsers={telecastRecipientUsers}
                      disabled={configSaving}
                    />
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" value={awardTemplateSubject} onChange={(e) => setAwardTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Body Template</p>
                  <Textarea rows={5} className="text-xs sm:text-sm md:text-base" value={awardTemplateBody} onChange={(e) => setAwardTemplateBody(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Message Style</p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {telecastTemplateStyles.map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        onClick={() => setAwardTemplateStyle(style.key)}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${awardTemplateStyle === style.key ? 'border-primary ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="h-20 px-4 py-3 text-white" style={{ background: style.colors.headerGradient }}>
                          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">Award Event</p>
                          <p className="mt-2 text-base font-semibold">{style.label}</p>
                        </div>
                        <div className="p-4 space-y-2" style={{ backgroundColor: style.colors.pageBg }}>
                          <p className="text-xs text-muted-foreground">{style.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: selectedAwardTemplateStyle.colors.cardBorder, backgroundColor: selectedAwardTemplateStyle.colors.pageBg }}>
                  <div className="px-5 py-4 text-white" style={{ background: selectedAwardTemplateStyle.colors.headerGradient }}>
                    <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Avenir Award Telecast</p>
                    <p className="mt-2 text-lg font-semibold">🏆 {awardPreviewSubject}</p>
                  </div>
                  <div className="p-5 text-sm text-slate-600 whitespace-pre-line">{awardPreviewBody}</div>
                </div>

                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  Save Award Alert
                </Button>
              </CardContent>
            </Card>

            {/* F7 — TL Assignment Alert */}
            <Card>
              <CardHeader>
                <CardTitle>TL Assignment Alert (F7)</CardTitle>
                <CardDescription>Sends a batch email to the SVP of each vertical when awarded tenders need a Team Lead assigned. Recipients are auto-detected from the SVP user directory by group.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable TL Assignment Alert</p>
                    <p className="text-xs text-muted-foreground">Fires once per award event per group. Enable seeding below before turning this on to avoid backfill emails.</p>
                  </div>
                  <Switch checked={tlAssignAlertEnabled} onCheckedChange={setTlAssignAlertEnabled} disabled={configSaving} />
                </div>
                <div className="flex items-center gap-3 rounded-xl border p-4 bg-slate-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Seed Existing Awards</p>
                    <p className="text-xs text-muted-foreground">{tlAssignSeededAt ? `Seeded at: ${new Date(tlAssignSeededAt).toLocaleString()}` : 'Not seeded yet — run this before enabling to avoid backfill emails.'}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={seedAwardAlerts} disabled={awardAssignSeedBusy}>{awardAssignSeedBusy ? 'Seeding…' : 'Seed Now'}</Button>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <p className="text-xs text-muted-foreground">Use <code>{'{{GROUP}}'}</code> for the vertical name.</p>
                  <Input value={tlAssignTemplateSubject} onChange={e => setTlAssignTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Intro Body Text</p>
                  <Textarea rows={3} value={tlAssignTemplateBody} onChange={e => setTlAssignTemplateBody(e.target.value)} />
                </div>
                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save TL Alert Settings</Button>
              </CardContent>
            </Card>

            {/* F27 — PM Assignment Alert */}
            <Card>
              <CardHeader>
                <CardTitle>PM Assignment Alert (F27)</CardTitle>
                <CardDescription>Sends a batch email to the SVP of each vertical when awarded tenders need a Project Manager assigned. Fires together with the TL alert on award detection.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable PM Assignment Alert</p>
                    <p className="text-xs text-muted-foreground">Fires once per award event per group. Uses the same seeded data as the TL alert.</p>
                  </div>
                  <Switch checked={pmAssignAlertEnabled} onCheckedChange={setPmAssignAlertEnabled} disabled={configSaving} />
                </div>
                <div className="flex items-center gap-3 rounded-xl border p-4 bg-slate-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Seed Status</p>
                    <p className="text-xs text-muted-foreground">{pmAssignSeededAt ? `Seeded at: ${new Date(pmAssignSeededAt).toLocaleString()}` : 'Not seeded yet — use the "Seed Now" button in the TL Alert section above.'}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input value={pmAssignTemplateSubject} onChange={e => setPmAssignTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Intro Body Text</p>
                  <Textarea rows={3} value={pmAssignTemplateBody} onChange={e => setPmAssignTemplateBody(e.target.value)} />
                </div>
                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save PM Alert Settings</Button>
              </CardContent>
            </Card>

            {/* F16 — Lead Notification */}
            <Card>
              <CardHeader>
                <CardTitle>Lead Notification (F16)</CardTitle>
                <CardDescription>Sends a notification to a configurable recipient list when a row matches the selected trigger. Uses the standard Telecast email format.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable Lead Notifications</p>
                    <p className="text-xs text-muted-foreground">Fires once per row per trigger condition. Seed first to avoid backfill emails.</p>
                  </div>
                  <Switch checked={leadNotifEnabled} onCheckedChange={setLeadNotifEnabled} disabled={configSaving} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Trigger Type</p>
                  <select
                    value={leadNotifTrigger}
                    onChange={e => setLeadNotifTrigger(e.target.value as 'new_row' | 'awarded' | 'any_stage')}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="new_row">New Row from Sheet Upload</option>
                    <option value="awarded">Transition to AWARDED</option>
                    <option value="any_stage">Any Row (all unnotified)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Recipients</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add email…"
                      value={leadNotifEmailInput}
                      onChange={e => setLeadNotifEmailInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && leadNotifEmailInput.trim()) {
                          setLeadNotifRecipients(r => Array.from(new Set([...r, leadNotifEmailInput.trim()])));
                          setLeadNotifEmailInput('');
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={() => { if (leadNotifEmailInput.trim()) { setLeadNotifRecipients(r => Array.from(new Set([...r, leadNotifEmailInput.trim()]))); setLeadNotifEmailInput(''); } }}>Add</Button>
                  </div>
                  {leadNotifRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {leadNotifRecipients.map(email => (
                        <span key={email} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">
                          {email}
                          <button onClick={() => setLeadNotifRecipients(r => r.filter(e => e !== email))} className="text-slate-400 hover:text-red-500">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 rounded-xl border p-4 bg-slate-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Seed Existing Rows</p>
                    <p className="text-xs text-muted-foreground">{leadNotifSeededAt ? `Seeded at: ${new Date(leadNotifSeededAt).toLocaleString()}` : 'Not seeded yet — run before enabling to avoid backfill emails.'}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={seedLeadNotif} disabled={leadNotifSeedBusy}>{leadNotifSeedBusy ? 'Seeding…' : 'Seed Now'}</Button>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input value={leadNotifTemplateSubject} onChange={e => setLeadNotifTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Body Template</p>
                  <Textarea rows={3} value={leadNotifTemplateBody} onChange={e => setLeadNotifTemplateBody(e.target.value)} />
                </div>
                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save Lead Notification Settings</Button>
              </CardContent>
            </Card>

            {/* F22 — Award Value Report */}
            <Card>
              <CardHeader>
                <CardTitle>Award Value Report (F22)</CardTitle>
                <CardDescription>Manually send an Excel report listing all AWARDED tenders with missing/zero value to all Master-role users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-600">The report will include all awarded tenders where the opportunity value, framework value, and call-off value are all empty or zero. The Excel file is sent as an attachment to all approved Master accounts.</p>
                <Button onClick={sendAwardValueReport} disabled={awardReportSending} className="gap-2">
                  {awardReportSending ? 'Sending…' : 'Send Award Value Report to Masters'}
                </Button>
              </CardContent>
            </Card>

            {/* F25 — Top Performer Card Visibility */}
            <Card>
              <CardHeader>
                <CardTitle>Top Performer KPI Card (F25)</CardTitle>
                <CardDescription>Control who can see the Top Performer card on the Dashboard. Master users always see it. Toggle to show it to all users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Show Top Performer Card for All Users</p>
                    <p className="text-xs text-muted-foreground">When off, only Master-role users see the card.</p>
                  </div>
                  <Switch checked={topPerformerCardVisible} onCheckedChange={setTopPerformerCardVisible} disabled={configSaving} />
                </div>
                <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save Visibility Setting</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deadline Alert (Team Lead)</CardTitle>
                <CardDescription>Sends a reminder one day before the submission deadline to the assigned lead email. You can restrict which clients trigger this alert.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Enable Deadline Alerts</p>
                    <p className="text-xs text-muted-foreground">Alerts are sent only when a lead email is assigned and the deadline is tomorrow.</p>
                  </div>
                  <Switch checked={deadlineAlertEnabled} onCheckedChange={setDeadlineAlertEnabled} disabled={configSaving} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Out-of-the-box Templates</p>
                  <div className="flex flex-wrap gap-2">
                    {DEADLINE_TEMPLATE_PRESETS.map((preset) => (
                      <Button
                        key={preset.key}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDeadlineTemplateSubject(preset.subject);
                          setDeadlineTemplateBody(preset.body);
                          setDeadlineTemplateStyle(preset.style);
                        }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Message Style</p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {telecastTemplateStyles.map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        onClick={() => setDeadlineTemplateStyle(style.key)}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${deadlineTemplateStyle === style.key ? 'border-primary ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="h-20 px-4 py-3 text-white" style={{ background: style.colors.headerGradient }}>
                          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">Deadline Alert</p>
                          <p className="mt-2 text-base font-semibold">{style.label}</p>
                        </div>
                        <div className="p-4 space-y-2" style={{ backgroundColor: style.colors.pageBg }}>
                          <div className="rounded-lg border px-3 py-2 text-xs" style={{ backgroundColor: style.colors.summaryBg, borderColor: style.colors.summaryBorder, color: style.colors.summaryText }}>
                            Deadline preview block
                          </div>
                          <p className="text-xs text-muted-foreground">{style.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject Template</p>
                  <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" value={deadlineTemplateSubject} onChange={(e) => setDeadlineTemplateSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Body Template</p>
                  <Textarea rows={6} className="text-xs sm:text-sm md:text-base" value={deadlineTemplateBody} onChange={(e) => setDeadlineTemplateBody(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Live Preview</p>
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: selectedDeadlineTemplateStyle.colors.cardBorder, backgroundColor: selectedDeadlineTemplateStyle.colors.pageBg }}>
                    <div className="px-5 py-4 text-white" style={{ background: selectedDeadlineTemplateStyle.colors.headerGradient }}>
                      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Deadline Alert</p>
                      <p className="mt-2 text-lg font-semibold">⏰ {deadlinePreviewSubject}</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-sm text-slate-600 whitespace-pre-line">{deadlinePreviewBody}</div>
                      <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: selectedDeadlineTemplateStyle.colors.summaryBg, borderColor: selectedDeadlineTemplateStyle.colors.summaryBorder, color: selectedDeadlineTemplateStyle.colors.summaryText }}>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Summary</p>
                        <div className="mt-3 rounded-lg border overflow-hidden bg-white">
                          <div className="grid grid-cols-[180px_minmax(0,1fr)] text-xs">
                            {[
                              ['Tender Ref', SAMPLE_TELECAST_VALUES.TENDER_NO],
                              ['Tender Name', SAMPLE_TELECAST_VALUES.TENDER_NAME],
                              ['Client', SAMPLE_TELECAST_VALUES.CLIENT],
                              ['Deadline', SAMPLE_TELECAST_VALUES.SUBMISSION_DATE],
                              ['Lead', SAMPLE_TELECAST_VALUES.LEAD],
                            ].map(([label, value], index) => (
                              <div key={label} className="contents">
                                <div
                                  className="px-3 py-2 font-semibold uppercase tracking-[0.14em] border-b"
                                  style={{ backgroundColor: selectedDeadlineTemplateStyle.colors.tableHeaderBg, color: selectedDeadlineTemplateStyle.colors.tableHeaderText }}
                                >
                                  {label}
                                </div>
                                <div
                                  className="px-3 py-2 border-b text-slate-900"
                                  style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : selectedDeadlineTemplateStyle.colors.tableRowAlt }}
                                >
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Client Filters</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{deadlineAlertClients.length} selected</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeadlineAlertClients([])}
                        disabled={!deadlineAlertClients.length}
                      >
                        Clear all
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Search clients..."
                    value={deadlineClientQuery}
                    onChange={(e) => setDeadlineClientQuery(e.target.value)}
                    className="h-9 text-xs sm:text-sm"
                  />
                  <div className="rounded-lg border p-3 max-h-48 overflow-y-auto space-y-2">
                    {filteredDeadlineClients.length === 0 && (
                      <p className="text-xs text-muted-foreground">No clients match your search.</p>
                    )}
                    {filteredDeadlineClients.map((client) => (
                      <label key={client} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={deadlineAlertClients.includes(client)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setDeadlineAlertClients((prev) => [...prev, client]);
                            } else {
                              setDeadlineAlertClients((prev) => prev.filter((value) => value !== client));
                            }
                          }}
                        />
                        <span className="truncate">{client}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">If no clients are selected, all clients are eligible for deadline alerts.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={saveTelecastConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                    Save Deadline Alert
                  </Button>
                  <Button
                    onClick={sendDeadlineTestMail}
                    loading={deadlineTestSending}
                    disabled={!telecastMailReady || !telecastRecipientEmail}
                    variant="outline"
                    className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                  >
                    Send Deadline Template Preview
                  </Button>
                  <Button
                    onClick={loadDeadlineStatus}
                    variant="ghost"
                    className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                    loading={deadlineStatusLoading}
                  >
                    Refresh Deadline Status
                  </Button>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Tomorrow’s Deadlines</p>
                    <span className="text-xs text-muted-foreground">{deadlineStatusDate || '—'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ref No</TableHead>
                          <TableHead>Tender</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Lead</TableHead>
                          <TableHead>Lead Email</TableHead>
                          <TableHead>Submission</TableHead>
                          <TableHead>Sent</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deadlineStatusRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                              No deadlines for tomorrow.
                            </TableCell>
                          </TableRow>
                        )}
                        {deadlineStatusRows.map((row) => {
                          const reasonBadge = getDeadlineReasonBadge(row.reason);
                          return (
                            <TableRow key={`${row.refNo}-${row.leadEmail}`}>
                              <TableCell className="font-mono text-xs">{row.refNo || '—'}</TableCell>
                              <TableCell className="max-w-[220px] truncate">{row.tenderName || '—'}</TableCell>
                              <TableCell className="max-w-[160px] truncate">{row.clientName || '—'}</TableCell>
                              <TableCell className="max-w-[140px] truncate">{row.leadName || '—'}</TableCell>
                              <TableCell className="font-mono text-xs">{row.leadEmail || '—'}</TableCell>
                              <TableCell className="text-xs">{row.submissionDate || '—'}</TableCell>
                              <TableCell>
                                <Badge variant={row.sent ? 'default' : 'secondary'}>
                                  {row.sent ? 'Sent' : 'Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={reasonBadge.variant}>{reasonBadge.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issue Reporting Template Style</CardTitle>
                <CardDescription>Choose the visual theme used for dashboard issue-report emails sent to Master users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {issueReportTemplateStyles.map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      onClick={() => setIssueReportTemplateStyle(style.key)}
                      className={`rounded-xl border text-left transition-all overflow-hidden ${issueReportTemplateStyle === style.key ? 'border-primary ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/40'}`}
                    >
                      <div className="h-20 px-4 py-3 text-white" style={{ background: style.colors.headerGradient }}>
                        <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">Avenir Reporting</p>
                        <p className="mt-2 text-base font-semibold">{style.label}</p>
                      </div>
                      <div className="p-4 space-y-2" style={{ backgroundColor: style.colors.pageBg }}>
                        <div className="rounded-lg border px-3 py-2 text-xs" style={{ backgroundColor: style.colors.tableHeaderBg, borderColor: style.colors.cardBorder, color: style.colors.tableHeaderText }}>
                          Issue report table preview
                        </div>
                        <p className="text-xs text-muted-foreground">{style.description}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: selectedIssueReportTemplateStyle.colors.cardBorder, backgroundColor: selectedIssueReportTemplateStyle.colors.pageBg }}>
                  <div className="px-5 py-4 text-white" style={{ background: selectedIssueReportTemplateStyle.colors.headerGradient }}>
                    <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Avenir Reporting</p>
                    <p className="mt-2 text-lg font-semibold">Issue Report</p>
                  </div>
                  <div className="p-5">
                    <div className="rounded-xl border overflow-hidden bg-white">
                      <div className="grid grid-cols-[180px_minmax(0,1fr)] text-xs">
                        {[
                          ['Reporter', 'Avenir User (Admin)'],
                          ['Email', 'user@avenirengineering.com'],
                          ['Page', '/dashboard'],
                          ['Issue Type(s)', 'Data mismatch, Not working properly'],
                          ['Feature', 'Dashboard'],
                          ['Comments', 'KPI count does not match the filtered table output.'],
                        ].map(([label, value], index) => (
                          <div key={label} className="contents">
                            <div
                              className="px-3 py-2 font-semibold uppercase tracking-[0.14em] border-b"
                              style={{ backgroundColor: selectedIssueReportTemplateStyle.colors.tableHeaderBg, color: selectedIssueReportTemplateStyle.colors.tableHeaderText }}
                            >
                              {label}
                            </div>
                            <div
                              className="px-3 py-2 border-b"
                              style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : selectedIssueReportTemplateStyle.colors.tableRowAlt }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button onClick={saveReportingConfig} loading={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  Save Issue Reporting Style
                </Button>
                <Button
                  onClick={sendReportingTestMail}
                  loading={reportingTemplateSending}
                  disabled={!telecastMailReady || !telecastRecipientEmail}
                  variant="outline"
                  className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                >
                  Send Issue Template Preview
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

      </Tabs>
    </div>
  );
}
