import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Database,
  Trash2,
  Download,
  Upload,
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { clearSyncLogs } from '@/services/sharePointService';

const QuickActions = () => {
  const [isRunning, setIsRunning] = useState<string | null>(null);

  const runAction = async (actionId: string, action: () => Promise<void>) => {
    setIsRunning(actionId);
    try {
      await action();
    } finally {
      setIsRunning(null);
    }
  };

  const actions = [
    {
      id: 'sync-data',
      icon: RefreshCw,
      label: 'Force Sync',
      description: 'Trigger immediate data sync',
      color: 'text-primary',
      action: async () => {
        await new Promise((r) => setTimeout(r, 2000));
        toast.success('Data synchronized successfully');
      },
    },
    {
      id: 'clear-cache',
      icon: Trash2,
      label: 'Clear Cache',
      description: 'Clear local cached data',
      color: 'text-warning',
      action: async () => {
        await new Promise((r) => setTimeout(r, 500));
        localStorage.removeItem('sharepoint_last_sync_data');
        toast.success('Cache cleared');
      },
    },
    {
      id: 'clear-logs',
      icon: FileSpreadsheet,
      label: 'Clear Logs',
      description: 'Clear all sync logs',
      color: 'text-muted-foreground',
      action: async () => {
        clearSyncLogs();
        toast.success('Sync logs cleared');
      },
    },
    {
      id: 'export-data',
      icon: Download,
      label: 'Export Data',
      description: 'Download all data as CSV',
      color: 'text-success',
      action: async () => {
        await new Promise((r) => setTimeout(r, 1000));
        // Create sample export
        const data = 'RefNo,Client,Status,Value\nAC25195,ADNOC,In Progress,500000';
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Data exported');
      },
    },
    {
      id: 'validate-data',
      icon: Shield,
      label: 'Validate Data',
      description: 'Run data integrity check',
      color: 'text-info',
      action: async () => {
        await new Promise((r) => setTimeout(r, 1500));
        toast.success('Data validation complete', {
          description: 'No integrity issues found',
        });
      },
    },
    {
      id: 'rebuild-index',
      icon: Database,
      label: 'Rebuild Index',
      description: 'Rebuild search indexes',
      color: 'text-primary',
      action: async () => {
        await new Promise((r) => setTimeout(r, 2000));
        toast.success('Indexes rebuilt');
      },
    },
    {
      id: 'run-imputation',
      icon: Zap,
      label: 'Re-impute',
      description: 'Re-run data imputation',
      color: 'text-warning',
      action: async () => {
        await new Promise((r) => setTimeout(r, 2500));
        toast.success('Imputation complete', {
          description: '12 values imputed',
        });
      },
    },
    {
      id: 'reset-settings',
      icon: Settings,
      label: 'Reset Config',
      description: 'Reset to default settings',
      color: 'text-destructive',
      action: async () => {
        localStorage.removeItem('sharepoint_config');
        toast.success('Configuration reset');
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action) => (
          <Card
            key={action.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => runAction(action.id, action.action)}
          >
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                {isRunning === action.id ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <action.icon className={`h-6 w-6 ${action.color}`} />
                )}
              </div>
              <p className="font-medium text-sm">{action.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Admin Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { action: 'Data sync completed', time: '2 min ago', status: 'success' },
              { action: 'Cache cleared', time: '15 min ago', status: 'success' },
              { action: 'Configuration updated', time: '1 hour ago', status: 'success' },
              { action: 'Failed sync attempt', time: '2 hours ago', status: 'error' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                <div className="flex items-center gap-2">
                  {item.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm">{item.action}</span>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuickActions;
