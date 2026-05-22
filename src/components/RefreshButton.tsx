import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useData } from '@/contexts/DataContext';

interface RefreshButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function RefreshButton({
  variant = 'ghost',
  size = 'default',
  showLabel = true,
}: RefreshButtonProps) {
  const { refreshData, isLoading, lastSyncTime } = useData();

  const handleRefresh = async () => {
    await refreshData();
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      loading={isLoading}
      title={lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleString()}` : 'Not synced yet'}
    >
      {!isLoading && <RefreshCw className={`h-4 w-4 ${showLabel ? 'mr-2' : ''}`} />}
      {showLabel && 'Refresh Data'}
    </Button>
  );
}
