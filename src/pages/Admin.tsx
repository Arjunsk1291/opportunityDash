import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield,
  Lock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Database,
  Activity,
  Settings,
  FileText,
  Bug,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { 
  opportunities, 
  calculateDataHealth,
  Opportunity 
} from '@/data/opportunityData';

const ADMIN_PASSWORD = 'admin123'; // In production, this should be securely stored

interface ErrorLog {
  id: string;
  timestamp: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  resolved: boolean;
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Check session storage on mount
  useEffect(() => {
    const adminAuth = sessionStorage.getItem('adminAuth');
    if (adminAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('adminAuth', 'true');
      setPasswordError('');
    } else {
      setPasswordError('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('adminAuth');
  };

  const dataHealth = useMemo(() => calculateDataHealth(opportunities), []);

  // Mock error logs
  const [errorLogs] = useState<ErrorLog[]>([
    { id: '1', timestamp: new Date().toISOString(), type: 'warning', message: 'Missing opportunity value for 12 records - imputed using median', source: 'Data Imputation', resolved: true },
    { id: '2', timestamp: new Date().toISOString(), type: 'warning', message: 'Planned submission date missing for 8 records', source: 'Data Validation', resolved: false },
    { id: '3', timestamp: new Date().toISOString(), type: 'info', message: 'Data sync completed successfully', source: 'SharePoint Sync', resolved: true },
    { id: '4', timestamp: new Date().toISOString(), type: 'error', message: 'Failed to match 3 tender records during join', source: 'Data Merge', resolved: false },
    { id: '5', timestamp: new Date().toISOString(), type: 'warning', message: 'Lead name variants detected: Vishnu, vishnu, VISHNU', source: 'Data Canonicalization', resolved: true },
    { id: '6', timestamp: new Date().toISOString(), type: 'info', message: 'Dashboard filters reset to default', source: 'User Action', resolved: true },
  ]);

  // Data anomalies
  const anomalies = useMemo(() => {
    const issues: Array<{ type: string; severity: 'high' | 'medium' | 'low'; description: string; count: number }> = [];

    // High value opportunities with low probability
    const highValueLowProb = opportunities.filter(o => o.opportunityValue > 1000000 && o.probability < 30);
    if (highValueLowProb.length > 0) {
      issues.push({
        type: 'High Value + Low Probability',
        severity: 'medium',
        description: 'Opportunities with value > $1M but probability < 30%',
        count: highValueLowProb.length,
      });
    }

    // Missing internal lead
    const noLead = opportunities.filter(o => !o.internalLead);
    if (noLead.length > 0) {
      issues.push({
        type: 'No Assigned Lead',
        severity: 'high',
        description: 'Opportunities without an internal lead assigned',
        count: noLead.length,
      });
    }

    // Stale opportunities
    const stale = opportunities.filter(o => o.agedDays > 60);
    if (stale.length > 0) {
      issues.push({
        type: 'Stale Opportunities',
        severity: 'medium',
        description: 'No contact in over 60 days',
        count: stale.length,
      });
    }

    // Will miss deadline
    const willMiss = opportunities.filter(o => o.willMissDeadline);
    if (willMiss.length > 0) {
      issues.push({
        type: 'Deadline Risk',
        severity: 'high',
        description: 'Opportunities that will miss submission deadline',
        count: willMiss.length,
      });
    }

    // High imputation
    const highImputation = opportunities.filter(o => 
      o.opportunityValue_imputed && o.probability_imputed && o.tenderPlannedSubmissionDate_imputed
    );
    if (highImputation.length > 0) {
      issues.push({
        type: 'High Imputation',
        severity: 'low',
        description: 'Records with 3+ imputed fields',
        count: highImputation.length,
      });
    }

    return issues;
  }, []);

  // System stats
  const systemStats = {
    totalRecords: opportunities.length,
    imputedRecords: dataHealth.imputedCount,
    dataHealthScore: dataHealth.healthScore,
    lastSync: new Date().toLocaleString(),
    uptime: '99.9%',
    memoryUsage: '45%',
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Enter the admin password to access this panel
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter admin password"
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <Button className="w-full" onClick={handleLogin}>
              <Shield className="h-4 w-4 mr-2" />
              Access Admin Panel
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Hint: admin123
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">System monitoring and troubleshooting</p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <Lock className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Database className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{systemStats.totalRecords}</p>
            <p className="text-xs text-muted-foreground">Total Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-5 w-5 mx-auto text-success mb-2" />
            <p className="text-2xl font-bold">{systemStats.dataHealthScore}%</p>
            <p className="text-xs text-muted-foreground">Data Health</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-warning mb-2" />
            <p className="text-2xl font-bold">{systemStats.imputedRecords}</p>
            <p className="text-xs text-muted-foreground">Imputed Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Bug className="h-5 w-5 mx-auto text-destructive mb-2" />
            <p className="text-2xl font-bold">{anomalies.length}</p>
            <p className="text-xs text-muted-foreground">Anomalies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-success mb-2" />
            <p className="text-2xl font-bold">{systemStats.uptime}</p>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <RefreshCw className="h-5 w-5 mx-auto text-info mb-2" />
            <p className="text-sm font-medium truncate">{systemStats.lastSync}</p>
            <p className="text-xs text-muted-foreground">Last Sync</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="anomalies">
        <TabsList>
          <TabsTrigger value="anomalies" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileText className="h-4 w-4" />
            Error Logs
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Database className="h-4 w-4" />
            Data Quality
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="anomalies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detected Anomalies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {anomalies.map((anomaly, index) => (
                  <Alert
                    key={index}
                    variant={anomaly.severity === 'high' ? 'destructive' : 'default'}
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="flex items-center gap-2">
                      {anomaly.type}
                      <Badge
                        variant={
                          anomaly.severity === 'high'
                            ? 'destructive'
                            : anomaly.severity === 'medium'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {anomaly.count} records
                      </Badge>
                    </AlertTitle>
                    <AlertDescription>{anomaly.description}</AlertDescription>
                  </Alert>
                ))}
                {anomalies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                    <p>No anomalies detected</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {errorLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      {log.type === 'error' && <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                      {log.type === 'warning' && <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />}
                      {log.type === 'info' && <Info className="h-4 w-4 text-info mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{log.source}</span>
                          <Badge variant={log.resolved ? 'secondary' : 'outline'} className="text-xs">
                            {log.resolved ? 'Resolved' : 'Open'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Quality Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Overall Data Health</span>
                    <span className="text-sm font-bold">{dataHealth.healthScore}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${dataHealth.healthScore}%` }}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">Records Requiring Review</h4>
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-2">
                      {dataHealth.missingRows.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between p-2 rounded bg-muted/50"
                        >
                          <span className="text-sm font-mono">{row.refNo}</span>
                          <div className="flex gap-1">
                            {row.missingFields.map((field) => (
                              <Badge key={field} variant="outline" className="text-xs">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Admin Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>SharePoint Connection</Label>
                  <div className="flex gap-2">
                    <Input placeholder="SharePoint URL" className="flex-1" />
                    <Button variant="outline">Test Connection</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure the SharePoint URL for live Excel sync
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Email Notifications</Label>
                  <Input placeholder="admin@company.com" />
                  <p className="text-xs text-muted-foreground">
                    Receive alerts for critical errors and anomalies
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Data Refresh Interval</Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="60" className="w-24" />
                    <span className="text-sm text-muted-foreground self-center">minutes</span>
                  </div>
                </div>

                <Button className="mt-4">Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
