import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { toast } from 'sonner';

interface RefreshButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function RefreshButton({ 
  variant = 'ghost', 
  size = 'default',
  showLabel = true 
}: RefreshButtonProps) {
  const { loadFromGoogleSheets, isLoading, isGoogleSheetsConnected, lastSyncTime } = useData();

  const handleRefresh = async () => {
    if (!isGoogleSheetsConnected) {
      toast.error('Google Sheets not connected. Please configure in Admin settings.');
      return;
    }

    try {
      await loadFromGoogleSheets();
    } catch (error) {
      // Error already handled in DataContext
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isLoading || !isGoogleSheetsConnected}
      title={lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleString()}` : 'Not synced yet'}
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''} ${showLabel ? 'mr-2' : ''}`} />
      {showLabel && (isLoading ? 'Syncing...' : 'Refresh Data')}
    </Button>
  );
}
