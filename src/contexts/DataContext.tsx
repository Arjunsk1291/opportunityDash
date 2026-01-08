import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Opportunity, generateOpportunities } from '@/data/opportunityData';
import { googleSheetsService } from '@/services/googleSheetsService';
import { toast } from 'sonner';

interface DataContextType {
  opportunities: Opportunity[];
  clearAllData: () => void;
  resetToMockData: () => void;
  isDataCleared: boolean;
  loadFromGoogleSheets: () => Promise<void>;
  isLoading: boolean;
  lastSyncTime: Date | null;
  isGoogleSheetsConnected: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => generateOpportunities());
  const [isDataCleared, setIsDataCleared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isGoogleSheetsConnected, setIsGoogleSheetsConnected] = useState(false);

  // Check if Google Sheets is configured on mount
  useEffect(() => {
    const config = localStorage.getItem('googleSheetsConfig');
    if (config) {
      try {
        const { apiKey, spreadsheetId, sheetName } = JSON.parse(config);
        googleSheetsService.initialize(apiKey, spreadsheetId, sheetName);
        setIsGoogleSheetsConnected(true);
        
        // Auto-load on startup if configured
        loadFromGoogleSheets();
      } catch (error) {
        console.error('Failed to initialize Google Sheets:', error);
      }
    }
  }, []);

  const loadFromGoogleSheets = useCallback(async () => {
    if (!googleSheetsService.isConfigured()) {
      toast.error('Google Sheets not configured');
      return;
    }

    setIsLoading(true);
    try {
      const sheetData = await googleSheetsService.fetchData();
      const convertedOpportunities = googleSheetsService.convertToOpportunities(sheetData);
      
      setOpportunities(convertedOpportunities);
      setIsDataCleared(false);
      setLastSyncTime(new Date());
      
      toast.success(`Loaded ${convertedOpportunities.length} opportunities from Google Sheets`);
    } catch (error: any) {
      console.error('Failed to load from Google Sheets:', error);
      toast.error(`Failed to sync: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearAllData = useCallback(() => {
    setOpportunities([]);
    setIsDataCleared(true);
    localStorage.removeItem('opportunities');
    localStorage.removeItem('syncLogs');
    localStorage.removeItem('sharePointConfig');
    localStorage.removeItem('leadMappings');
    toast.info('All data cleared');
  }, []);

  const resetToMockData = useCallback(() => {
    setOpportunities(generateOpportunities());
    setIsDataCleared(false);
    setLastSyncTime(null);
    toast.info('Reset to mock data');
  }, []);

  return (
    <DataContext.Provider value={{ 
      opportunities, 
      clearAllData, 
      resetToMockData, 
      isDataCleared,
      loadFromGoogleSheets,
      isLoading,
      lastSyncTime,
      isGoogleSheetsConnected: googleSheetsService.isConfigured()
    }}>
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
