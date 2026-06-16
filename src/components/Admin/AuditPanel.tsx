import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Download,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ── Endpoint catalogue ────────────────────────────────────────────────────────
// Every known GET endpoint that should respond for a Master user.
// POST entries run a dry-run by sending an OPTIONS preflight (no body mutations).
const ENDPOINT_CATALOGUE = [
  // Core
  { group: 'Core', label: 'Health', url: '/health', method: 'GET', critical: true },
  { group: 'Core', label: 'Version', url: '/version', method: 'GET', critical: true },
  { group: 'Core', label: 'MSAL Config', url: '/auth/msal-config', method: 'GET', critical: false },
  { group: 'Core', label: 'Auth Status', url: '/auth/status', method: 'GET', critical: true },

  // Permissions & Config
  { group: 'Permissions', label: 'Bootstrap', url: '/permissions/bootstrap', method: 'GET', critical: true },
  { group: 'Permissions', label: 'Permissions v2', url: '/permissions/v2', method: 'GET', critical: true },
  { group: 'Permissions', label: 'Navigation Permissions', url: '/navigation/permissions', method: 'GET', critical: true },
  { group: 'Permissions', label: 'Action Permissions', url: '/action-permissions', method: 'GET', critical: true },

  // Admin
  { group: 'Admin', label: 'Admin Bootstrap', url: '/admin/bootstrap', method: 'GET', critical: true },
  { group: 'Admin', label: 'Users Authorized', url: '/users/authorized', method: 'GET', critical: true },
  { group: 'Admin', label: 'Audit Run', url: '/audit/run', method: 'GET', critical: true },
  { group: 'Admin', label: 'Notifications Status', url: '/notifications/status', method: 'GET', critical: false },
  { group: 'Admin', label: 'Reporting Config', url: '/reporting/config', method: 'GET', critical: false },
  { group: 'Admin', label: 'Telecast Config', url: '/telecast/config', method: 'GET', critical: false },

  // Data
  { group: 'Data', label: 'Opportunities', url: '/opportunities', method: 'GET', critical: true },
  { group: 'Data', label: 'Opportunities (stream head)', url: '/opportunities/stream', method: 'GET', critical: false, isSSE: true },
  { group: 'Data', label: 'Opportunities Post-bid Config', url: '/opportunities/post-bid-config', method: 'GET', critical: false },
  { group: 'Data', label: 'Opportunities Value Conflicts', url: '/opportunities/value-conflicts', method: 'GET', critical: false },
  { group: 'Data', label: 'Potential Opportunities', url: '/potential-opportunities', method: 'GET', critical: true },
  { group: 'Data', label: 'Bid Decisions', url: '/bid-decisions', method: 'GET', critical: true },
  { group: 'Data', label: 'BD Engagements', url: '/bd-engagements', method: 'GET', critical: false },
  { group: 'Data', label: 'Clients', url: '/clients', method: 'GET', critical: true },
  { group: 'Data', label: 'Clients Duplicates', url: '/clients/duplicates', method: 'GET', critical: false },
  { group: 'Data', label: 'Vendors', url: '/vendors', method: 'GET', critical: true },

  // Config variants
  { group: 'Config', label: 'EOI Duplicates Config', url: '/eoi-duplicates/config', method: 'GET', critical: false },
  { group: 'Config', label: 'Notifications Alerted', url: '/notifications/alerted', method: 'GET', critical: false },

  // PQ Activities
  { group: 'PQ Activities', label: 'PQ List', url: '/pq-activities?tenant=avenir_abudhabi', method: 'GET', critical: true },
  { group: 'PQ Activities', label: 'PQ Export', url: '/pq-activities/export?tenant=avenir_abudhabi', method: 'GET', critical: false },
] as const;

type EndpointDef = typeof ENDPOINT_CATALOGUE[number];

interface ProbeResult {
  url: string;
  label: string;
  group: string;
  method: string;
  status: number | null;
  ms: number | null;
  ok: boolean;
  error: string | null;
  responseSize: number | null;
  critical: boolean;
  isSSE?: boolean;
}

interface ServerAudit {
  generatedAt: string;
  auditMs: number;
  build: Record<string, unknown>;
  db: Record<string, unknown>;
  system: Record<string, unknown>;
  collections: Record<string, { count: number | null; ok: boolean; error?: string }>;
  config: Record<string, unknown> | null;
  authCache: Record<string, unknown>;
  env: Record<string, boolean | string>;
}

interface AuditReport {
  meta: {
    generatedAt: string;
    userAgent: string;
    baseUrl: string;
    totalDurationMs: number;
  };
  server: ServerAudit | null;
  endpoints: ProbeResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    criticalFailed: number;
    slowestEndpoints: Array<{ url: string; ms: number }>;
    avgMs: number;
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────
async function probeEndpoint(
  def: EndpointDef,
  token: string,
  signal: AbortSignal
): Promise<ProbeResult> {
  const base: Omit<ProbeResult, 'status' | 'ms' | 'ok' | 'error' | 'responseSize'> = {
    url: def.url,
    label: def.label,
    group: def.group,
    method: def.method,
    critical: def.critical,
    isSSE: 'isSSE' in def ? def.isSSE : false,
  };

  const t0 = performance.now();
  try {
    // For SSE, just open and immediately close — check that the server accepts the connection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 'isSSE' in def && def.isSSE ? 3000 : 12000);
    const combinedSignal = signal.aborted ? signal : controller.signal;

    const res = await fetch(`${API_URL}${def.url}`, {
      method: def.method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'isSSE' in def && def.isSSE ? 'text/event-stream' : 'application/json',
      },
      signal: combinedSignal,
    });

    clearTimeout(timeout);
    const ms = Math.round(performance.now() - t0);

    let responseSize: number | null = null;
    let errorText: string | null = null;

    if ('isSSE' in def && def.isSSE) {
      // For SSE, a 2xx means the stream connected successfully
      responseSize = 0;
      if (!res.ok) {
        try {
          const body = await res.text();
          errorText = body.slice(0, 200);
        } catch { /* ignore */ }
      }
    } else {
      try {
        const text = await res.text();
        responseSize = text.length;
        if (!res.ok) {
          try {
            const parsed = JSON.parse(text);
            errorText = parsed?.error || parsed?.message || text.slice(0, 200);
          } catch {
            errorText = text.slice(0, 200);
          }
        }
      } catch { /* ignore */ }
    }

    return {
      ...base,
      status: res.status,
      ms,
      ok: res.ok,
      error: errorText,
      responseSize,
    };
  } catch (e: unknown) {
    const ms = Math.round(performance.now() - t0);
    const err = e as Error;
    const isAbort = err?.name === 'AbortError';
    return {
      ...base,
      status: null,
      ms,
      ok: false,
      error: isAbort ? 'Timeout / connection aborted' : (err?.message || 'Network error'),
      responseSize: null,
    };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AuditPanel({ token }: { token: string | null }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Core', 'Data', 'Permissions']));
  const abortRef = useRef<AbortController | null>(null);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const runAudit = useCallback(async () => {
    if (!token) return;
    setRunning(true);
    setProgress(0);
    setReport(null);
    setCurrentStep('Fetching server diagnostics…');

    const abort = new AbortController();
    abortRef.current = abort;
    const auditStart = performance.now();

    try {
      // Step 1: Server-side audit
      let serverAudit: ServerAudit | null = null;
      try {
        const res = await fetch(`${API_URL}/audit/run`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        if (res.ok) serverAudit = await res.json();
      } catch { /* server audit failed — continue with endpoint probes */ }

      setProgress(10);
      const total = ENDPOINT_CATALOGUE.length;
      const results: ProbeResult[] = [];

      // Step 2: Probe every endpoint sequentially with a short gap to avoid nginx rate-limiting
      for (let i = 0; i < ENDPOINT_CATALOGUE.length; i++) {
        if (abort.signal.aborted) break;
        const def = ENDPOINT_CATALOGUE[i];
        setCurrentStep(`Probing ${def.method} ${def.url}…`);
        if (i > 0) await new Promise((r) => setTimeout(r, 1100));
        const result = await probeEndpoint(def, token, abort.signal);
        results.push(result);
        setProgress(10 + Math.round(((i + 1) / total) * 88));
      }

      setCurrentStep('Compiling report…');
      setProgress(99);

      const passed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      const criticalFailed = results.filter((r) => !r.ok && r.critical).length;
      const timings = results.filter((r) => r.ms !== null).map((r) => r.ms!);
      const avgMs = timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0;
      const slowestEndpoints = [...results]
        .filter((r) => r.ms !== null)
        .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
        .slice(0, 5)
        .map((r) => ({ url: r.url, ms: r.ms! }));

      const finalReport: AuditReport = {
        meta: {
          generatedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          baseUrl: window.location.origin,
          totalDurationMs: Math.round(performance.now() - auditStart),
        },
        server: serverAudit,
        endpoints: results,
        summary: {
          total: results.length,
          passed,
          failed,
          criticalFailed,
          slowestEndpoints,
          avgMs,
        },
      };

      setReport(finalReport);
      setProgress(100);
      setCurrentStep('');
      // Auto-expand all failed groups
      const failedGroups = new Set(results.filter((r) => !r.ok).map((r) => r.group));
      setExpandedGroups((prev) => new Set([...prev, ...failedGroups]));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [token]);

  const downloadReport = useCallback(() => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `avenir-audit-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const abort = () => {
    abortRef.current?.abort();
    setRunning(false);
    setCurrentStep('Cancelled');
  };

  const groups = Array.from(new Set(ENDPOINT_CATALOGUE.map((e) => e.group)));

  const getGroupResults = (group: string) =>
    report?.endpoints.filter((r) => r.group === group) ?? [];

  const getGroupStatus = (group: string) => {
    const results = getGroupResults(group);
    if (!results.length) return null;
    if (results.some((r) => !r.ok && r.critical)) return 'critical';
    if (results.some((r) => !r.ok)) return 'warning';
    return 'ok';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border bg-background p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-semibold text-base">System Audit</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Probes every API endpoint, checks MongoDB, collections, config, and environment.
              Each probe is spaced 1.1s apart to avoid nginx rate limiting (~35s total).
              Download the report and share it for diagnosis.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {report && (
              <Button variant="outline" size="sm" onClick={downloadReport} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download Report
              </Button>
            )}
            {running ? (
              <Button variant="destructive" size="sm" onClick={abort} className="gap-1.5">
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={runAudit} disabled={!token} className="gap-1.5">
                {report ? <RefreshCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {report ? 'Re-run Audit' : 'Run Full Audit'}
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(running || progress > 0) && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{currentStep || (progress === 100 ? 'Complete' : '')}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {/* Summary row */}
        {report && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={report.summary.criticalFailed > 0 ? 'destructive' : 'default'} className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> {report.summary.passed} passed
            </Badge>
            {report.summary.failed > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" /> {report.summary.failed} failed
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" /> avg {report.summary.avgMs}ms
            </Badge>
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              {report.meta.totalDurationMs}ms total
            </Badge>
          </div>
        )}
      </div>

      {/* Server-side diagnostics */}
      {report?.server && (
        <div className="rounded-xl border bg-background p-4 space-y-3">
          <div className="font-semibold text-sm">Server Diagnostics</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard
              label="DB State"
              value={String(report.server.db.readyStateLabel ?? report.server.db.readyState)}
              ok={report.server.db.readyState === 1}
            />
            <MetricCard
              label="DB Ping"
              value={report.server.db.pingMs !== null ? `${report.server.db.pingMs}ms` : 'N/A'}
              ok={report.server.db.pingMs !== null && (report.server.db.pingMs as number) < 200}
              warn={report.server.db.pingMs !== null && (report.server.db.pingMs as number) >= 200}
            />
            <MetricCard
              label="Uptime"
              value={formatUptime(report.server.system.uptimeSec as number)}
              ok
            />
            <MetricCard
              label="Node"
              value={String(report.server.build.nodeVersion ?? '—')}
              ok
            />
            <MetricCard
              label="Auth Cache"
              value={`${(report.server.authCache.size as number)} entries`}
              ok
            />
            <MetricCard
              label="Audit took"
              value={`${report.server.auditMs}ms`}
              ok={report.server.auditMs < 3000}
              warn={report.server.auditMs >= 3000}
            />
          </div>

          {/* Collections */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Collections</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(report.server.collections).map(([name, col]) => (
                <div key={name} className="flex justify-between items-center rounded-md border px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground truncate mr-2">{name}</span>
                  <span className={cn('font-mono font-semibold', col.ok ? 'text-foreground' : 'text-destructive')}>
                    {col.ok ? col.count?.toLocaleString() ?? '0' : 'ERR'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Env flags */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Environment</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.server.env).map(([key, val]) => {
                const isSet = val === true || val === 'true' || (typeof val === 'string' && val.length > 0 && val !== 'false');
                return (
                  <div key={key} className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium border',
                    isSet ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-destructive/30 bg-destructive/10 text-destructive'
                  )}>
                    {key}: {String(val)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Endpoint results by group */}
      {report && (
        <div className="space-y-2">
          {groups.map((group) => {
            const results = getGroupResults(group);
            if (!results.length) return null;
            const status = getGroupStatus(group);
            const expanded = expandedGroups.has(group);

            return (
              <div key={group} className="rounded-xl border bg-background overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                  onClick={() => toggleGroup(group)}
                >
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-medium text-sm">{group}</span>
                    <span className="text-xs text-muted-foreground">({results.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'ok' && <Badge variant="default" className="h-5 text-[10px]">All OK</Badge>}
                    {status === 'warning' && <Badge variant="secondary" className="h-5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Issues</Badge>}
                    {status === 'critical' && <Badge variant="destructive" className="h-5 text-[10px]">Critical</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {results.filter((r) => r.ok).length}/{results.length}
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t divide-y">
                    {results.map((r) => (
                      <EndpointRow key={r.url} result={r} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Slowest endpoints */}
      {report && report.summary.slowestEndpoints.length > 0 && (
        <div className="rounded-xl border bg-background p-4 space-y-2">
          <div className="font-semibold text-sm">Slowest Endpoints</div>
          <div className="space-y-1">
            {report.summary.slowestEndpoints.map((s) => (
              <div key={s.url} className="flex justify-between items-center text-sm">
                <span className="font-mono text-xs text-muted-foreground">{s.url}</span>
                <span className={cn(
                  'font-mono font-semibold text-xs',
                  s.ms > 2000 ? 'text-destructive' : s.ms > 800 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                )}>
                  {s.ms}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!running && !report && (
        <div className="rounded-xl border border-dashed bg-background/50 p-10 text-center text-sm text-muted-foreground">
          Press <strong>Run Full Audit</strong> to probe all API endpoints and collect server diagnostics.
          The result is a downloadable JSON file you can share for diagnosis.
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function EndpointRow({ result }: { result: ProbeResult }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = result.ok
    ? 'text-emerald-600 dark:text-emerald-400'
    : result.critical
      ? 'text-destructive'
      : 'text-amber-600 dark:text-amber-400';

  const msColor = result.ms == null
    ? 'text-muted-foreground'
    : result.ms > 2000
      ? 'text-destructive'
      : result.ms > 800
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {result.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            : result.critical
              ? <XCircle className="h-3.5 w-3.5 text-destructive" />
              : <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{result.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground truncate">{result.url}</span>
            {result.isSSE && <Badge variant="outline" className="text-[10px] h-4">SSE</Badge>}
            {result.critical && <Badge variant="outline" className="text-[10px] h-4 border-amber-500/40 text-amber-600 dark:text-amber-400">critical</Badge>}
          </div>
          {result.error && (
            <div className="text-[10px] text-destructive mt-0.5 truncate">{result.error}</div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className={cn('font-mono', msColor)}>
            {result.ms !== null ? `${result.ms}ms` : '—'}
          </span>
          <span className={cn('font-mono font-semibold', statusColor)}>
            {result.status ?? 'ERR'}
          </span>
          {result.responseSize !== null && (
            <span className="text-[10px] text-muted-foreground">{formatBytes(result.responseSize)}</span>
          )}
          {result.error && (
            <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      </div>
      {expanded && result.error && (
        <ScrollArea className="mt-2 rounded bg-muted p-2 text-[10px] font-mono h-16">
          {result.error}
        </ScrollArea>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        'text-sm font-semibold',
        warn ? 'text-amber-600 dark:text-amber-400' : ok ? 'text-foreground' : 'text-destructive'
      )}>
        {value}
      </div>
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatUptime(sec: number): string {
  if (!sec) return '0s';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${sec}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
