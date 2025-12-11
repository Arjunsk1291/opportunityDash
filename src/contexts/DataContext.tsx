import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity, generateOpportunities } from '@/data/opportunityData';

interface DataContextType {
  opportunities: Opportunity[];
  clearAllData: () => void;
  resetToMockData: () => void;
  isDataCleared: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => generateOpportunities());
  const [isDataCleared, setIsDataCleared] = useState(false);

  const clearAllData = useCallback(() => {
    setOpportunities([]);
    setIsDataCleared(true);
    // Clear localStorage items
    localStorage.removeItem('opportunities');
    localStorage.removeItem('syncLogs');
    localStorage.removeItem('sharePointConfig');
    localStorage.removeItem('leadMappings');
  }, []);

  const resetToMockData = useCallback(() => {
    setOpportunities(generateOpportunities());
    setIsDataCleared(false);
  }, []);

  return (
    <DataContext.Provider value={{ opportunities, clearAllData, resetToMockData, isDataCleared }}>
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
