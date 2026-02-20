import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock, Users, Trash2, CheckCircle, XCircle, Clock, RefreshCw, Download, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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


interface MailConfig {
  serviceEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpPassword?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  serviceUsername?: string;
  envManagedConfidential?: { tenantId: boolean; clientId: boolean; clientSecret: boolean };
}

interface NotificationPreviewItem {
  ruleId: string;
  triggerEvent: string;
  useGroupMatching: boolean;
  groupClassification: string | null;
  recipients: Array<{ email: string; assignedGroup: string | null }>;
}

interface NotificationRule {
  id?: string;
  _id?: string;
  triggerEvent: 'NEW_TENDER_SYNCED';
  recipientRole: 'SVP';
  useGroupMatching: boolean;
  emailSubject: string;
  emailBody: string;
  isActive?: boolean;
}

interface MailboxAuthFlow {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn?: number;
  message?: string;
}

interface GraphAuthStatus {
  authMode: 'application' | 'delegated';
  accountUsername: string;
  hasRefreshToken: boolean;
  tokenUpdatedAt?: string | null;
}

export default function Admin() {
  const { user, isMaster, token } = useAuth();
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
    dataRange: 'B4:Z2000',
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
  const [bootstrapUsername, setBootstrapUsername] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [consentUrl, setConsentUrl] = useState('');
  const [mailConfig, setMailConfig] = useState<MailConfig>({ serviceEmail: '', smtpHost: '', smtpPort: 587, smtpPassword: '' });
  const [mailboxAuthFlow, setMailboxAuthFlow] = useState<MailboxAuthFlow | null>(null);
  const [mailboxAuthStatus, setMailboxAuthStatus] = useState<{ hasGraphRefreshToken: boolean; graphTokenUpdatedAt?: string | null; lastUpdatedBy?: string | null }>({ hasGraphRefreshToken: false });
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationPreview, setNotificationPreview] = useState<NotificationPreviewItem[]>([]);
  const [previewGroup, setPreviewGroup] = useState('GTS');
  const [newRule, setNewRule] = useState<NotificationRule>({
    triggerEvent: 'NEW_TENDER_SYNCED',
    recipientRole: 'SVP',
    useGroupMatching: true,
    emailSubject: 'New Tender Synced: {{tenderName}}',
    emailBody: '<p>A new tender {{tenderName}} has been synced. Ref: {{refNo}}</p>',
    isActive: true,
  });

  useEffect(() => {
    if (isMaster) {
      loadUsers();
      loadCollectionStats();
      loadGraphConfig();
      loadGraphAuthStatus();
      fetchConsentUrl();
      loadMailConfig();
      loadNotificationRules();
      loadMailboxAuthStatus();
      loadNotificationPreview('GTS');
    }
  }, [isMaster, token]);

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

      if (!response.ok) {
        throw new Error('Failed to sync data');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: `✅ Synced ${result.count} tenders from Graph Excel` });
      await loadCollectionStats();
      toast.success(`Synced ${result.count} tenders from Graph Excel`);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error syncing:', error);
      setMessage({ type: 'error', text: 'Failed to sync: ' + (error as Error).message });
      toast.error('Sync failed');
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
        dataRange: data.dataRange || 'B4:Z2000',
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
        throw new Error(data.error || 'Failed to resolve share link');
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
        throw new Error(data.error || 'Failed to preview rows');
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



  const loadMailboxAuthStatus = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/admin/mailbox/status', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) return;
      const data = await response.json();
      setMailboxAuthStatus({
        hasGraphRefreshToken: !!data.hasGraphRefreshToken,
        graphTokenUpdatedAt: data.graphTokenUpdatedAt || null,
        lastUpdatedBy: data.lastUpdatedBy || null,
      });
      if (data.serviceEmail) {
        setMailConfig((prev) => ({ ...prev, serviceEmail: data.serviceEmail }));
      }
    } catch (error) {
      console.error('Failed to load mailbox auth status:', error);
    }
  };

  const initiateMailboxAuth = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/admin/mailbox/initiate', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start device code flow');
      setMailboxAuthFlow({
        deviceCode: data.deviceCode,
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        verificationUriComplete: data.verificationUriComplete,
        expiresIn: data.expiresIn,
        message: data.message,
      });
      toast.success('Device code generated. Complete verification on Microsoft page.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const finalizeMailboxAuth = async () => {
    if (!token || !mailboxAuthFlow?.deviceCode) return;
    try {
      const response = await fetch(API_URL + '/admin/mailbox/finalize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: mailboxAuthFlow.deviceCode, email: mailConfig.serviceEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Mailbox authorization not completed yet');
      toast.success('Service mailbox authorized successfully.');
      setMailboxAuthFlow(null);
      await loadMailboxAuthStatus();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const loadMailConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/system-config/mail', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) return;
      const data = await response.json();
      setMailConfig((prev) => ({ ...prev, serviceEmail: data.serviceEmail || '', smtpHost: data.smtpHost || '', smtpPort: data.smtpPort || 587, smtpPassword: '', tenantId: data.tenantId || '', clientId: data.clientId || '', clientSecret: '', serviceUsername: data.serviceUsername || '', envManagedConfidential: data.envManagedConfidential || { tenantId: false, clientId: false, clientSecret: false } }));
    } catch (error) {
      console.error('Failed to load mail config:', error);
    }
  };

  const saveMailConfig = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/system-config/mail', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(mailConfig),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save mail config');
      setMessage({ type: 'success', text: '✅ SMTP configuration saved' });
      setMailConfig((prev) => ({ ...prev, smtpPassword: '' }));
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to save SMTP config: ' + (error as Error).message });
    }
  };

  const loadNotificationRules = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/notification-rules', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) return;
      const data = await response.json();
      setNotificationRules(data || []);
    } catch (error) {
      console.error('Failed to load notification rules:', error);
    }
  };

  const loadNotificationPreview = async (groupClassification?: string) => {
    if (!token) return;
    try {
      const group = (groupClassification || previewGroup || '').toUpperCase();
      const query = new URLSearchParams({ triggerEvent: 'NEW_TENDER_SYNCED', groupClassification: group }).toString();
      const response = await fetch(API_URL + '/notification-rules/preview?' + query, { headers: { Authorization: 'Bearer ' + token } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to preview routing');
      setNotificationPreview(data.preview || []);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to preview notification routing: ' + (error as Error).message });
    }
  };

  const createNotificationRule = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/notification-rules', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create rule');
      setMessage({ type: 'success', text: '✅ Notification rule created' });
      await loadNotificationRules();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to create rule: ' + (error as Error).message });
    }
  };

  const deleteNotificationRule = async (id?: string) => {
    if (!token || !id) return;
    try {
      const response = await fetch(API_URL + '/notification-rules/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Failed to delete rule');
      await loadNotificationRules();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to delete rule: ' + (error as Error).message });
    }
  };

  if (!isMaster) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert className="max-w-md" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Access Denied</strong>
            <p className="text-sm mt-2">Only Master users can access this panel.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Master Panel</h1>
        <p className="text-muted-foreground mt-2">System administration and control</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="data-sync">Data Sync</TabsTrigger>
          <TabsTrigger value="communication">Communication Center</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Current User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle>Authorized Users ({users.length})</CardTitle>
                </div>
                <div className="flex gap-2">
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
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              if (newRole === 'SVP') {
                                const selectedGroup = window.prompt('Enter assigned group for SVP (GES/GDS/GTS)', (u.assignedGroup || 'GES') as string);
                                if (!selectedGroup) return;
                                changeUserRole(u.email, newRole, selectedGroup.toUpperCase());
                                return;
                              }
                              changeUserRole(u.email, newRole);
                            }}
                            disabled={changingRole === u.email}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Master">Master</SelectItem>
                              <SelectItem value="Admin">Admin</SelectItem>
                              <SelectItem value="ProposalHead">Proposal Head</SelectItem>
                              <SelectItem value="SVP">SVP</SelectItem>
                              <SelectItem value="Basic">Basic</SelectItem>
                            </SelectContent>
                          </Select>
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
                            {u.status === 'approved' && (
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
                            {u.status === 'rejected' && (
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
        </TabsContent>

        <TabsContent value="data-sync">
          <div className="space-y-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      <Input value={bootstrapUsername} onChange={(e) => setBootstrapUsername(e.target.value)} placeholder="arjun.s@avenirengineering.com" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Microsoft Password</p>
                      <Input type="password" value={bootstrapPassword} onChange={(e) => setBootstrapPassword(e.target.value)} placeholder="••••••••" />
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
                      <p className="text-xs text-muted-foreground">Data Range (e.g. B4:Z2000)</p>
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
                    <Button variant="secondary" onClick={() => loadWorksheets(graphConfig.driveId, graphConfig.fileId)} disabled={!graphConfig.driveId || !graphConfig.fileId}>
                      Refresh Sheets
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

                <div className="border-t pt-6">
                  <Button 
                    onClick={syncFromGraphExcel}
                    disabled={syncLoading}
                    size="lg"
                    className="w-full gap-2"
                  >
                    <Download className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
                    {syncLoading ? 'Syncing...' : 'Sync from Graph Excel'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pulls latest tender data from your configured Microsoft Graph Excel and syncs to database
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="communication">
          <Card>
            <CardHeader>
              <CardTitle>Communication Center</CardTitle>
              <CardDescription>Master-only Microsoft Graph API integration, Notification Rules, and Template Editor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs defaultValue="smtp" className="w-full">
                <TabsList>
                  <TabsTrigger value="smtp">Microsoft Graph API Integration</TabsTrigger>
                  <TabsTrigger value="rules">Notification Rules</TabsTrigger>
                  <TabsTrigger value="templates">Template Editor</TabsTrigger>
                </TabsList>
                <TabsContent value="smtp" className="space-y-3">
                  <div className="border rounded p-3 space-y-2 text-sm">
                    <p className="font-medium">Service Mailbox (URI-free Device Code Flow) + ROPC Graph Credentials</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {mailboxAuthStatus.hasGraphRefreshToken ? '✅ Connected' : '❌ Not connected'}
                      {mailboxAuthStatus.graphTokenUpdatedAt ? ` • updated ${new Date(mailboxAuthStatus.graphTokenUpdatedAt).toLocaleString()}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={initiateMailboxAuth}>Connect Service Account</Button>
                      <Button type="button" variant="outline" onClick={finalizeMailboxAuth} disabled={!mailboxAuthFlow}>I have entered the code</Button>
                    </div>
                    {mailboxAuthFlow && (
                      <div className="rounded border p-3 text-xs space-y-1 bg-muted/30">
                        <p>1) Go to: <strong>{mailboxAuthFlow.verificationUri}</strong></p>
                        <p>2) Enter code: <strong className="font-mono text-base">{mailboxAuthFlow.userCode}</strong></p>
                        {mailboxAuthFlow.verificationUriComplete && (
                          <Button type="button" size="sm" variant="outline" onClick={() => window.open(mailboxAuthFlow.verificationUriComplete, '_blank', 'noopener,noreferrer')}>
                            Open verification page
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded border p-3 text-xs text-muted-foreground">
                    Fill these fields from your Azure App Registration + service mailbox:
                    <ul className="list-disc list-inside mt-1">
                      <li>Tenant ID: Directory (tenant) ID</li>
                      <li>Client ID: Application (client) ID</li>
                      <li>Client Secret: Secret VALUE (not Secret ID)</li>
                      <li>Service Username: tender-notify@avenirengineering.com</li>
                      <li>Service Account Password: mailbox password (stored encrypted)</li>
                    </ul>
                  </div>
                  {(mailConfig.envManagedConfidential?.tenantId || mailConfig.envManagedConfidential?.clientId || mailConfig.envManagedConfidential?.clientSecret) && (
                    <div className="rounded border p-2 text-xs text-muted-foreground">
                      Confidential client fields are <strong>Managed by System (.env)</strong> and take precedence over UI values.
                    </div>
                  )}
                  <Input placeholder="Tenant ID" value={mailConfig.tenantId || ''} disabled={!!mailConfig.envManagedConfidential?.tenantId} onChange={(e) => setMailConfig((p) => ({ ...p, tenantId: e.target.value }))} />
                  <Input placeholder="Client ID" value={mailConfig.clientId || ''} disabled={!!mailConfig.envManagedConfidential?.clientId} onChange={(e) => setMailConfig((p) => ({ ...p, clientId: e.target.value }))} />
                  <Input type="password" placeholder="Client Secret" value={mailConfig.clientSecret || ''} disabled={!!mailConfig.envManagedConfidential?.clientSecret} onChange={(e) => setMailConfig((p) => ({ ...p, clientSecret: e.target.value }))} />
                  <Input placeholder="Service Username (tender-notify@...)" value={mailConfig.serviceUsername || ''} onChange={(e) => setMailConfig((p) => ({ ...p, serviceUsername: e.target.value }))} />
                  <Input placeholder="Service Email (optional display/from)" value={mailConfig.serviceEmail} onChange={(e) => setMailConfig((p) => ({ ...p, serviceEmail: e.target.value }))} />
                  <Input type="password" placeholder="Service Account Password" value={mailConfig.smtpPassword || ''} onChange={(e) => setMailConfig((p) => ({ ...p, smtpPassword: e.target.value }))} />
                  <Button onClick={saveMailConfig}>Save Microsoft Graph API Integration</Button>
                </TabsContent>
                <TabsContent value="rules" className="space-y-3">
                  <div className="rounded border p-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Notification Rule Guide (easy setup)</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li><strong>Trigger:</strong> NEW_TENDER_SYNCED = email after Graph sync inserts tenders.</li>
                      <li><strong>Recipient Role:</strong> SVP users only.</li>
                      <li><strong>Group Matching:</strong> ON = only SVPs whose assignedGroup matches tender.groupClassification.</li>
                      <li><strong>Email Subject/Body:</strong> Use placeholders below. Final email content is sent in bold for visibility.</li>
                    </ol>
                  </div>
                  <Input placeholder="Email Subject" value={newRule.emailSubject} onChange={(e) => setNewRule((p) => ({ ...p, emailSubject: e.target.value }))} />
                  <Textarea placeholder="Email HTML Body" value={newRule.emailBody} onChange={(e) => setNewRule((p) => ({ ...p, emailBody: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button onClick={createNotificationRule}>Create Rule</Button>
                    <Input className="max-w-[130px]" placeholder="Group (GTS)" value={previewGroup} onChange={(e) => setPreviewGroup(e.target.value.toUpperCase())} />
                    <Button variant="outline" onClick={() => loadNotificationPreview(previewGroup)}>Preview Who Gets Email</Button>
                  </div>
                  <div className="space-y-2">
                    {notificationPreview.map((item) => (
                      <div key={item.ruleId} className="border rounded p-3 text-xs">
                        <p className="font-semibold">Trigger: {item.triggerEvent} • Group: {item.groupClassification || 'Any'} • Matching: {item.useGroupMatching ? 'On' : 'Off'}</p>
                        <p className="text-muted-foreground mt-1">Recipients: {item.recipients.length ? item.recipients.map((r) => `${r.email}${r.assignedGroup ? ` (${r.assignedGroup})` : ''}`).join(', ') : 'No recipients matched'}</p>
                      </div>
                    ))}
                    {notificationRules.map((rule) => (
                      <div key={rule.id || rule._id} className="border rounded p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rule.emailSubject}</p>
                          <p className="text-xs text-muted-foreground">{rule.triggerEvent} • {rule.useGroupMatching ? 'Group Matching On' : 'Group Matching Off'}</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => deleteNotificationRule(rule.id || rule._id)}>Delete</Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="templates" className="space-y-3">
                  <div className="rounded border p-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Available placeholders</p>
                    <p>{'{{tenderName}}'}, {'{{value}}'}, {'{{refNo}}'}, {'{{groupClassification}}'}, {'{{clientName}}'}, {'{{tenderType}}'}, {'{{internalLead}}'}, {'{{country}}'}, {'{{probability}}'}, {'{{avenirStatus}}'}, {'{{tenderResult}}'}, {'{{submissionDate}}'}, {'{{rfpReceivedDate}}'}</p>
                    <p className="mt-1">Tip: keep HTML simple and readable. System wraps final content in bold for high visibility.</p>
                  </div>
                  <Textarea value={newRule.emailBody} onChange={(e) => setNewRule((p) => ({ ...p, emailBody: e.target.value }))} className="min-h-[220px]" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
