import { useState, useEffect } from 'react';
import { RefreshCw, Database, Server, Cpu, HardDrive, Clock, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { User } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SystemHealthSnapshot {
  platform?: string;
  hostname?: string;
  arch?: string;
  nodeVersion?: string;
  uptimeHuman?: string;
  loadAverage?: number[];
  memory?: {
    usedPercent?: number | null;
    processRssBytes?: number;
    processHeapUsedBytes?: number;
    processHeapTotalBytes?: number;
  };
  disk?: {
    totalBytes?: number;
    freeBytes?: number;
    usedPercent?: number | null;
  } | null;
}

interface BackendHealthSnapshot {
  ok: boolean;
  dbState: number;
  timestamp?: string;
  system?: SystemHealthSnapshot;
}

interface CollectionStats {
  totalTenders: number;
  totalValue: number;
  lastSync?: string | Date;
  statusDistribution: Record<string, number>;
}

interface SystemConfigMeta {
  systemConfigUpdatedAt: string | null;
  systemConfigUpdatedBy: string | null;
  systemConfigFingerprint: string | null;
}

interface OverviewPanelProps {
  token: string | null;
  isMaster: boolean;
  user: User | null;
}

function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index++; }
  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatPercent(value: number | null | undefined): string {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}%` : '—';
}

export function OverviewPanel({ token, isMaster, user }: OverviewPanelProps) {
  const [health, setHealth] = useState<BackendHealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [meta, setMeta] = useState<SystemConfigMeta>({
    systemConfigUpdatedAt: null,
    systemConfigUpdatedBy: null,
    systemConfigFingerprint: null,
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  });

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(API_URL + '/health', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load health');
      setHealth({
        ok: Boolean(data?.ok),
        dbState: Number.isFinite(Number(data?.dbState)) ? Number(data.dbState) : -1,
        timestamp: data?.timestamp ? String(data.timestamp) : undefined,
        system: data?.system || undefined,
      });
    } catch (err) {
      setHealth(null);
      toast.error((err as Error).message);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadStats = async () => {
    if (!token) return;
    try {
      const res = await fetch(API_URL + '/admin/bootstrap', {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.collectionStats) setStats(data.collectionStats);
      if (data?.backendHealth) {
        setHealth({
          ok: Boolean(data.backendHealth.ok),
          dbState: Number.isFinite(Number(data.backendHealth.dbState)) ? Number(data.backendHealth.dbState) : -1,
          timestamp: data.backendHealth.timestamp,
          system: data.backendHealth.system,
        });
      }
      if (data?.systemConfigUpdatedAt !== undefined || data?.systemConfigFingerprint !== undefined) {
        setMeta({
          systemConfigUpdatedAt: data.systemConfigUpdatedAt || null,
          systemConfigUpdatedBy: data.systemConfigUpdatedBy || null,
          systemConfigFingerprint: data.systemConfigFingerprint || null,
        });
      }
    } catch {
      // stats are optional — silent failure
    }
  };

  useEffect(() => {
    void loadHealth();
    void loadStats();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current User */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Current User
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-mono text-sm">{user?.email || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <Badge>{user?.role || '—'}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Master Privileges */}
        {isMaster && (
          <Card>
            <CardHeader>
              <CardTitle>Master Privileges</CardTitle>
              <CardDescription>Actions available to your role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                'Approve and reject tenders',
                'Revert approvals to pending',
                'Manage authorized users',
                'Sync data from Graph Excel',
                'Configure export templates',
                'Manage system permissions',
              ].map((priv) => (
                <div key={priv} className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-600 shrink-0">✓</span>
                  <span>{priv}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Backend Health */}
        <Card className={isMaster ? '' : 'md:col-span-2'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Backend / DB Health
            </CardTitle>
            <CardDescription>MongoDB connectivity from the backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {healthLoading ? (
                <Badge variant="secondary">Checking…</Badge>
              ) : health ? (
                health.ok
                  ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">OK</Badge>
                  : <Badge variant="destructive">DB Not Ready</Badge>
              ) : (
                <Badge variant="secondary">Unknown</Badge>
              )}
              <Badge variant="outline">dbState: {health ? health.dbState : '—'}</Badge>
              {health?.timestamp && (
                <Badge variant="outline">{new Date(health.timestamp).toLocaleString()}</Badge>
              )}
            </div>

            {health?.system && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <Server className="h-3.5 w-3.5" />Host
                  </div>
                  <p className="text-xs">{health.system.platform || '—'}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{health.system.hostname || '—'}</p>
                  <p className="text-xs text-muted-foreground">Node {health.system.nodeVersion || '—'} · {health.system.arch || '—'}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <Clock className="h-3.5 w-3.5" />Uptime
                  </div>
                  <p className="text-xs">{health.system.uptimeHuman || '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    Load: {(health.system.loadAverage || []).slice(0, 3)
                      .map((v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—')
                      .join(' / ')}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <Cpu className="h-3.5 w-3.5" />Memory
                  </div>
                  <p className="text-xs">
                    Used: {formatPercent(health.system.memory?.usedPercent)} · RSS: {formatBytes(health.system.memory?.processRssBytes)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Heap: {formatBytes(health.system.memory?.processHeapUsedBytes)} / {formatBytes(health.system.memory?.processHeapTotalBytes)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <HardDrive className="h-3.5 w-3.5" />Disk
                  </div>
                  <p className="text-xs">
                    Free: {formatBytes(health.system.disk?.freeBytes)} / {formatBytes(health.system.disk?.totalBytes)}
                  </p>
                  <p className="text-xs text-muted-foreground">Used: {formatPercent(health.system.disk?.usedPercent)}</p>
                </div>
              </div>
            )}

            {(meta.systemConfigFingerprint || meta.systemConfigUpdatedAt) && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {meta.systemConfigFingerprint && (
                  <Badge variant="secondary">Config {meta.systemConfigFingerprint}</Badge>
                )}
                {meta.systemConfigUpdatedAt && (
                  <Badge variant="outline">Updated {new Date(meta.systemConfigUpdatedAt).toLocaleString()}</Badge>
                )}
                {meta.systemConfigUpdatedBy && (
                  <Badge variant="outline">by {meta.systemConfigUpdatedBy}</Badge>
                )}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={loadHealth} disabled={healthLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
              Refresh Health
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Collection Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Collection Stats</CardTitle>
            <CardDescription>Live counts from MongoDB.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Tenders</p>
                <p className="text-2xl font-bold">{stats.totalTenders || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value (AED)</p>
                <p className="text-2xl font-bold">{(stats.totalValue || 0).toLocaleString()}</p>
              </div>
              {stats.lastSync && (
                <div>
                  <p className="text-sm text-muted-foreground">Last Sync</p>
                  <p className="text-sm font-medium">{new Date(stats.lastSync).toLocaleString()}</p>
                </div>
              )}
              {Object.keys(stats.statusDistribution || {}).length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status Breakdown</p>
                  <div className="space-y-0.5">
                    {Object.entries(stats.statusDistribution).slice(0, 5).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">{status}</span>
                        <Badge variant="outline" className="text-xs ml-2">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
