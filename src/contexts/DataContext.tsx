import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity } from '@/data/opportunityData';
import { isSubmissionWithinDays } from '@/lib/submissionDate';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type OpportunityApiRecord = Partial<Opportunity> & {
  _id?: string;
  id?: string;
  opportunityRefNo?: string;
};

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
  refreshData: () => Promise<void>;
  lastSyncTime: Date | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
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
      const validData = (data as OpportunityApiRecord[]).filter((opp) => opp.opportunityRefNo && opp.opportunityRefNo.trim() !== '');
      
      const dataWithIds = validData.map((opp) => ({
        ...opp,
        id: opp.id || opp._id || opp.opportunityRefNo,
        isAtRisk: computeSubmissionNear(opp),
      }));
      
      // Log filtered count
      if (validData.length < data.length) {
        console.log(`⚠️  Filtered out ${data.length - validData.length} opportunities with empty refNo`);
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

  return (
    <DataContext.Provider 
      value={{ 
        opportunities,
        isLoading,
        error,
        refreshData,
        lastSyncTime,
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
