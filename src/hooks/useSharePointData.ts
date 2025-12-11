// src/hooks/useSharePointData.ts

import { useState, useEffect, useCallback } from 'react';
import sharepointService, { ExcelRow, SyncStatus } from '@/services/sharepointService';
import { toast } from 'sonner';

interface UseSharePointDataOptions {
  autoSync?: boolean;
  syncInterval?: number; // in milliseconds
  onSyncComplete?: (data: ExcelRow[]) => void;
  onSyncError?: (error: Error) => void;
}

export const useSharePointData = (options: UseSharePointDataOptions = {}) => {
  const {
    autoSync = true,
    syncInterval = 5 * 60 * 1000, // 5 minutes default
    onSyncComplete,
    onSyncError,
  } = options;

  const [data, setData] = useState<ExcelRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(sharepointService.getSyncStatus());

  /**
   * Manually trigger a sync
   */
  const syncData = useCallback(async () => {
    try {
      toast.info('Syncing data from SharePoint...');
      
      const excelData = await sharepointService.fetchExcelData();
      setData(excelData);
      setSyncStatus(sharepointService.getSyncStatus());
      
      toast.success(`Successfully synced ${excelData.length} records`);
      onSyncComplete?.(excelData);
      
      return excelData;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      toast.error(`Sync failed: ${err.message}`);
      setSyncStatus(sharepointService.getSyncStatus());
      onSyncError?.(err);
      throw err;
    }
  }, [onSyncComplete, onSyncError]);

  /**
   * Set SharePoint URL
   */
  const setSharePointUrl = useCallback((url: string) => {
    sharepointService.setSharePointUrl(url);
    // Trigger immediate sync after URL change
    syncData();
  }, [syncData]);

  /**
   * Auto-sync on mount and interval
   */
  useEffect(() => {
    if (!autoSync) return;

    // Initial sync
    syncData();

    // Set up interval
    const intervalId = setInterval(() => {
      syncData();
    }, syncInterval);

    return () => clearInterval(intervalId);
  }, [autoSync, syncInterval, syncData]);

  return {
    data,
    syncStatus,
    syncData,
    setSharePointUrl,
    isLoading: syncStatus.isLoading,
    error: syncStatus.error,
    lastSync: syncStatus.lastSync,
    recordCount: syncStatus.recordCount,
  };
};

export default useSharePointData;