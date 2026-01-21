import { useEffect, useRef, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

export function useAutoRefresh() {
  const { refreshData } = useData();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(false);
  const [lastAutoRefreshTime, setLastAutoRefreshTime] = useState<Date | null>(null);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<'idle' | 'syncing' | 'complete' | 'error'>('idle');

  // ✅ Auto-sync function
  const triggerAutoSync = useCallback(async () => {
    try {
      console.log('🔄 AUTO-SYNC: Triggered at', new Date().toLocaleTimeString());
      setAutoRefreshStatus('syncing');

      // Call backend auto-sync endpoint
      const response = await fetch(`${API_URL}/api/google-sheets/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Auto-sync failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ AUTO-SYNC: Success - ${data.syncedCount} opportunities`);

      // Refresh frontend data from MongoDB
      await refreshData();
      setLastAutoRefreshTime(new Date());
      setAutoRefreshStatus('complete');

      // Reset status after 5 seconds
      setTimeout(() => setAutoRefreshStatus('idle'), 5000);
    } catch (error) {
      console.error('❌ AUTO-SYNC: Error -', error);
      setAutoRefreshStatus('error');
      setTimeout(() => setAutoRefreshStatus('idle'), 5000);
    }
  }, [refreshData]);

  // ✅ Start auto-refresh interval
  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      console.log('⏭️ AUTO-SYNC: Already active');
      return;
    }

    console.log('▶️ AUTO-SYNC: Starting 10-minute interval');
    setIsAutoRefreshActive(true);

    // Trigger first sync immediately
    triggerAutoSync();

    // Then set interval for subsequent syncs
    intervalRef.current = setInterval(() => {
      triggerAutoSync();
    }, AUTO_REFRESH_INTERVAL);
  }, [triggerAutoSync]);

  // ✅ Stop auto-refresh interval
  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('⏹️ AUTO-SYNC: Stopped');
      setIsAutoRefreshActive(false);
    }
  }, []);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isAutoRefreshActive,
    lastAutoRefreshTime,
    autoRefreshStatus,
    startAutoRefresh,
    stopAutoRefresh,
    triggerAutoSync,
  };
}
