import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock, Users, Trash2, CheckCircle, XCircle, Clock, RefreshCw, Download, Database, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect, useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_PAGE_ROLE_ACCESS, PAGE_GROUPS, PAGE_LABELS, PageKey } from '@/config/navigation';
import { UserRole } from '@/contexts/AuthContext';
import { ACTION_DESCRIPTIONS, ACTION_LABELS, ActionKey, DEFAULT_ACTION_ROLE_ACCESS } from '@/config/actionPermissions';
import { RecipientBlockSelector } from '@/components/Admin/RecipientBlockSelector';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ROLE_OPTIONS: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'];
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
  role: 'Master' | 'Admin' | 'ProposalHead' | 'SVP' | 'Basic' | 'MASTER' | 'PROPOSAL_HEAD';
  assignedGroup?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  lastLogin?: Date;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

interface LeadEmailSuggestion {
  _id: string;
  opportunityRefNo: string;
  tenderName: string;
  leadName: string;
  suggestedEmail: string;
  score?: number;
  suggestedBy?: 'auto' | 'manual';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  approvedAt?: string;
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
  YEAR: '2026',
  LEAD: 'arjun.s@avenirengineering.com',
  OPPORTUNITY_ID: 'telecast-preview',
  COMMENTS: 'Sample values inserted for preview.',
};

const renderTemplatePreview = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((output, [key, value]) => output.split(`{{${key}}}`).join(value), String(template || ''));

export default function Admin() {
  const { user, isMaster, token, pagePermissions, pageEmailPermissions, updatePagePermissions, canAccessPage, actionPermissions, actionEmailPermissions, updateActionPermissions, canPerformAction } = useAuth();
  const canAccessPanel = isMaster || user?.role === 'Admin';
  const navigate = useNavigate();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
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
  const [telecastSending, setTelecastSending] = useState(false);
  const [reportingTemplateSending, setReportingTemplateSending] = useState(false);
  const [telecastTemplateSubject, setTelecastTemplateSubject] = useState('New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [telecastTemplateBody, setTelecastTemplateBody] = useState('A new tender row was detected for {{CLIENT}} in {{GROUP}}.');
  const [telecastTemplateStyle, setTelecastTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [telecastTemplateStyles, setTelecastTemplateStyles] = useState<TelecastTemplateStyle[]>([DEFAULT_TELECAST_TEMPLATE_STYLE]);
  const [approvalAlertEnabled, setApprovalAlertEnabled] = useState(false);
  const [approvalTemplateSubject, setApprovalTemplateSubject] = useState('Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}');
  const [approvalTemplateBody, setApprovalTemplateBody] = useState('A tender has been approved by the Tender Manager and is ready for SVP review.');
  const [approvalTemplateStyle, setApprovalTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [approvalTemplateSending, setApprovalTemplateSending] = useState(false);
  const [issueReportTemplateStyle, setIssueReportTemplateStyle] = useState(DEFAULT_TELECAST_TEMPLATE_STYLE.key);
  const [issueReportTemplateStyles, setIssueReportTemplateStyles] = useState<TelecastTemplateStyle[]>([DEFAULT_TELECAST_TEMPLATE_STYLE]);
  const [telecastKeywords, setTelecastKeywords] = useState<string[]>([]);
  const [telecastWeeklyStats, setTelecastWeeklyStats] = useState<WeeklyTelecastStat[]>([]);
  const [telecastGroupRecipients, setTelecastGroupRecipients] = useState<Record<'GES' | 'GDS' | 'GTS', string[]>>({ GES: [], GDS: [], GTS: [] });
  const [telecastRefNosToUnalert, setTelecastRefNosToUnalert] = useState('');
  const [telecastBulkUpdating, setTelecastBulkUpdating] = useState(false);
  const [newAuthorizedUser, setNewAuthorizedUser] = useState<{ email: string; displayName: string; role: UserRole; assignedGroup: string; status: 'approved' | 'pending' }>({
    email: '',
    displayName: '',
    role: 'Basic',
    assignedGroup: 'GES',
    status: 'approved',
  });
  const [leadEmailSuggestions, setLeadEmailSuggestions] = useState<LeadEmailSuggestion[]>([]);
  const [leadEmailLoading, setLeadEmailLoading] = useState(false);
  const [leadEmailScanning, setLeadEmailScanning] = useState(false);
  const [manualLeadRefNo, setManualLeadRefNo] = useState('');
  const [manualLeadEmail, setManualLeadEmail] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [draftPagePermissions, setDraftPagePermissions] = useState<Record<PageKey, UserRole[]>>(DEFAULT_PAGE_ROLE_ACCESS as Record<PageKey, UserRole[]>);
  const [draftPageEmailPermissions, setDraftPageEmailPermissions] = useState<Record<PageKey, string[]>>({} as Record<PageKey, string[]>);
  const [draftActionPermissions, setDraftActionPermissions] = useState<Record<ActionKey, UserRole[]>>(DEFAULT_ACTION_ROLE_ACCESS as Record<ActionKey, UserRole[]>);
  const [draftActionEmailPermissions, setDraftActionEmailPermissions] = useState<Record<ActionKey, string[]>>({} as Record<ActionKey, string[]>);

  const tabConfig = useMemo(
    () => ([
      { value: 'general', label: 'General', pageKey: 'master_general' as PageKey },
      { value: 'users', label: 'User Management', pageKey: 'master_users' as PageKey },
      { value: 'data-sync', label: 'Data Sync', pageKey: 'master_data_sync' as PageKey },
      { value: 'telecast', label: '📣 Telecast', pageKey: 'master_telecast' as PageKey },
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

  useEffect(() => {
    if (canAccessPanel) {
      loadUsers();
      loadCollectionStats();
      loadGraphConfig();
      loadGraphAuthStatus();
      loadTelecastAuthStatus();
      loadTelecastConfig();
      loadReportingConfig();
      loadNotificationStatus();
      fetchConsentUrl();
    }
  }, [canAccessPanel, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canAccessPanel || !token) return;
    if (activeTab === 'users') {
      loadLeadEmailSuggestions();
    }
  }, [activeTab, canAccessPanel, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraftPagePermissions((pagePermissions || DEFAULT_PAGE_ROLE_ACCESS) as Record<PageKey, UserRole[]>);
  }, [pagePermissions]);

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

  const normalizeRecipientList = (value: unknown): string[] => {
    if (!value) return [];
    const list = Array.isArray(value) ? value : String(value).split(/[\n,;]+/g);
    return [...new Set(list.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];
  };

  const canManageLeadEmails = canPerformAction('lead_email_manage');

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

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data);
      console.log('✅ Loaded', data.length, 'authorized users');
    } catch (error) {
      console.error('❌ Error loading users:', error);
      setMessage({ type: 'error', text: 'Failed to load users: ' + (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const loadLeadEmailSuggestions = async () => {
    if (!token) return;
    setLeadEmailLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/lead-email/suggestions?status=pending', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load lead email suggestions');
      }
      const data = await response.json();
      setLeadEmailSuggestions(data);
    } catch (error) {
      console.error('❌ Error loading lead email suggestions:', error);
      toast.error((error as Error).message || 'Failed to load lead email suggestions');
    } finally {
      setLeadEmailLoading(false);
    }
  };

  const scanLeadEmailSuggestions = async () => {
    if (!token) return;
    setLeadEmailScanning(true);
    try {
      const response = await fetch(API_URL + '/opportunities/lead-email/suggestions/scan', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Lead email scan failed');
      }
      toast.success(`Created ${data.created || 0} new lead email suggestion(s).`);
      await loadLeadEmailSuggestions();
    } catch (error) {
      toast.error((error as Error).message || 'Lead email scan failed');
    } finally {
      setLeadEmailScanning(false);
    }
  };

  const approveLeadEmailSuggestion = async (id: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/opportunities/lead-email/suggestions/${id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Approval failed');
      }
      toast.success('Lead email approved and assigned.');
      await loadLeadEmailSuggestions();
    } catch (error) {
      toast.error((error as Error).message || 'Approval failed');
    }
  };

  const rejectLeadEmailSuggestion = async (id: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/opportunities/lead-email/suggestions/${id}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Reject failed');
      }
      toast.success('Lead email suggestion rejected.');
      await loadLeadEmailSuggestions();
    } catch (error) {
      toast.error((error as Error).message || 'Reject failed');
    }
  };

  const assignLeadEmailManual = async () => {
    if (!token) return;
    const ref = manualLeadRefNo.trim();
    const email = manualLeadEmail.trim().toLowerCase();
    if (!ref || !email) {
      toast.error('Opportunity ref no and email are required.');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/opportunities/lead-email/manual`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opportunityRefNo: ref, email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Manual assignment failed');
      }
      toast.success('Lead email assigned.');
      setManualLeadRefNo('');
      setManualLeadEmail('');
      await loadLeadEmailSuggestions();
    } catch (error) {
      toast.error((error as Error).message || 'Manual assignment failed');
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
      console.error('Error loading stats:', error);
    }
  };

  const syncFromGraphExcel = async () => {
    if (!token) return;
    setSyncLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/sync-graph', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(result, 'Failed to sync data'));
      }
      setMessage({ type: 'success', text: `✅ Synced ${result.count} tenders from Graph Excel (${result.newRowsCount || 0} new rows)` });
      await loadCollectionStats();
      await loadNotificationStatus();
      toast.success(`Synced ${result.count} tenders from Graph Excel (${result.newRowsCount || 0} new rows)`);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error syncing:', error);
      setMessage({ type: 'error', text: 'Failed to sync: ' + (error as Error).message });
      toast.error((error as Error).message);
    } finally {
      setSyncLoading(false);
    }
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
      console.error('Failed to load graph auth status:', error);
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
      });
    } catch (error) {
      console.error('Failed to load telecast auth status:', error);
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
      setTelecastTemplateSubject(data.templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}');
      setTelecastTemplateBody(data.templateBody || 'A new tender row was detected for {{CLIENT}} in {{GROUP}}.');
      setTelecastTemplateStyle(data.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setApprovalAlertEnabled(Boolean(data.approvalAlertEnabled));
      setApprovalTemplateSubject(data.approvalTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}');
      setApprovalTemplateBody(data.approvalTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.');
      setApprovalTemplateStyle(data.approvalTemplateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setTelecastTemplateStyles(Array.isArray(data.templateStyles) && data.templateStyles.length ? data.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
      setTelecastKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      setTelecastGroupRecipients({
        GES: normalizeRecipientList(data.groupRecipients?.GES),
        GDS: normalizeRecipientList(data.groupRecipients?.GDS),
        GTS: normalizeRecipientList(data.groupRecipients?.GTS),
      });
      setTelecastWeeklyStats(Array.isArray(data.weeklyStats) ? data.weeklyStats : []);
    } catch (error) {
      console.error('Failed to load telecast config:', error);
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
      setIssueReportTemplateStyle(data.templateStyle || DEFAULT_TELECAST_TEMPLATE_STYLE.key);
      setIssueReportTemplateStyles(Array.isArray(data.templateStyles) && data.templateStyles.length ? data.templateStyles : [DEFAULT_TELECAST_TEMPLATE_STYLE]);
    } catch (error) {
      console.error('Failed to load reporting config:', error);
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
      console.error('Failed to load notification status:', error);
    }
  };

  const forceRefreshNotificationSync = async () => {
    if (!token) return;
    setSyncLoading(true);
    try {
      const response = await fetch(API_URL + '/notifications/force-refresh', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(parseApiErrorPayload(data, 'Failed to force refresh notifications'));

      toast.success(data.message || `Force refresh complete. ${data.newRowsCount || 0} new rows detected.`);
      await loadNotificationStatus();
      await loadCollectionStats();
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
      console.error('Failed to load consent URL:', error);
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
      console.error('Failed to load graph config:', error);
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
      console.error('Failed to load worksheets:', error);
    }
  };


  const loadSheetsFromIds = async () => {
    if (!graphConfig.driveId || !graphConfig.fileId) {
      toast.error('Drive ID and File ID are required');
      return;
    }
    await loadWorksheets(graphConfig.driveId, graphConfig.fileId);
  };

  const resolveShareLink = async () => {
    if (!token || !graphConfig.shareLink) return;
    setConfigSaving(true);
    try {
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

      setGraphConfig((prev) => ({
        ...prev,
        driveId: data.driveId || prev.driveId,
        fileId: data.fileId || prev.fileId,
      }));
      await loadWorksheets(data.driveId, data.fileId);
      toast.success('Share link resolved successfully');
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(parseApiErrorPayload(data, 'Failed to preview rows'));
      }

      setPreviewRows(data.previewRows || []);
      toast.success('Preview loaded. Choose the header row below.');
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

      const response = await fetch(API_URL + '/graph/config', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save graph config');
      }

      setGraphConfig((prev) => ({ ...prev, ...(data.config || {}) }));
      toast.success('Graph configuration saved');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const approveUser = async (email: string) => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/users/approve', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve user');
      }

      setMessage({ type: 'success', text: '✅ User approved: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error approving user:', error);
      setMessage({ type: 'error', text: '❌ Failed to approve user: ' + (error as Error).message });
    }
  };

  const rejectUser = async (email: string) => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/users/reject', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject user');
      }

      setMessage({ type: 'success', text: '❌ User rejected: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error rejecting user:', error);
      setMessage({ type: 'error', text: '❌ Failed to reject user: ' + (error as Error).message });
    }
  };

  const changeUserRole = async (email: string, newRole: string, assignedGroup?: string | null) => {
    if (!token) return;
    setChangingRole(email);
    try {
      const response = await fetch(API_URL + '/users/change-role', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, newRole, assignedGroup: newRole === 'SVP' ? assignedGroup : null }),
      });

      if (!response.ok) {
        throw new Error('Failed to change role');
      }

      setMessage({ type: 'success', text: '🔄 User role changed to ' + newRole + ': ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error changing role:', error);
      setMessage({ type: 'error', text: '❌ Failed to change role: ' + (error as Error).message });
    } finally {
      setChangingRole(null);
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

  const savePagePermissions = async () => {
    try {
      await updatePagePermissions(draftPagePermissions, draftPageEmailPermissions);
      setMessage({ type: 'success', text: '✅ Page visibility permissions updated' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to save page permissions: ' + (error as Error).message });
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
    try {
      await updateActionPermissions(draftActionPermissions, draftActionEmailPermissions);
      setMessage({ type: 'success', text: '✅ Action permissions updated' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to save action permissions: ' + (error as Error).message });
    }
  };

  const removeUser = async (email: string) => {
    if (!token || !confirm('Are you sure you want to remove ' + email + '?')) return;
    try {
      const response = await fetch(API_URL + '/users/remove', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove user');
      }

      setMessage({ type: 'success', text: '🗑️ User removed: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error removing user:', error);
      setMessage({ type: 'error', text: '❌ Failed to remove user: ' + (error as Error).message });
    }
  };


  const addAuthorizedUser = async () => {
    if (!token) return;
    if (!newAuthorizedUser.email.trim()) {
      toast.error('Email is required');
      return;
    }
    try {
      const response = await fetch(API_URL + '/users/add', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAuthorizedUser),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add user');
      toast.success('Authorized user added/updated');
      setNewAuthorizedUser({ email: '', displayName: '', role: 'Basic', assignedGroup: 'GES', status: 'approved' });
      await loadUsers();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const saveTelecastConfig = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
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
          groupRecipients: {
            GES: normalizeRecipientList(telecastGroupRecipients.GES),
            GDS: normalizeRecipientList(telecastGroupRecipients.GDS),
            GTS: normalizeRecipientList(telecastGroupRecipients.GTS),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save telecast config');
      toast.success('Telecast template and recipients saved');
      await loadTelecastConfig();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfigSaving(false);
    }
  };

  const saveReportingConfig = async () => {
    if (!token) return;
    setConfigSaving(true);
    try {
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

      toast.success('Issue reporting template saved.');
      await loadReportingConfig();
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
      console.error('❌ Error cleaning logs:', error);
      setMessage({ type: 'error', text: '❌ Failed to cleanup logs: ' + (error as Error).message });
    }
  };


  const bootstrapTelecastAuth = async () => {
    if (!token || !telecastUsername || !telecastPassword) {
      toast.error('Telecast username and password are required');
      return;
    }

    setConfigSaving(true);
    try {
      const response = await fetch(API_URL + '/telecast/auth/bootstrap', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: telecastUsername, password: telecastPassword }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to connect telecast auth');

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto justify-start gap-1">
          {allowedTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {allowedTabValues.has('general') && (
        <TabsContent value="general">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </div>
        </TabsContent>
        )}

        {allowedTabValues.has('users') && (
        <TabsContent value="users">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Sidebar Page Visibility by Role</CardTitle>
              <CardDescription>Choose which roles can view each page in the sidebar and access its route.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3">Page</th>
                      {ROLE_OPTIONS.map((role) => (
                        <th key={role} className="text-center py-2 px-3">{role}</th>
                      ))}
                      <th className="text-left py-2 pl-3 min-w-[260px]">Custom Emails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAGE_GROUPS.map((group) => (
                      group.pages.map((pageKey, index) => (
                        <tr key={pageKey} className="border-b">
                          <td className="py-2 pr-3">
                            {index === 0 && (
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</div>
                            )}
                            <div className="font-medium">{PAGE_LABELS[pageKey]}</div>
                          </td>
                          {ROLE_OPTIONS.map((role) => (
                            <td key={role} className="text-center py-2 px-3">
                              <Checkbox
                                checked={(draftPagePermissions[pageKey] || []).includes(role)}
                                onCheckedChange={(checked) => togglePagePermission(pageKey, role, Boolean(checked))}
                                disabled={!isMaster}
                              />
                            </td>
                          ))}
                          <td className="py-2 pl-3">
                            <Input
                              value={(draftPageEmailPermissions[pageKey] || []).join(', ')}
                              onChange={(e) => updatePageEmailPermission(pageKey, e.target.value)}
                              placeholder="user1@company.com, user2@company.com"
                              disabled={!isMaster}
                              className="h-9 text-xs"
                            />
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
              {isMaster && (
                <div className="mt-4">
                  <Button onClick={savePagePermissions}>Save Page Permissions</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>MongoDB Write Permissions by Role</CardTitle>
              <CardDescription>Control which roles may perform write actions that persist changes into MongoDB.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3">Action</th>
                      {ROLE_OPTIONS.map((role) => (
                        <th key={role} className="text-center py-2 px-3">{role}</th>
                      ))}
                      <th className="text-left py-2 pl-3 min-w-[260px]">Custom Emails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(ACTION_LABELS) as ActionKey[]).map((actionKey) => (
                      <tr key={actionKey} className="border-b align-top">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{ACTION_LABELS[actionKey]}</div>
                          <div className="text-xs text-muted-foreground">{ACTION_DESCRIPTIONS[actionKey]}</div>
                        </td>
                        {ROLE_OPTIONS.map((role) => (
                          <td key={role} className="text-center py-2 px-3">
                            <Checkbox
                              checked={(draftActionPermissions[actionKey] || []).includes(role)}
                              onCheckedChange={(checked) => toggleActionPermission(actionKey, role, Boolean(checked))}
                              disabled={!isMaster}
                            />
                          </td>
                        ))}
                        <td className="py-2 pl-3">
                          <Input
                            value={(draftActionEmailPermissions[actionKey] || []).join(', ')}
                            onChange={(e) => updateActionEmailPermission(actionKey, e.target.value)}
                            placeholder="user1@company.com, user2@company.com"
                            disabled={!isMaster}
                            className="h-9 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isMaster && (
                <div className="mt-4">
                  <Button onClick={saveActionPermissions}>Save Action Permissions</Button>
                </div>
              )}
            </CardContent>
          </Card>


          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add Authorized User</CardTitle>
              <CardDescription>Create or update an authorized user directly from User Management.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Email</p>
                <Input value={newAuthorizedUser.email} onChange={(e) => setNewAuthorizedUser((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@company.com" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Display Name</p>
                <Input value={newAuthorizedUser.displayName} onChange={(e) => setNewAuthorizedUser((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Role</p>
                <Select value={newAuthorizedUser.role} onValueChange={(value: UserRole) => setNewAuthorizedUser((prev) => ({ ...prev, role: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="ProposalHead">Tender Manager</SelectItem>
                    <SelectItem value="SVP">SVP</SelectItem>
                    <SelectItem value="Basic">Basic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Status</p>
                <Select value={newAuthorizedUser.status} onValueChange={(value: 'approved' | 'pending') => setNewAuthorizedUser((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newAuthorizedUser.role === 'SVP' && (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-sm font-medium">SVP Group</p>
                  <Select value={newAuthorizedUser.assignedGroup} onValueChange={(value) => setNewAuthorizedUser((prev) => ({ ...prev, assignedGroup: value }))}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GROUP_OPTIONS.map((group) => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2">
                <Button onClick={addAuthorizedUser}>Add / Update Authorized User</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle>Authorized Users ({users.length})</CardTitle>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadUsers}
                        disabled={loading}
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reload user list</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cleanupLogs}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Cleanup Logs
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete login logs older than 15 days</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u._id}>
                        <TableCell className="font-mono text-sm">{u.email}</TableCell>
                        <TableCell>
                          {isMaster || u.role !== 'Master' ? (
                            <>
                              <Select
                                value={u.role}
                                onValueChange={(newRole) => {
                                  if (newRole === 'SVP') {
                                    changeUserRole(u.email, newRole, (u.assignedGroup || 'GES').toUpperCase());
                                    return;
                                  }
                                  changeUserRole(u.email, newRole);
                                }}
                                disabled={changingRole === u.email}
                              >
                                <SelectTrigger className="w-[140px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {isMaster && <SelectItem value="Master">Master</SelectItem>}
                                  <SelectItem value="Admin">Admin</SelectItem>
                                  <SelectItem value="ProposalHead">Tender Manager</SelectItem>
                                  <SelectItem value="SVP">SVP</SelectItem>
                                  <SelectItem value="Basic">Basic</SelectItem>
                                </SelectContent>
                              </Select>
                              {u.role === 'SVP' && (
                                <Select
                                  value={(u.assignedGroup || 'GES').toUpperCase()}
                                  onValueChange={(group) => changeUserRole(u.email, 'SVP', group)}
                                  disabled={changingRole === u.email}
                                >
                                  <SelectTrigger className="w-[100px] h-8 mt-2">
                                    <SelectValue placeholder="Group" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {GROUP_OPTIONS.map((group) => (
                                      <SelectItem key={group} value={group}>{group}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline">Master</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.status === 'approved' && (
                              <Badge className="bg-success/20 text-success gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Approved
                              </Badge>
                            )}
                            {u.status === 'pending' && (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                            {u.status === 'rejected' && (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.status === 'pending' && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => approveUser(u.email)}
                                      className="h-8 px-2 gap-1"
                                    >
                                      <CheckCircle className="h-3 w-3" />
                                      Approve
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Approve this user</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => rejectUser(u.email)}
                                      className="h-8 px-2 gap-1"
                                    >
                                      <XCircle className="h-3 w-3" />
                                      Reject
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject this user</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            {u.status === 'approved' && u.role !== 'Master' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeUser(u.email)}
                                    className="h-8 px-2 gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove this user</TooltipContent>
                              </Tooltip>
                            )}
                            {u.status === 'rejected' && u.role !== 'Master' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeUser(u.email)}
                                    className="h-8 px-2 gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete this user record</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Lead Email Assignments</CardTitle>
              <CardDescription>Auto-suggest and approve lead emails for opportunities. Approved emails are stored on each opportunity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    onClick={scanLeadEmailSuggestions}
                    disabled={!canManageLeadEmails || leadEmailScanning}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${leadEmailScanning ? 'animate-spin' : ''}`} />
                    Scan for Matches
                  </Button>
                  <Button
                    variant="outline"
                    onClick={loadLeadEmailSuggestions}
                    disabled={!canManageLeadEmails || leadEmailLoading}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${leadEmailLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Pending suggestions: {leadEmailSuggestions.length}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
                <Input
                  placeholder="Opportunity Ref No."
                  value={manualLeadRefNo}
                  onChange={(e) => setManualLeadRefNo(e.target.value)}
                  disabled={!canManageLeadEmails}
                />
                <Input
                  placeholder="Lead Email"
                  value={manualLeadEmail}
                  onChange={(e) => setManualLeadEmail(e.target.value)}
                  disabled={!canManageLeadEmails}
                />
                <Button
                  onClick={assignLeadEmailManual}
                  disabled={!canManageLeadEmails || !manualLeadRefNo.trim() || !manualLeadEmail.trim()}
                >
                  Assign & Approve
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref No</TableHead>
                      <TableHead>Tender</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Suggested Email</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadEmailSuggestions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                          No pending lead email suggestions.
                        </TableCell>
                      </TableRow>
                    )}
                    {leadEmailSuggestions.map((suggestion) => (
                      <TableRow key={suggestion._id}>
                        <TableCell className="font-mono text-xs">{suggestion.opportunityRefNo || '—'}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{suggestion.tenderName || '—'}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{suggestion.leadName || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{suggestion.suggestedEmail}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{suggestion.score ?? '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{suggestion.suggestedBy || 'auto'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => approveLeadEmailSuggestion(suggestion._id)}
                              disabled={!canManageLeadEmails}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectLeadEmailSuggestion(suggestion._id)}
                              disabled={!canManageLeadEmails}
                            >
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {allowedTabValues.has('data-sync') && (
        <TabsContent value="data-sync">
          <div className="space-y-4 sm:space-y-6 md:space-y-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    <div>
                      <CardTitle>Data Collection</CardTitle>
                      <CardDescription>Configure and sync tender data from Microsoft Graph Excel to MongoDB</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">

                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold">Graph Account Bootstrap (one-time)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    <div className="md:col-span-2 rounded border p-3 text-xs text-muted-foreground">
                      Status: <strong>{graphAuthStatus.hasRefreshToken ? '✅ Excel Connected (Delegated Auth)' : '❌ Not Connected'}</strong>{' '}
                      {graphAuthStatus.accountUsername ? `(${graphAuthStatus.accountUsername})` : ''}
                      {graphAuthStatus.tokenUpdatedAt ? ` • token updated ${new Date(graphAuthStatus.tokenUpdatedAt).toLocaleString()}` : ''}
                    </div>
                    <div className="md:col-span-2 rounded border p-3 text-xs text-muted-foreground">
                      Use one-time delegated bootstrap with your Microsoft account credentials. If this account has MFA enforced,
                      use a non-MFA service account for bootstrap.
                    </div>
                    <div className="md:col-span-2 rounded border p-3 text-xs text-muted-foreground space-y-2">
                      <p>If you get <strong>AADSTS65001</strong>, grant one-time consent for the service account, then retry bootstrap.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={async () => {
                            const url = consentUrl || await fetchConsentUrl(bootstrapUsername);
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          disabled={configSaving}
                        >
                          Open Consent URL
                        </Button>
                        {consentUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigator.clipboard.writeText(consentUrl)}
                            disabled={configSaving}
                          >
                            Copy Consent URL
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Microsoft Username</p>
                      <Input value={bootstrapUsername} onChange={(e) => setBootstrapUsername(e.target.value)} placeholder={DEFAULT_SERVICE_ACCOUNT} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Microsoft Password</p>
                      <Input type="password" value={bootstrapPassword} onChange={(e) => setBootstrapPassword(e.target.value)} placeholder={DEFAULT_SERVICE_ACCOUNT} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={bootstrapGraphAuth} disabled={configSaving || !bootstrapUsername || !bootstrapPassword}>
                      Connect Excel
                    </Button>
                    <Button variant="outline" onClick={clearGraphAuth} disabled={configSaving}>
                      Clear Stored Token
                    </Button>
                  </div>

                  <h3 className="font-semibold mt-6">Graph Excel Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <p className="text-xs text-muted-foreground">Share Link</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Paste SharePoint/OneDrive share link"
                          value={graphConfig.shareLink}
                          onChange={(e) => setGraphConfig((prev) => ({ ...prev, shareLink: e.target.value }))}
                        />
                        <Button variant="outline" onClick={resolveShareLink} disabled={configSaving || !graphConfig.shareLink}>
                          Resolve
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Drive ID</p>
                      <Input value={graphConfig.driveId} onChange={(e) => setGraphConfig((prev) => ({ ...prev, driveId: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">File ID</p>
                      <Input value={graphConfig.fileId} onChange={(e) => setGraphConfig((prev) => ({ ...prev, fileId: e.target.value }))} />
                    </div>
                      <p className="text-[11px] text-muted-foreground md:col-span-2">If Resolve fails for personal OneDrive shares, paste Drive ID and File ID from Python diagnostic tool and click "Load Sheets from IDs".</p>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Worksheet</p>
                      <Select
                        value={graphConfig.worksheetName || '__none__'}
                        onValueChange={(value) => setGraphConfig((prev) => ({ ...prev, worksheetName: value === '__none__' ? '' : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select worksheet" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select worksheet</SelectItem>
                          {worksheets.map((sheet) => (
                            <SelectItem key={sheet.id || sheet.name} value={sheet.name}>{sheet.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Data Range (optional, leave blank for full used range)</p>
                      <Input
                        value={graphConfig.dataRange}
                        onChange={(e) => setGraphConfig((prev) => ({ ...prev, dataRange: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Auto-sync Interval (minutes)</p>
                      <Input
                        type="number"
                        min={1}
                        value={graphConfig.syncIntervalMinutes}
                        onChange={(e) => setGraphConfig((prev) => ({ ...prev, syncIntervalMinutes: Number(e.target.value) || 10 }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Header Row Offset (0-based in preview)</p>
                      <Input
                        type="number"
                        min={0}
                        value={graphConfig.headerRowOffset}
                        onChange={(e) => setGraphConfig((prev) => ({ ...prev, headerRowOffset: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <p className="text-xs text-muted-foreground">Custom Field Mapping (JSON, optional)</p>
                      <Textarea rows={8} value={mappingText} onChange={(e) => setMappingText(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={loadSheetsFromIds} disabled={!graphConfig.driveId || !graphConfig.fileId}>
                      Load Sheets from IDs
                    </Button>
                    <Button variant="outline" onClick={previewHeaderRows} disabled={!graphConfig.driveId || !graphConfig.fileId || !graphConfig.worksheetName || configSaving}>
                      Preview Rows
                    </Button>
                    <Button onClick={saveGraphConfig} disabled={configSaving}>
                      {configSaving ? 'Saving...' : 'Save Graph Config'}
                    </Button>
                  </div>
                </div>

                {previewRows.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Header Row Detection</h3>
                      <p className="text-xs text-muted-foreground">Select which row should be treated as the header.</p>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {previewRows.map((row, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`w-full text-left border rounded p-2 text-xs ${graphConfig.headerRowOffset === idx ? 'border-primary bg-primary/10' : 'border-border'}`}
                          onClick={() => setGraphConfig((prev) => ({ ...prev, headerRowOffset: idx }))}
                        >
                          <span className="font-semibold mr-2">Row {idx}</span>
                          {row.slice(0, 8).map((cell, i) => (
                            <span key={i} className="mr-2">{String(cell || '').slice(0, 20)} |</span>
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Total Tenders</p>
                    <p className="text-2xl font-bold">{collectionStats?.totalTenders || 0}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">${(collectionStats?.totalValue || 0).toLocaleString()}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Last Sync</p>
                    <p className="text-sm font-mono">
                      {collectionStats?.lastSync 
                        ? new Date(collectionStats.lastSync).toLocaleString() 
                        : 'Never'}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-3">Status Distribution</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {collectionStats?.statusDistribution && 
                      Object.entries(collectionStats.statusDistribution).map(([status, count]) => (
                        <div key={status} className="bg-muted p-3 rounded">
                          <p className="text-xs text-muted-foreground">{status}</p>
                          <p className="text-lg font-bold">{count}</p>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div className="border-t pt-6 space-y-3">
                  <div className="grid gap-2">
                    <Button 
                      onClick={syncFromGraphExcel}
                      disabled={syncLoading}
                      size="lg"
                      className="w-full gap-2"
                    >
                      <Download className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
                      {syncLoading ? 'Syncing...' : 'Sync from Graph Excel'}
                    </Button>
                    <Button
                      onClick={forceRefreshNotificationSync}
                      disabled={syncLoading}
                      variant="secondary"
                      className="w-full"
                    >
                      Force Refresh New-Row Detection
                    </Button>
                    <Button
                      onClick={seedClientsFromOpportunities}
                      disabled={syncLoading}
                      variant="outline"
                      className="w-full"
                    >
                      Seed Clients from Opportunities
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pulls latest tender data from your configured Microsoft Graph Excel and syncs to database
                  </p>
                  <div className="rounded border p-3 text-xs text-muted-foreground">
                    Notification tracker: last checked {notificationSyncStatus.lastCheckedAt ? new Date(notificationSyncStatus.lastCheckedAt).toLocaleString() : 'never'}
                    {' '}• last new rows {notificationSyncStatus.lastNewRowsCount} • tracked rows {notificationSyncStatus.trackedRows}.
                    Scheduled check runs daily at 5:00 PM server time.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

        {allowedTabValues.has('telecast') && (
        <TabsContent value="telecast">
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
                <CardDescription>Configure telecast account and automated new-row notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 md:space-y-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base">
                  <span>Status:</span>
                  <Badge className={telecastAuthStatus.hasRefreshToken ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                    {telecastAuthStatus.hasRefreshToken ? 'Connected' : 'Not Connected'}
                  </Badge>
                  {telecastAuthStatus.accountUsername && <span className="text-xs text-muted-foreground">({telecastAuthStatus.accountUsername})</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:space-y-2">
                    <p className="text-xs sm:text-sm md:text-base font-medium">Telecast Account Username</p>
                    <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" value={telecastUsername} onChange={(e) => setTelecastUsername(e.target.value)} placeholder={DEFAULT_SERVICE_ACCOUNT} />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <p className="text-xs sm:text-sm md:text-base font-medium">Telecast Account Password</p>
                    <Input className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" type="password" value={telecastPassword} onChange={(e) => setTelecastPassword(e.target.value)} placeholder="Enter telecast account password" />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
                  <Button className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto" variant="outline" onClick={bootstrapTelecastAuth} disabled={configSaving || !telecastUsername || !telecastPassword}>Connect Telecast Account</Button>
                  <Button className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto" variant="outline" onClick={clearTelecastAuth} disabled={configSaving}>Clear Telecast Token</Button>
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
                  <p>{(telecastKeywords.length ? telecastKeywords : ['{{TENDER_NO}}','{{TENDER_NAME}}','{{CLIENT}}','{{GROUP}}','{{TENDER_TYPE}}','{{DATE_TENDER_RECD}}','{{YEAR}}','{{LEAD}}','{{OPPORTUNITY_ID}}','{{COMMENTS}}']).join(', ')}</p>
                </div>
                <Button onClick={saveTelecastConfig} disabled={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">Save Template & Recipients</Button>
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
                <Button onClick={sendTelecastTestMail} disabled={telecastSending || !telecastAuthStatus.hasRefreshToken} className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  <Send className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${telecastSending ? 'animate-pulse' : ''}`} />
                  {telecastSending ? 'Sending...' : 'Send Template Preview'}
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
                  <Button onClick={saveTelecastConfig} disabled={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                    Save Approval Alert
                  </Button>
                  <Button
                    onClick={sendApprovalTestMail}
                    disabled={approvalTemplateSending || !telecastAuthStatus.hasRefreshToken || !telecastRecipientEmail}
                    variant="outline"
                    className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                  >
                    <Send className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${approvalTemplateSending ? 'animate-pulse' : ''}`} />
                    {approvalTemplateSending ? 'Sending...' : 'Send Approval Template Preview'}
                  </Button>
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

                <Button onClick={saveReportingConfig} disabled={configSaving} className="h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  Save Issue Reporting Style
                </Button>
                <Button
                  onClick={sendReportingTestMail}
                  disabled={reportingTemplateSending || !telecastAuthStatus.hasRefreshToken || !telecastRecipientEmail}
                  variant="outline"
                  className="gap-2 sm:gap-3 h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto"
                >
                  <Send className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${reportingTemplateSending ? 'animate-pulse' : ''}`} />
                  {reportingTemplateSending ? 'Sending...' : 'Send Issue Template Preview'}
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
