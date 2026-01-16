import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Opportunity, generateOpportunities } from '@/data/opportunityData';
import { googleSheetsService } from '@/services/googleSheetsService';

interface DataContextType {
  opportunities: Opportunity[];
  clearAllData: () => void;
  resetToMockData: () => void;
  refreshFromSheets: (data: Record<string, any>[]) => void;
  isDataCleared: boolean;
  // Google Sheets specific
  loadFromGoogleSheets: () => Promise<void>;
  isLoading: boolean;
  lastSyncTime: Date | null;
  isGoogleSheetsConnected: boolean;
  syncError: string | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => generateOpportunities());
  const [isDataCleared, setIsDataCleared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isGoogleSheetsConnected, setIsGoogleSheetsConnected] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Check if Google Sheets is configured on mount
  useEffect(() => {
    const checkGoogleSheetsConfig = () => {
      const config = localStorage.getItem('googleSheetsConfig');
      setIsGoogleSheetsConnected(!!config);
    };
    checkGoogleSheetsConfig();
  }, []);

  const clearAllData = useCallback(() => {
    setOpportunities([]);
    setIsDataCleared(true);
    localStorage.removeItem('opportunities');
    localStorage.removeItem('syncLogs');
    localStorage.removeItem('sharePointConfig');
    localStorage.removeItem('leadMappings');
  }, []);

  const resetToMockData = useCallback(() => {
    setOpportunities(generateOpportunities());
    setIsDataCleared(false);
  }, []);

  const refreshFromSheets = useCallback((data: Record<string, any>[]) => {
    // Convert sheet data to opportunities using the googleSheetsService
    const converted = googleSheetsService.convertToOpportunities(data);
    setOpportunities(converted as Opportunity[]);
    setIsDataCleared(false);
    setLastSyncTime(new Date());
  }, []);

  const loadFromGoogleSheets = useCallback(async () => {
    if (!googleSheetsService.isConfigured()) {
      setSyncError('Google Sheets not configured');
      console.error('❌ Google Sheets service not configured');
      return;
    }

    setIsLoading(true);
    setSyncError(null);
    
    try {
      console.log('🔄 Loading data from Google Sheets...');
      const rawData = await googleSheetsService.fetchData();
      console.log(`✅ Fetched ${rawData.length} rows from sheet`);
      
      const converted = googleSheetsService.convertToOpportunities(rawData);
      console.log(`✅ Converted to ${converted.length} opportunities`);
      
      setOpportunities(converted as Opportunity[]);
      setIsDataCleared(false);
      setLastSyncTime(new Date());
      setIsGoogleSheetsConnected(true);
      setSyncError(null);
      
      console.log('✅ Google Sheets sync successful!');
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to load from Google Sheets';
      console.error('❌ Error:', errorMessage);
      setSyncError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <DataContext.Provider 
      value={{ 
        opportunities, 
        clearAllData, 
        resetToMockData, 
        refreshFromSheets, 
        isDataCleared,
        loadFromGoogleSheets,
        isLoading,
        lastSyncTime,
        isGoogleSheetsConnected,
        syncError,
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
