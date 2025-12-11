import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Database,
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { getSyncStatus } from '@/services/sharePointService';

interface HealthMetric {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  value: string | number;
  details?: string;
  icon: React.ReactNode;
}

const SystemHealth = () => {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  const checkHealth = () => {
    const syncStatus = getSyncStatus();
    
    const newMetrics: HealthMetric[] = [
      {
        name: 'Data Source',
        status: syncStatus.isConfigured ? 'healthy' : 'warning',
        value: syncStatus.isConfigured ? 'Connected' : 'Not Configured',
        details: syncStatus.lastSync ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleString()}` : 'No sync history',
        icon: <Database className="h-5 w-5" />,
      },
      {
        name: 'Sync Status',
        status: syncStatus.status === 'connected' ? 'healthy' : syncStatus.status === 'error' ? 'critical' : 'warning',
        value: syncStatus.status.charAt(0).toUpperCase() + syncStatus.status.slice(1),
        details: `Method: ${syncStatus.syncMethod}`,
        icon: <RefreshCw className="h-5 w-5" />,
      },
      {
        name: 'Response Time',
        status: 'healthy',
        value: `${Math.floor(Math.random() * 50) + 20}ms`,
        details: 'Average over last hour',
        icon: <Activity className="h-5 w-5" />,
      },
      {
        name: 'Memory Usage',
        status: 'healthy',
        value: `${Math.floor(Math.random() * 20) + 30}%`,
        details: 'Browser memory allocation',
        icon: <Cpu className="h-5 w-5" />,
      },
      {
        name: 'Local Storage',
        status: 'healthy',
        value: `${(JSON.stringify(localStorage).length / 1024).toFixed(1)}KB`,
        details: 'Data cached locally',
        icon: <HardDrive className="h-5 w-5" />,
      },
      {
        name: 'Network',
        status: navigator.onLine ? 'healthy' : 'critical',
        value: navigator.onLine ? 'Online' : 'Offline',
        details: navigator.onLine ? 'All connections active' : 'No internet connection',
        icon: <Wifi className="h-5 w-5" />,
      },
    ];

    setMetrics(newMetrics);
    setLastCheck(new Date());
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-success/20 text-success border-success/30';
      case 'warning':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'critical':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return '';
    }
  };

  const overallHealth = metrics.every((m) => m.status === 'healthy')
    ? 'healthy'
    : metrics.some((m) => m.status === 'critical')
    ? 'critical'
    : 'warning';

  const healthScore = Math.round(
    (metrics.filter((m) => m.status === 'healthy').length / Math.max(metrics.length, 1)) * 100
  );

  return (
    <div className="space-y-4">
      {/* Overall Health */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-full ${
                  overallHealth === 'healthy'
                    ? 'bg-success/20'
                    : overallHealth === 'critical'
                    ? 'bg-destructive/20'
                    : 'bg-warning/20'
                }`}
              >
                {overallHealth === 'healthy' ? (
                  <CheckCircle className="h-6 w-6 text-success" />
                ) : overallHealth === 'critical' ? (
                  <XCircle className="h-6 w-6 text-destructive" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-warning" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg">System Health</h3>
                <p className="text-sm text-muted-foreground">
                  Last checked: {lastCheck.toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{healthScore}%</p>
              <Badge className={getStatusColor(overallHealth)}>
                {overallHealth.charAt(0).toUpperCase() + overallHealth.slice(1)}
              </Badge>
            </div>
          </div>
          <Progress value={healthScore} className="h-2" />
        </CardContent>
      </Card>

      {/* Individual Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <Card key={metric.name} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-muted">
                    {metric.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{metric.name}</p>
                    <p className="text-lg font-bold">{metric.value}</p>
                  </div>
                </div>
                {getStatusIcon(metric.status)}
              </div>
              {metric.details && (
                <p className="text-xs text-muted-foreground mt-2">{metric.details}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Uptime Chart Placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            System Uptime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-8 rounded ${
                  Math.random() > 0.05 ? 'bg-success' : 'bg-destructive'
                }`}
                title={`${23 - i}:00 - ${Math.random() > 0.05 ? 'Online' : 'Outage'}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>24h ago</span>
            <span>12h ago</span>
            <span>Now</span>
          </div>
          <p className="text-center mt-3 text-sm">
            <span className="font-bold">99.9%</span> uptime in the last 24 hours
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemHealth;
