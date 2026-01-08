import { useEffect, useRef } from 'react';
import { useData } from '@/contexts/DataContext';

export function useAutoRefresh(intervalMinutes: number = 120) {
  const { loadFromGoogleSheets, isGoogleSheetsConnected } = useData();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isGoogleSheetsConnected || intervalMinutes <= 0) {
      return;
    }

    // Set up interval
    intervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refreshing data from Google Sheets...');
      loadFromGoogleSheets();
    }, intervalMinutes * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMinutes, isGoogleSheetsConnected, loadFromGoogleSheets]);
}
