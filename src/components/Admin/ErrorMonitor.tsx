import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Bug,
  RefreshCw,
  Trash2,
  Search,
  Filter,
  Download,
} from 'lucide-react';

export interface ErrorEntry {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

// Local storage key for error logs
const ERROR_LOG_KEY = 'admin_error_logs';

// Initialize with sample errors for demo
const initializeErrorLogs = (): ErrorEntry[] => {
  const stored = localStorage.getItem(ERROR_LOG_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  
  const sampleErrors: ErrorEntry[] = [
    {
      id: 'err-1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      level: 'error',
      source: 'Data Merge',
      message: 'Failed to match 3 tender records during join operation',
      stack: 'at mergeOpportunities (opportunityData.ts:245)\nat processData (Dashboard.tsx:42)',
      context: { affectedRecords: ['AC24195', 'AC24196', 'AC24197'] },
      resolved: false,
    },
    {
      id: 'err-2',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      level: 'warning',
      source: 'Data Imputation',
      message: 'Missing opportunity value for 12 records - using median imputation',
      context: { method: 'median', confidence: 'medium' },
      resolved: true,
      resolvedAt: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: 'err-3',
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      level: 'warning',
      source: 'Data Validation',
      message: 'Planned submission date missing for 8 records',
      context: { fieldName: 'tenderPlannedSubmissionDate' },
      resolved: false,
    },
    {
      id: 'err-4',
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      level: 'info',
      source: 'SharePoint Sync',
      message: 'Data sync completed successfully with 52 records',
      resolved: true,
    },
    {
      id: 'err-5',
      timestamp: new Date(Date.now() - 18000000).toISOString(),
      level: 'warning',
      source: 'Data Canonicalization',
      message: 'Lead name variants detected: Vishnu, vishnu, VISHNU - normalized',
      context: { originalValues: ['Vishnu', 'vishnu', 'VISHNU', 'Vishnu/Aseeb'], normalizedTo: 'Vishnu' },
      resolved: true,
    },
    {
      id: 'err-6',
      timestamp: new Date(Date.now() - 21600000).toISOString(),
      level: 'error',
      source: 'API',
      message: 'Network request failed: Connection timeout',
      stack: 'at fetchData (api.ts:15)\nat useQuery (tanstack-query)',
      resolved: false,
    },
    {
      id: 'err-7',
      timestamp: new Date(Date.now() - 25200000).toISOString(),
      level: 'info',
      source: 'User Action',
      message: 'Dashboard filters reset to default',
      resolved: true,
    },
    {
      id: 'err-8',
      timestamp: new Date(Date.now() - 28800000).toISOString(),
      level: 'warning',
      source: 'Performance',
      message: 'Slow render detected: Dashboard took 1.2s to load',
      context: { component: 'Dashboard', renderTime: 1200 },
      resolved: false,
    },
  ];
  
  localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(sampleErrors));
  return sampleErrors;
};

// Global error capture
export function captureError(error: Error | string, source: string, context?: Record<string, unknown>) {
  const errors = getErrorLogs();
  const newError: ErrorEntry = {
    id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    level: 'error',
    source,
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'object' ? error.stack : undefined,
    context,
    resolved: false,
  };
  errors.unshift(newError);
  saveErrorLogs(errors);
  return newError;
}

export function captureWarning(message: string, source: string, context?: Record<string, unknown>) {
  const errors = getErrorLogs();
  const newError: ErrorEntry = {
    id: `warn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    level: 'warning',
    source,
    message,
    context,
    resolved: false,
  };
  errors.unshift(newError);
  saveErrorLogs(errors);
  return newError;
}

export function getErrorLogs(): ErrorEntry[] {
  const stored = localStorage.getItem(ERROR_LOG_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return initializeErrorLogs();
}

export function saveErrorLogs(errors: ErrorEntry[]) {
  // Keep only last 500 entries
  if (errors.length > 500) {
    errors = errors.slice(0, 500);
  }
  localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(errors));
}

const ErrorMonitor = () => {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setErrors(getErrorLogs());
    
    // Refresh every 5 seconds
    const interval = setInterval(() => {
      setErrors(getErrorLogs());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const filteredErrors = errors.filter((err) => {
    if (filter !== 'all' && err.level !== filter) return false;
    if (statusFilter === 'open' && err.resolved) return false;
    if (statusFilter === 'resolved' && !err.resolved) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        err.message.toLowerCase().includes(query) ||
        err.source.toLowerCase().includes(query) ||
        (err.stack && err.stack.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const handleResolve = (id: string) => {
    const updated = errors.map((err) =>
      err.id === id
        ? { ...err, resolved: true, resolvedAt: new Date().toISOString() }
        : err
    );
    setErrors(updated);
    saveErrorLogs(updated);
  };

  const handleUnresolve = (id: string) => {
    const updated = errors.map((err) =>
      err.id === id
        ? { ...err, resolved: false, resolvedAt: undefined }
        : err
    );
    setErrors(updated);
    saveErrorLogs(updated);
  };

  const handleDelete = (id: string) => {
    const updated = errors.filter((err) => err.id !== id);
    setErrors(updated);
    saveErrorLogs(updated);
  };

  const handleClearResolved = () => {
    const updated = errors.filter((err) => !err.resolved);
    setErrors(updated);
    saveErrorLogs(updated);
  };

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Level', 'Source', 'Message', 'Resolved', 'Context'].join(','),
      ...errors.map((err) =>
        [
          err.timestamp,
          err.level,
          `"${err.source}"`,
          `"${err.message.replace(/"/g, '""')}"`,
          err.resolved ? 'Yes' : 'No',
          err.context ? `"${JSON.stringify(err.context).replace(/"/g, '""')}"` : '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    total: errors.length,
    errors: errors.filter((e) => e.level === 'error').length,
    warnings: errors.filter((e) => e.level === 'warning').length,
    open: errors.filter((e) => !e.resolved).length,
  };

  const getIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'info':
        return <Info className="h-4 w-4 text-info" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Logs</p>
        </div>
        <div className="p-3 rounded-lg bg-destructive/10 text-center">
          <p className="text-2xl font-bold text-destructive">{stats.errors}</p>
          <p className="text-xs text-muted-foreground">Errors</p>
        </div>
        <div className="p-3 rounded-lg bg-warning/10 text-center">
          <p className="text-2xl font-bold text-warning">{stats.warnings}</p>
          <p className="text-xs text-muted-foreground">Warnings</p>
        </div>
        <div className="p-3 rounded-lg bg-primary/10 text-center">
          <p className="text-2xl font-bold text-primary">{stats.open}</p>
          <p className="text-xs text-muted-foreground">Open</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[120px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warning">Warnings</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => setErrors(getErrorLogs())}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={handleClearResolved}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear Resolved
        </Button>
      </div>

      {/* Error List */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success" />
              <p className="font-medium">No issues found</p>
              <p className="text-sm">All systems operating normally</p>
            </div>
          ) : (
            filteredErrors.map((err) => (
              <Card
                key={err.id}
                className={`cursor-pointer transition-all ${
                  expandedId === err.id ? 'ring-1 ring-primary' : ''
                } ${err.resolved ? 'opacity-60' : ''}`}
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {getIcon(err.level)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {err.source}
                        </Badge>
                        <Badge
                          variant={err.resolved ? 'secondary' : 'default'}
                          className="text-xs"
                        >
                          {err.resolved ? 'Resolved' : 'Open'}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1 font-medium">{err.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(err.timestamp).toLocaleString()}
                      </p>
                      
                      {/* Expanded content */}
                      {expandedId === err.id && (
                        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                          {err.stack && (
                            <div className="p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                              {err.stack}
                            </div>
                          )}
                          {err.context && (
                            <div className="p-2 bg-muted rounded text-xs">
                              <p className="font-medium mb-1">Context:</p>
                              <pre className="overflow-x-auto">
                                {JSON.stringify(err.context, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="flex gap-2">
                            {err.resolved ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUnresolve(err.id)}
                              >
                                Reopen
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleResolve(err.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Resolved
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(err.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ErrorMonitor;
