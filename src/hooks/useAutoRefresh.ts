import { useEffect, useRef, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;

export function useAutoRefresh() {
  const { refreshData } = useData();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(false);
  const [lastAutoRefreshTime, setLastAutoRefreshTime] = useState<Date | null>(null);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<'idle' | 'syncing' | 'complete' | 'error'>('idle');

  const triggerAutoSync = useCallback(async () => {
    try {
      console.log('🔄 AUTO-SYNC: Triggered at', new Date().toLocaleTimeString());
      setAutoRefreshStatus('syncing');

      const response = await fetch(API_URL + '/google-sheets/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Auto-sync failed: ' + response.statusText);
      }

      const data = await response.json();
      console.log('✅ AUTO-SYNC: Success - ' + data.syncedCount + ' opportunities');

      await refreshData();
      setLastAutoRefreshTime(new Date());
      setAutoRefreshStatus('complete');

      setTimeout(() => setAutoRefreshStatus('idle'), 5000);
    } catch (error) {
      console.error('❌ AUTO-SYNC: Error -', error);
      setAutoRefreshStatus('error');
      setTimeout(() => setAutoRefreshStatus('idle'), 5000);
    }
  }, [refreshData]);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      console.log('⏭️ AUTO-SYNC: Already active');
      return;
    }

    console.log('▶️ AUTO-SYNC: Starting 10-minute interval');
    setIsAutoRefreshActive(true);

    triggerAutoSync();

    intervalRef.current = setInterval(() => {
      triggerAutoSync();
    }, AUTO_REFRESH_INTERVAL);
  }, [triggerAutoSync]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('⏹️ AUTO-SYNC: Stopped');
      setIsAutoRefreshActive(false);
    }
  }, []);

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
