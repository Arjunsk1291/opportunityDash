import { useState, useMemo, useEffect } from 'react';
import { KPICards } from '@/components/Dashboard/KPICards';
import { FunnelChart } from '@/components/Dashboard/FunnelChart';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AtRiskWidget } from '@/components/Dashboard/AtRiskWidget';
import { ClientLeaderboard } from '@/components/Dashboard/ClientLeaderboard';
import { DataHealthWidget } from '@/components/Dashboard/DataHealthWidget';
import { ApprovalStatsWidget } from '@/components/Dashboard/ApprovalStatsWidget';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { ReportButton } from '@/components/Dashboard/ReportButton';
import { OpportunityDetailDialog } from '@/components/Dashboard/OpportunityDetailDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { 
  calculateSummaryStats, 
  calculateFunnelData, 
  getClientData, 
  calculateDataHealth,
  Opportunity 
} from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const Dashboard = () => {
  const { opportunities, isLoading, error, lastSyncTime } = useData();
  const { formatCurrency } = useCurrency();
  const { isAutoRefreshActive, lastAutoRefreshTime, autoRefreshStatus, startAutoRefresh, stopAutoRefresh } = useAutoRefresh();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  useEffect(() => {
    console.log('📊 Dashboard mounted - starting auto-refresh');
    startAutoRefresh();

    return () => {
      console.log('📊 Dashboard unmounted - stopping auto-refresh');
      stopAutoRefresh();
    };
  }, [startAutoRefresh, stopAutoRefresh]);

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const stats = useMemo(() => {
    const baseStats = calculateSummaryStats(filteredData);
    return {
      ...baseStats,
      totalTenders: filteredData.length,
    };
  }, [filteredData]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const handleKPIClick = (kpiType: 'alltenders' | 'active' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => {
    setFilters((prevFilters) => {
      switch (kpiType) {
        case 'alltenders':
          return defaultFilters;
        case 'active':
          return { ...prevFilters, statuses: ['WORKING', 'SUBMITTED', 'AWARDED'] };
        case 'awarded':
          return { ...prevFilters, statuses: ['AWARDED'] };
        case 'lost':
          return { ...prevFilters, statuses: ['LOST'] };
        case 'regretted':
          return { ...prevFilters, statuses: ['REGRETTED'] };
        case 'working':
          return { ...prevFilters, statuses: ['WORKING'] };
        case 'tostart':
          return { ...prevFilters, statuses: ['TO START'] };
        case 'ongoing':
          return { ...prevFilters, statuses: ['ONGOING'] };
        case 'submission':
          return { ...prevFilters, showAtRisk: true };
        default:
          return prevFilters;
      }
    });
  };

  const handleFunnelClick = (stage: string) => {
    setFilters((prevFilters) => ({ ...prevFilters, statuses: [stage] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading opportunities...</p>
        </div>
      </div>
    );
  }

  if (error || opportunities.length === 0) {
    return (
      <div className="p-4 w-full">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>No Data Available</strong><br />
            {error || 'No opportunities found in MongoDB.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-background">
      {/* Main Content - Full Width */}
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Sync Status Bar */}
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-card flex items-center gap-x-3 gap-y-1 flex-wrap">
          <div>Last synced: {lastSyncTime?.toLocaleTimeString()} - {opportunities.length} opportunities</div>
          {lastAutoRefreshTime && (
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-3 w-3 ${autoRefreshStatus === 'syncing' ? 'animate-spin' : ''}`} />
              Auto: {lastAutoRefreshTime.toLocaleTimeString()}
              <span className={`font-semibold ${
                autoRefreshStatus === 'complete' ? 'text-green-600' :
                autoRefreshStatus === 'error' ? 'text-red-600' :
                autoRefreshStatus === 'syncing' ? 'text-blue-600' :
                'text-muted-foreground'
              }`}>({autoRefreshStatus})</span>
            </div>
          )}
          <div className="ml-auto text-xs">
            {isAutoRefreshActive ? '✅ Active' : '⏸️ Inactive'}
          </div>
        </div>
        
        {/* Filter & Export Bar */}
        <div className="sticky top-0 z-40 px-3 py-2 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between gap-2 flex-wrap xl:flex-nowrap">
            <div className="flex-1 min-w-[280px]">
              <AdvancedFilters
                data={opportunities}
                filters={filters}
                onFiltersChange={setFilters}
                onClearFilters={() => setFilters(defaultFilters)}
              />
            </div>
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <ExportButton data={filteredData} filename="tenders" />
              <ReportButton data={filteredData} filters={filters} />
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto w-full">
          <div className="px-2 sm:px-3 py-2 space-y-2 w-full">
            {/* KPI Cards */}
            <KPICards stats={stats} onKPIClick={handleKPIClick} />

            {/* Opportunities Table */}
            <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} maxHeight="max-h-[54vh] sm:max-h-[58vh] lg:max-h-[62vh]" />

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
              <FunnelChart data={funnelData} onStageClick={handleFunnelClick} />
              <AtRiskWidget data={filteredData} onSelectOpportunity={setSelectedOpp} />
              <ClientLeaderboard data={clientData} onClientClick={(client) => {
                setFilters((prevFilters) => ({ ...prevFilters, clients: [client] }));
              }} />
            </div>

            {/* Data Health & Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
              <ApprovalStatsWidget data={filteredData} />
              <DataHealthWidget {...dataHealth} />
            </div>
          </div>
        </div>
      </div>

      {/* Dialog */}
      <OpportunityDetailDialog
        open={!!selectedOpp}
        opportunity={selectedOpp}
        onOpenChange={(open) => {
          if (!open) setSelectedOpp(null);
        }}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default Dashboard;
