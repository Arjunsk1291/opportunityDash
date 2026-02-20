import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity } from '@/data/opportunityData';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function computeSubmissionNear(opp: any): boolean {
  const raw = opp?.tenderSubmittedDate || opp?.tenderPlannedSubmissionDate;
  if (!raw) return false;
  const target = new Date(raw);
  if (Number.isNaN(target.getTime())) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
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
      const validData = data.filter((opp: any) => opp.opportunityRefNo && opp.opportunityRefNo.trim() !== '');
      
      const dataWithIds = validData.map((opp: any) => ({
        ...opp,
        id: opp.id || opp._id || opp.opportunityRefNo,
        isAtRisk: computeSubmissionNear(opp),
      }));
      
      // Log filtered count
      if (validData.length < data.length) {
        console.log(`⚠️  Filtered out ${data.length - validData.length} opportunities with empty refNo`);
      }
      
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
