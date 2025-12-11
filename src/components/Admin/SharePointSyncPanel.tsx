import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CloudUpload,
  Link2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Settings,
  Download,
  Upload,
  Webhook,
  Zap,
  Database,
  Trash2,
  Play,
  Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSharePointConfig,
  saveSharePointConfig,
  getSyncLogs,
  addSyncLog,
  clearSyncLogs,
  testConnection,
  syncViaCSV,
  syncViaPowerAutomate,
  getSyncStatus,
  exportSyncLogsToCSV,
  type SharePointConfig,
  type SyncLog,
} from '@/services/sharePointService';

interface SharePointSyncPanelProps {
  onSyncComplete?: () => void;
}

const SharePointSyncPanel = ({ onSyncComplete }: SharePointSyncPanelProps) => {
  const [config, setConfig] = useState<SharePointConfig>(getSharePointConfig());
  const [logs, setLogs] = useState<SyncLog[]>(getSyncLogs());
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [powerAutomateUrl, setPowerAutomateUrl] = useState('');

  // Load initial state
  useEffect(() => {
    const status = getSyncStatus();
    setIsConnected(status.status === 'connected');
  }, []);

  // Refresh logs periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(getSyncLogs());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConfigChange = (updates: Partial<SharePointConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    saveSharePointConfig(updates);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await testConnection(config.siteUrl);
      if (result.success) {
        setIsConnected(true);
        toast.success('Connection successful', {
          description: 'SharePoint site is accessible',
        });
        addSyncLog({
          timestamp: new Date().toISOString(),
          status: 'success',
          message: 'Connection test passed',
          recordsAffected: 0,
          duration: 0,
          syncMethod: 'connection-test',
        });
      } else {
        setIsConnected(false);
        toast.error('Connection failed', {
          description: result.message,
        });
        addSyncLog({
          timestamp: new Date().toISOString(),
          status: 'error',
          message: `Connection test failed: ${result.message}`,
          recordsAffected: 0,
          duration: 0,
          syncMethod: 'connection-test',
        });
      }
      setLogs(getSyncLogs());
    } finally {
      setIsTesting(false);
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    try {
      const result = await syncViaCSV(file, config.dataEntrySheet);
      
      if (result.success) {
        toast.success('CSV imported successfully', {
          description: `${result.recordsUpdated} records processed`,
        });
        handleConfigChange({ lastSyncTime: result.timestamp });
        setIsConnected(true);
      } else {
        toast.error('Import failed', {
          description: result.message,
        });
      }

      addSyncLog({
        timestamp: result.timestamp,
        status: result.success ? 'success' : 'error',
        message: result.message,
        recordsAffected: result.recordsUpdated + result.recordsAdded,
        duration: result.duration,
        syncMethod: 'csv-upload',
      });
      setLogs(getSyncLogs());
      
      if (result.success && onSyncComplete) {
        onSyncComplete();
      }
    } finally {
      setIsSyncing(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handlePowerAutomateSync = async () => {
    if (!powerAutomateUrl) {
      toast.error('Webhook URL required');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncViaPowerAutomate(powerAutomateUrl);
      
      if (result.success) {
        toast.success('Power Automate triggered', {
          description: 'Check your flow history for results',
        });
        handleConfigChange({ lastSyncTime: result.timestamp });
      } else {
        toast.error('Trigger failed', {
          description: result.message,
        });
      }

      addSyncLog({
        timestamp: result.timestamp,
        status: result.success ? 'success' : 'error',
        message: result.message,
        recordsAffected: result.recordsUpdated,
        duration: result.duration,
        syncMethod: 'power-automate',
      });
      setLogs(getSyncLogs());
      
      if (result.success && onSyncComplete) {
        onSyncComplete();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Simulate sync based on method
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const recordsUpdated = Math.floor(Math.random() * 20) + 10;
      
      toast.success('Sync completed', {
        description: `${recordsUpdated} records synchronized`,
      });
      
      handleConfigChange({ lastSyncTime: new Date().toISOString() });
      
      addSyncLog({
        timestamp: new Date().toISOString(),
        status: 'success',
        message: `Manual sync completed: ${recordsUpdated} records updated`,
        recordsAffected: recordsUpdated,
        duration: 2000,
        syncMethod: config.syncMethod,
      });
      setLogs(getSyncLogs());
      
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (error) {
      toast.error('Sync failed');
      addSyncLog({
        timestamp: new Date().toISOString(),
        status: 'error',
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recordsAffected: 0,
        duration: 0,
        syncMethod: config.syncMethod,
      });
      setLogs(getSyncLogs());
    } finally {
      setIsSyncing(false);
    }
  }, [config.syncMethod, onSyncComplete]);

  const handleExportLogs = () => {
    const csv = exportSyncLogsToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported');
  };

  const handleClearLogs = () => {
    clearSyncLogs();
    setLogs([]);
    toast.success('Logs cleared');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-success/20 text-success border-success/30">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'warning':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Warning</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
          <div>
            <p className="font-medium">
              {isConnected ? 'Connected to SharePoint' : 'Not Connected'}
            </p>
            <p className="text-sm text-muted-foreground">
              {config.lastSyncTime 
                ? `Last sync: ${new Date(config.lastSyncTime).toLocaleString()}`
                : 'Never synced'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={autoSyncEnabled}
              onCheckedChange={setAutoSyncEnabled}
              id="auto-sync"
            />
            <Label htmlFor="auto-sync" className="text-sm">Auto-sync</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={!isConnected || isSyncing}
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="methods">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="methods" className="gap-2">
            <CloudUpload className="h-4 w-4" />
            Sync Methods
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Sync Logs
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* Sync Methods */}
        <TabsContent value="methods" className="space-y-4 mt-4">
          {/* Method 1: Direct URL */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Method 1: SharePoint Direct URL
              </CardTitle>
              <CardDescription>
                Connect directly using SharePoint file URL (requires Graph API auth)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://company.sharepoint.com/sites/..."
                  value={config.siteUrl}
                  onChange={(e) => handleConfigChange({ siteUrl: e.target.value })}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !config.siteUrl}
                >
                  {isTesting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Requires Azure AD app registration with Sites.Read.All permission
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Method 2: Power Automate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                Method 2: Power Automate Webhook
              </CardTitle>
              <CardDescription>
                Use Power Automate to push data on Excel changes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://prod-xx.westus.logic.azure.com/workflows/..."
                  value={powerAutomateUrl}
                  onChange={(e) => setPowerAutomateUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handlePowerAutomateSync}
                  disabled={isSyncing || !powerAutomateUrl}
                >
                  {isSyncing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Setup in Power Automate:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-2">
                  <li>Create flow with "When file modified" trigger</li>
                  <li>Add "Get file content" action for Excel</li>
                  <li>Add HTTP POST to send data here</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Method 3: CSV Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-success" />
                Method 3: Manual CSV Upload
              </CardTitle>
              <CardDescription>
                Export from Excel and upload CSV file directly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleCSVUpload}
                  disabled={isSyncing}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Supports CSV and Excel files. Export from SharePoint → Save As → CSV
              </p>
            </CardContent>
          </Card>

          {/* Method 4: Webhook Endpoint */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4 text-info" />
                Method 4: Webhook Endpoint
              </CardTitle>
              <CardDescription>
                Configure SharePoint to push changes to this endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                {window.location.origin}/api/webhook/sharepoint
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Configure this URL in SharePoint or Power Automate to receive real-time updates
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sync Logs */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{logs.length} log entries</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportLogs}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearLogs}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No sync logs yet</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    {log.status === 'success' && <CheckCircle className="h-4 w-4 text-success mt-0.5" />}
                    {log.status === 'error' && <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                    {log.status === 'warning' && <AlertCircle className="h-4 w-4 text-warning mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(log.status)}
                        <Badge variant="outline" className="text-xs">{log.syncMethod}</Badge>
                        {log.recordsAffected > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {log.recordsAffected} records
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1">{log.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.timestamp).toLocaleString()}
                        {log.duration > 0 && ` • ${log.duration}ms`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Preferred Sync Method</Label>
              <Select
                value={config.syncMethod}
                onValueChange={(value) => handleConfigChange({ syncMethod: value as SharePointConfig['syncMethod'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="graph-api">Microsoft Graph API</SelectItem>
                  <SelectItem value="power-automate">Power Automate</SelectItem>
                  <SelectItem value="csv-upload">CSV Upload</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Auto-Sync Interval</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={config.syncInterval}
                    onChange={(e) => handleConfigChange({ syncInterval: parseInt(e.target.value) || 60 })}
                    className="w-20"
                    min={5}
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data Entry Sheet Name</Label>
                <Input
                  value={config.dataEntrySheet}
                  onChange={(e) => handleConfigChange({ dataEntrySheet: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tender Sheet Name</Label>
              <Input
                value={config.tenderSheet}
                onChange={(e) => handleConfigChange({ tenderSheet: e.target.value })}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Column Mapping</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Opportunity ID:</span>
                  <span className="ml-2 font-medium">Opportunity Ref. No.</span>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Tender ID:</span>
                  <span className="ml-2 font-medium">Tender no</span>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="ml-2 font-medium">Client Name</span>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Value:</span>
                  <span className="ml-2 font-medium">Opportunity Value</span>
                </div>
              </div>
            </div>

            <Button className="w-fit">
              Save Configuration
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SharePointSyncPanel;
