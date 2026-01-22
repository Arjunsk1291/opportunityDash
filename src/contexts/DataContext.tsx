import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity } from '@/data/opportunityData';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
      
      const dataWithIds = data.map((opp: any) => ({
        ...opp,
        id: opp.id || opp._id || opp.opportunityRefNo,
      }));
      
      setOpportunities(dataWithIds);
      setLastSyncTime(new Date());
      setError(null);
    } catch (err: any) {
      const errorMsg = 'Failed to load data: ' + err.message;
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
