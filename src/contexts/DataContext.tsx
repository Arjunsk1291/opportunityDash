import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity } from '@/data/opportunityData';
import { isSubmissionWithinDays } from '@/lib/submissionDate';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LIVE_REFRESH_INTERVAL = 5 * 60 * 1000;

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
  refreshData: (options?: { background?: boolean }) => Promise<void>;
  lastSyncTime: Date | null;
  isLiveRefreshActive: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isLiveRefreshActive, setIsLiveRefreshActive] = useState(true);

  const refreshData = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = Boolean(options?.background);
    if (!isBackground) {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      console.log('🔄 Loading opportunities from MongoDB...');
      
      const response = await fetch(API_URL + '/opportunities', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      
      const data = await response.json();
      console.log('✅ Loaded ' + data.length + ' opportunities from MongoDB');
      
      // ✅ UPDATED: Filter out opportunities with empty opportunityRefNo
      const validData = (data as OpportunityApiRecord[]).filter((opp) => (
        opp.opportunityRefNo
        && opp.opportunityRefNo.trim() !== ''
        && !shouldHideOpportunity(opp)
      ));
      
      const dataWithIds = validData.map((opp) => ({
        ...opp,
        id: opp.id || opp._id || opp.opportunityRefNo,
        isAtRisk: computeSubmissionNear(opp),
      }));
      
      // Log filtered count
      if (validData.length < data.length) {
        console.log(`⚠️  Filtered out ${data.length - validData.length} opportunities with empty refNo or hidden groups`);
      }
      
      setOpportunities(dataWithIds as Opportunity[]);
      setLastSyncTime(new Date());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const errorMsg = 'Failed to load data: ' + message;
      console.error('❌', errorMsg);
      setError(errorMsg);
      setOpportunities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
