import { useEffect, useRef, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const DEFAULT_AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;

export function useAutoRefresh() {
  const { refreshData } = useData();
  const { token } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(false);
  const [lastAutoRefreshTime, setLastAutoRefreshTime] = useState<Date | null>(null);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<'idle' | 'syncing' | 'complete' | 'error'>('idle');

  const resolveIntervalMs = useCallback(async () => {
    if (!token) return DEFAULT_AUTO_REFRESH_INTERVAL;
    try {
      const response = await fetch(API_URL + '/graph/config', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
      });
      if (!response.ok) return DEFAULT_AUTO_REFRESH_INTERVAL;
      const config = await response.json();
      const minutes = Math.max(1, Number(config.syncIntervalMinutes) || 10);
      return minutes * 60 * 1000;
    } catch {
      return DEFAULT_AUTO_REFRESH_INTERVAL;
    }
  }, [token]);

  const triggerAutoSync = useCallback(async () => {
    try {
      console.log('🔄 AUTO-SYNC: Triggered at', new Date().toLocaleTimeString());
      setAutoRefreshStatus('syncing');

      const response = await fetch(API_URL + '/opportunities/sync-graph/auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
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
  }, [refreshData, token]);

  const startAutoRefresh = useCallback(async () => {
    if (intervalRef.current) {
      console.log('⏭️ AUTO-SYNC: Already active');
      return;
    }

    const intervalMs = await resolveIntervalMs();
    const intervalMinutes = Math.round(intervalMs / 60000);
    console.log(`▶️ AUTO-SYNC: Starting ${intervalMinutes}-minute interval`);
    setIsAutoRefreshActive(true);

    triggerAutoSync();

    intervalRef.current = setInterval(() => {
      triggerAutoSync();
    }, intervalMs);
  }, [resolveIntervalMs, triggerAutoSync]);

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
