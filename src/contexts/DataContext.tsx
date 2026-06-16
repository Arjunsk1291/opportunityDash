/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { Opportunity } from '@/data/opportunityData';
import { isSubmissionWithinDays } from '@/lib/submissionDate';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { EAGER_OPPORTUNITY_ROUTES } from '@/contexts/dataContextConfig';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LIVE_REFRESH_INTERVAL = 5 * 60 * 1000;
const MIN_BACKGROUND_REFRESH_GAP_MS = 45 * 1000;
const OPPORTUNITIES_CACHE_KEY = 'opportunities-cache-v2';
const OPPORTUNITIES_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const OPPORTUNITY_FULL_ROUTES = new Set(['/opportunities', '/bid-decision', '/tender-spreadsheet-v2']);

type OpportunityApiRecord = Partial<Opportunity> & {
  _id?: string;
  id?: string;
  opportunityRefNo?: string;
};

type OpportunityFetchView = 'full' | 'lite';

type OpportunityCacheEntry = {
  ts: number;
  view: OpportunityFetchView;
  rows: Opportunity[];
};

type OpportunityChangesResponse = {
  success?: boolean;
  rows?: OpportunityApiRecord[];
  snapshotAt?: string | null;
  latestSnapshotAt?: string | null;
  view?: OpportunityFetchView;
  fullReloadRecommended?: boolean;
};

const shouldHideOpportunity = (opp: OpportunityApiRecord) => (
  String(opp?.groupClassification || '').trim().toUpperCase() === 'GPS'
);

const getOpportunityIdentity = (opp: OpportunityApiRecord) => (
  String(opp?.id || opp?._id || opp?.opportunityRefNo || '').trim()
);

const getOpportunityViewForRoute = (pathname: string): OpportunityFetchView => (
  OPPORTUNITY_FULL_ROUTES.has(pathname) || Array.from(OPPORTUNITY_FULL_ROUTES).some((route) => pathname.startsWith(`${route}/`))
    ? 'full'
    : 'lite'
);

function computeSubmissionNear(opp: Partial<Opportunity>): boolean {
  return isSubmissionWithinDays(
    {
      tenderSubmittedDate: opp?.tenderSubmittedDate || null,
      tenderPlannedSubmissionDate: opp?.tenderPlannedSubmissionDate || null,
    },
    10,
  );
}

interface DataContextType {
  opportunities: Opportunity[];
  isLoading: boolean;
  error: string | null;
  refreshData: (options?: { background?: boolean; force?: boolean }) => Promise<void>;
  upsertOpportunities: (rows: Partial<Opportunity>[]) => void;
  lastSyncTime: Date | null;
  isLiveRefreshActive: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, isLoading: isAuthLoading } = useAuth();
  const location = useLocation();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isLiveRefreshActive, setIsLiveRefreshActive] = useState(true);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastSuccessfulRefreshAtRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const cacheHydratedRef = useRef(false);
  const currentViewRef = useRef<OpportunityFetchView>('lite');
  // routeViewRef stays current via a separate effect so refreshData doesn't
  // need location.pathname in its dependency array (which caused a new function
  // reference — and therefore a duplicate fetch — on every navigation).
  const routeViewRef = useRef<OpportunityFetchView>('lite');
  const opportunitiesRef = useRef<Opportunity[]>([]);
  const lastSyncTimeRef = useRef<Date | null>(null);
  const streamRetryTimerRef = useRef<number | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef('');
  const streamActiveRef = useRef(false);

  useEffect(() => {
    opportunitiesRef.current = opportunities;
  }, [opportunities]);

  useEffect(() => {
    lastSyncTimeRef.current = lastSyncTime;
  }, [lastSyncTime]);

  useEffect(() => {
    routeViewRef.current = getOpportunityViewForRoute(location.pathname);
  }, [location.pathname]);

  const buildVisibleOpportunity = useCallback((opp: OpportunityApiRecord): Opportunity | null => {
    const refNo = String(opp?.opportunityRefNo || '').trim();
    if (!refNo) return null;
    if (shouldHideOpportunity(opp)) return null;
    return {
      ...(opp as Opportunity),
      id: getOpportunityIdentity(opp) || refNo,
      isAtRisk: computeSubmissionNear(opp),
    } as Opportunity;
  }, []);

  const normalizeOpportunityRows = useCallback((rows: OpportunityApiRecord[]) => (
    rows
      .map((opp) => buildVisibleOpportunity(opp))
      .filter(Boolean) as Opportunity[]
  ), [buildVisibleOpportunity]);

  const mergeOpportunityRows = useCallback((previous: Opportunity[], incoming: OpportunityApiRecord[], replace = false) => {
    const byId = new Map<string, Opportunity>();
    if (!replace) {
      previous.forEach((opp) => {
        byId.set(String(opp.id || opp.opportunityRefNo || '').trim(), opp);
      });
    }

    incoming.forEach((row) => {
      const identity = getOpportunityIdentity(row);
      if (!identity) return;
      const visible = buildVisibleOpportunity(row);
      if (!visible) {
        byId.delete(identity);
        return;
      }
      byId.set(identity, visible);
    });

    return Array.from(byId.values());
  }, [buildVisibleOpportunity]);

  const persistOpportunityCache = useCallback((rows: Opportunity[], view: OpportunityFetchView) => {
    try {
      const payload: OpportunityCacheEntry = {
        ts: Date.now(),
        view,
        rows,
      };
      window.sessionStorage.setItem(OPPORTUNITIES_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, []);

  const upsertOpportunities = useCallback((rows: Partial<Opportunity>[]) => {
    if (!rows.length) return;
    setOpportunities((previous) => {
      const next = mergeOpportunityRows(previous, rows as OpportunityApiRecord[]);
      persistOpportunityCache(next, currentViewRef.current);
      return next;
    });
    const latestSyncedAt = rows
      .map((row) => {
        const syncedAtValue = (row as { syncedAt?: unknown } | null)?.syncedAt;
        return syncedAtValue ? new Date(syncedAtValue as string | number | Date) : null;
      })
      .filter((date): date is Date => Boolean(date) && !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    setLastSyncTime(latestSyncedAt || new Date());
  }, [mergeOpportunityRows, persistOpportunityCache]);

  const refreshData = useCallback(async (options?: { background?: boolean; force?: boolean }) => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }
    if (isAuthLoading) return;
    if (!token) {
      setIsLoading(false);
      setOpportunities([]);
      hasLoadedOnceRef.current = false;
      currentViewRef.current = 'lite';
      return;
    }

    const isBackground = Boolean(options?.background);
    const forceRefresh = Boolean(options?.force);
    const route = window.location.pathname || '';
    const routeView = routeViewRef.current;
    const currentLastSyncTime = lastSyncTimeRef.current;
    const canUseIncremental = Boolean(currentLastSyncTime) && !forceRefresh && (isBackground || streamActiveRef.current);
    const cacheKey = OPPORTUNITIES_CACHE_KEY;

    if (!cacheHydratedRef.current && !isBackground) {
      cacheHydratedRef.current = true;
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<OpportunityCacheEntry> | null;
          const ts = Number(parsed?.ts || 0);
          const ageMs = ts ? Date.now() - ts : Number.POSITIVE_INFINITY;
          const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
          const cacheView = String(parsed?.view || 'full') === 'lite' ? 'lite' : 'full';
          const cacheCompatible = cacheView === 'full' || routeView === 'lite' || (cacheView as OpportunityFetchView) === routeView;
          if (rows.length > 0 && ageMs <= OPPORTUNITIES_CACHE_MAX_AGE_MS && cacheCompatible) {
            setOpportunities(rows as Opportunity[]);
            setLastSyncTime(new Date(ts));
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
            currentViewRef.current = cacheView;
            lastSuccessfulRefreshAtRef.current = Date.now();
          }
        }
      } catch {
        // Ignore cache parse/storage errors.
      }
    }

    const now = Date.now();
    if (!forceRefresh && isBackground && now - lastSuccessfulRefreshAtRef.current < MIN_BACKGROUND_REFRESH_GAP_MS) {
      return;
    }

    if (!isBackground) {
      setIsLoading(!hasLoadedOnceRef.current);
    }
    setError(null);

    const refreshPromise = (async () => {
      const totalStart = performance.now();
      const trigger = isBackground ? 'background' : 'foreground';
      const requestView: OpportunityFetchView = routeView;
      const incrementalSince = canUseIncremental && currentLastSyncTime ? currentLastSyncTime.toISOString() : null;
      const requestPath = incrementalSince
        ? `/opportunities/changes?since=${encodeURIComponent(incrementalSince)}&view=${requestView}`
        : `/opportunities?view=${requestView}`;
      const url = API_URL + requestPath;
      try {
        const fetchStart = performance.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const fetchEnd = performance.now();

        if (response.status === 503) {
          const message = 'Backend temporarily unavailable';
          if (!isBackground && !opportunitiesRef.current.length) {
            setError(message);
          }
          lastSuccessfulRefreshAtRef.current = Date.now();
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const parseStart = performance.now();
        const data = incrementalSince
          ? await response.json() as OpportunityChangesResponse
          : await response.json() as OpportunityApiRecord[];
        const parseEnd = performance.now();

        const changes = incrementalSince ? (data as OpportunityChangesResponse) : null;
        const sourceRows = changes
          ? Array.isArray(changes.rows) ? changes.rows : []
          : Array.isArray(data) ? (data as OpportunityApiRecord[]) : [];
        const nextRows = incrementalSince
          ? mergeOpportunityRows(opportunitiesRef.current, sourceRows, false)
          : normalizeOpportunityRows(sourceRows);
        const stateStart = performance.now();
        setOpportunities(nextRows as Opportunity[]);
        const stateEnd = performance.now();

        const totalEnd = performance.now();
        const totalMs = Math.round(totalEnd - totalStart);
        const fetchMs = Math.round(fetchEnd - fetchStart);
        const parseMs = Math.round(parseEnd - parseStart);
        const stateMs = Math.round(stateEnd - stateStart);
        const processingMs = Math.round(totalEnd - parseStart);

        const backendTotalMs = Number(response.headers.get('X-Opps-Total-Ms') || 0);
        const backendAuthMs = Number(response.headers.get('X-Opps-Auth-Ms') || 0);
        const backendFetchMs = Number(response.headers.get('X-Opps-Fetch-Ms') || 0);
        const backendMergeMs = Number(response.headers.get('X-Opps-Merge-Ms') || 0);
        const backendMapMs = Number(response.headers.get('X-Opps-Map-Ms') || 0);
        const backendFetchOppsMs = Number(response.headers.get('X-Opps-Fetch-Opps-Ms') || 0);
        const backendFetchManualMs = Number(response.headers.get('X-Opps-Fetch-Manual-Ms') || 0);
        const backendFetchConflictsMs = Number(response.headers.get('X-Opps-Fetch-Conflicts-Ms') || 0);
        const snapshotAtHeader = response.headers.get('X-Opps-Snapshot-At');
        const nextSyncDate = snapshotAtHeader
          ? new Date(snapshotAtHeader)
          : changes
            ? new Date(String(changes.snapshotAt || changes.latestSnapshotAt || new Date().toISOString()))
            : new Date();
        if (!Number.isNaN(nextSyncDate.getTime())) {
          setLastSyncTime(nextSyncDate);
        }
        currentViewRef.current = requestView;
        setError(null);
        hasLoadedOnceRef.current = true;
        lastSuccessfulRefreshAtRef.current = Date.now();
        persistOpportunityCache(nextRows as Opportunity[], requestView);

        const performanceEntries = performance.getEntriesByName(url);
        const resourceEntry = performanceEntries.length
          ? performanceEntries[performanceEntries.length - 1] as PerformanceResourceTiming
          : null;
        const ttfbMs = resourceEntry ? Math.round(resourceEntry.responseStart - resourceEntry.requestStart) : -1;
        const downloadMs = resourceEntry ? Math.round(resourceEntry.responseEnd - resourceEntry.responseStart) : -1;
        const transferSize = resourceEntry?.transferSize ?? 0;
        const encodedBodySize = resourceEntry?.encodedBodySize ?? 0;
        const decodedBodySize = resourceEntry?.decodedBodySize ?? 0;

        const detailPayload = {
          route,
          trigger,
          view: requestView,
          incremental: Boolean(incrementalSince),
          rowsRaw: sourceRows.length,
          rowsKept: nextRows.length,
          frontend: {
            totalMs,
            fetchMs,
            parseMs,
            stateSetMs: stateMs,
            processingMs,
          },
          browserNetwork: {
            ttfbMs,
            downloadMs,
            transferSize,
            encodedBodySize,
            decodedBodySize,
          },
          backend: {
            totalMs: backendTotalMs,
            authMs: backendAuthMs,
            fetchMs: backendFetchMs,
            mergeMs: backendMergeMs,
            mapMs: backendMapMs,
            fetchBreakdownMs: {
              opportunities: backendFetchOppsMs,
              manual: backendFetchManualMs,
              conflicts: backendFetchConflictsMs,
            },
          },
        };
        void detailPayload;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const errorMsg = 'Failed to load data: ' + message;
        console.error('❌', errorMsg);
        setError(errorMsg);
        if (!isBackground) {
          setOpportunities([]);
        }
      } finally {
        setIsLoading(false);
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = refreshPromise;
    return refreshPromise;
  }, [
    isAuthLoading,
    token,
    mergeOpportunityRows,
    normalizeOpportunityRows,
    persistOpportunityCache,
    buildVisibleOpportunity,
  ]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!token) return;

    const isEagerRoute = EAGER_OPPORTUNITY_ROUTES.has(location.pathname)
      || Array.from(EAGER_OPPORTUNITY_ROUTES).some((route) => route !== '/' && location.pathname.startsWith(`${route}/`));
    if (isEagerRoute) {
      void refreshData().catch(() => {});
      return;
    }
    void refreshData({ background: true }).catch(() => {});
  }, [refreshData, location.pathname, token, isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading || !token) return;

    let disposed = false;
    let reconnectDelay = 2500;

    const scheduleReconnect = () => {
      if (disposed) return;
      if (streamRetryTimerRef.current) {
        window.clearTimeout(streamRetryTimerRef.current);
      }
      streamRetryTimerRef.current = window.setTimeout(() => {
        streamRetryTimerRef.current = null;
        void connectStream();
      }, reconnectDelay);
      reconnectDelay = Math.min(30000, reconnectDelay * 2);
    };

    const handleBlock = (block: string) => {
      const lines = block.split('\n').map((line) => line.trimEnd());
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (eventName !== 'opportunities' || !dataLines.length) return;
      try {
        const payload = JSON.parse(dataLines.join('\n')) as { type?: string; rows?: unknown[] };
        if (payload?.type === 'full-reload') {
          void refreshData({ force: true }).catch(() => {});
        } else if (payload?.type === 'incremental') {
          if (Array.isArray(payload.rows) && payload.rows.length > 0) {
            upsertOpportunities(payload.rows as Partial<Opportunity>[]);
          } else {
            void refreshData({ background: true }).catch(() => {});
          }
        }
      } catch {
        // Ignore malformed push payloads.
      }
    };

    const connectStream = async () => {
      if (disposed) return;
      try {
        streamAbortRef.current?.abort();
        const controller = new AbortController();
        streamAbortRef.current = controller;
        const response = await fetch(API_URL + '/opportunities/stream', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error('Failed to open opportunities stream');
        }

        streamActiveRef.current = true;
        setIsLiveRefreshActive(true);
        reconnectDelay = 2500;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        streamBufferRef.current = '';

        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) break;
          streamBufferRef.current += decoder.decode(value, { stream: true });
          streamBufferRef.current = streamBufferRef.current.replace(/\r\n/g, '\n');

          let separatorIndex = streamBufferRef.current.indexOf('\n\n');
          while (separatorIndex !== -1) {
            const block = streamBufferRef.current.slice(0, separatorIndex);
            streamBufferRef.current = streamBufferRef.current.slice(separatorIndex + 2);
            handleBlock(block);
            separatorIndex = streamBufferRef.current.indexOf('\n\n');
          }
        }
        if (!disposed) {
          streamActiveRef.current = false;
          setIsLiveRefreshActive(false);
          scheduleReconnect();
        }
      } catch {
        streamActiveRef.current = false;
        setIsLiveRefreshActive(false);
        scheduleReconnect();
      }
    };

    void connectStream();

    return () => {
      disposed = true;
      streamActiveRef.current = false;
      setIsLiveRefreshActive(false);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (streamRetryTimerRef.current) {
        window.clearTimeout(streamRetryTimerRef.current);
        streamRetryTimerRef.current = null;
      }
    };
  }, [isAuthLoading, token, refreshData, upsertOpportunities]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const route = location.pathname || '';
      if (route === '/master' || route.startsWith('/master/')) return;
      refreshData({ background: true });
    }, LIVE_REFRESH_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const route = location.pathname || '';
        if (route === '/master' || route.startsWith('/master/')) return;
        refreshData({ background: true });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    setIsLiveRefreshActive(true);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setIsLiveRefreshActive(false);
    };
  }, [location.pathname, refreshData]);

  return (
    <DataContext.Provider 
      value={{ 
        opportunities,
        isLoading,
        error,
        refreshData,
        upsertOpportunities,
        lastSyncTime,
        isLiveRefreshActive,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
