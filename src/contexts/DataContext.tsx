import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { Opportunity } from '@/data/opportunityData';
import { isSubmissionWithinDays } from '@/lib/submissionDate';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LIVE_REFRESH_INTERVAL = 5 * 60 * 1000;
const MIN_BACKGROUND_REFRESH_GAP_MS = 45 * 1000;
const OPPORTUNITIES_CACHE_KEY = 'opportunities-cache-v1';
const OPPORTUNITIES_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type OpportunityApiRecord = Partial<Opportunity> & {
  _id?: string;
  id?: string;
  opportunityRefNo?: string;
};

const shouldHideOpportunity = (opp: OpportunityApiRecord) => (
  String(opp?.groupClassification || '').trim().toUpperCase() === 'GPS'
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
  lastSyncTime: Date | null;
  isLiveRefreshActive: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, isLoading: isAuthLoading } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isLiveRefreshActive, setIsLiveRefreshActive] = useState(true);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastSuccessfulRefreshAtRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const cacheHydratedRef = useRef(false);

  const refreshData = useCallback(async (options?: { background?: boolean; force?: boolean }) => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }
    if (isAuthLoading) return;
    if (!token) {
      setIsLoading(false);
      setOpportunities([]);
      hasLoadedOnceRef.current = false;
      return;
    }
    const isBackground = Boolean(options?.background);
    const forceRefresh = Boolean(options?.force);
    if (!cacheHydratedRef.current && !isBackground) {
      cacheHydratedRef.current = true;
      try {
        const raw = window.sessionStorage.getItem(OPPORTUNITIES_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { ts?: number; rows?: Opportunity[] };
          const ts = Number(parsed?.ts || 0);
          const ageMs = ts ? Date.now() - ts : Number.POSITIVE_INFINITY;
          const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
          if (rows.length > 0 && ageMs <= OPPORTUNITIES_CACHE_MAX_AGE_MS) {
            setOpportunities(rows);
            setLastSyncTime(new Date(ts));
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
            console.log(`⚡ Warm-loaded ${rows.length} opportunities from session cache (age=${Math.round(ageMs / 1000)}s)`);
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
      const url = API_URL + '/opportunities';
      const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
      const trigger = isBackground ? 'background' : 'foreground';
      try {
        console.log(`🔄 Loading opportunities from MongoDB... route=${route} trigger=${trigger}`);
        const fetchStart = performance.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const fetchEnd = performance.now();
        
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const parseStart = performance.now();
        const data = await response.json();
        const parseEnd = performance.now();
        console.log('✅ Loaded ' + data.length + ' opportunities from MongoDB');
        
        // ✅ Filter out opportunities with empty opportunityRefNo / hidden groups
        const filterStart = performance.now();
        const rawRecords = (Array.isArray(data) ? data : []) as OpportunityApiRecord[];
        const drops = { missingRefNo: 0, hiddenGroup: 0 };
        const groupCounts = new Map<string, number>();

        rawRecords.forEach((opp) => {
          const group = String(opp?.groupClassification || '').trim().toUpperCase() || '∅';
          groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        });

        const validData = rawRecords.filter((opp) => {
          const refNo = String(opp?.opportunityRefNo || '').trim();
          if (!refNo) {
            drops.missingRefNo += 1;
            return false;
          }
          if (shouldHideOpportunity(opp)) {
            drops.hiddenGroup += 1;
            return false;
          }
          return true;
        });
        const filterEnd = performance.now();
        
        const mapStart = performance.now();
        const dataWithIds = validData.map((opp) => ({
          ...opp,
          id: opp.id || opp._id || opp.opportunityRefNo,
          isAtRisk: computeSubmissionNear(opp),
        }));
        const mapEnd = performance.now();
        
        // Diagnostics for "why am I only seeing N rows?"
        if (validData.length < rawRecords.length) {
          const topGroups = Array.from(groupCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([group, count]) => ({ group, count }));
          console.log('⚠️ Opportunities filtered before UI render', {
            rowsRaw: rawRecords.length,
            rowsKept: validData.length,
            dropped: rawRecords.length - validData.length,
            drops,
            topGroups,
          });
        }
        
        const stateStart = performance.now();
        setOpportunities(dataWithIds as Opportunity[]);
        const stateEnd = performance.now();
        const totalEnd = performance.now();
        const totalMs = Math.round(totalEnd - totalStart);
        const fetchMs = Math.round(fetchEnd - fetchStart);
        const parseMs = Math.round(parseEnd - parseStart);
        const filterMs = Math.round(filterEnd - filterStart);
        const mapMs = Math.round(mapEnd - mapStart);
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

        const performanceEntries = performance.getEntriesByName(url);
        const resourceEntry = performanceEntries.length
          ? performanceEntries[performanceEntries.length - 1] as PerformanceResourceTiming
          : null;
        const ttfbMs = resourceEntry ? Math.round(resourceEntry.responseStart - resourceEntry.requestStart) : -1;
        const downloadMs = resourceEntry ? Math.round(resourceEntry.responseEnd - resourceEntry.responseStart) : -1;
        const transferSize = resourceEntry?.transferSize ?? 0;
        const encodedBodySize = resourceEntry?.encodedBodySize ?? 0;
        const decodedBodySize = resourceEntry?.decodedBodySize ?? 0;

        console.log(`⏱️ Opportunities load time: total=${totalMs}ms (network=${fetchMs}ms, processing=${processingMs}ms)`);
        const detailPayload = {
          route,
          trigger,
          rowsRaw: Array.isArray(data) ? data.length : 0,
          rowsKept: dataWithIds.length,
          frontend: {
            totalMs,
            fetchMs,
            parseMs,
            filterMs,
            mapMs,
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
        console.log('[perf.opportunities.detail]', detailPayload);
        console.log('[perf.opportunities.detail.json]', JSON.stringify(detailPayload));
        setLastSyncTime(new Date());
        setError(null);
        hasLoadedOnceRef.current = true;
        lastSuccessfulRefreshAtRef.current = Date.now();
        try {
          window.sessionStorage.setItem(OPPORTUNITIES_CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            rows: dataWithIds,
          }));
        } catch {
          // Ignore cache quota/storage errors.
        }
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
  }, [isAuthLoading, token]);

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      refreshData({ background: true });
    }, LIVE_REFRESH_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
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
  }, [refreshData]);

  return (
    <DataContext.Provider 
      value={{ 
        opportunities,
        isLoading,
        error,
        refreshData,
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
