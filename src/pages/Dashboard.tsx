import { useState, useMemo } from 'react';
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

const Dashboard = () => {
  const { opportunities, isLoading, error, lastSyncTime, isLiveRefreshActive } = useData();
  const { formatCurrency } = useCurrency();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const stats = useMemo(() => calculateSummaryStats(filteredData), [filteredData]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const handleKPIClick = (kpiType: 'active' | 'quoted' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => {
    setFilters((prevFilters) => {
      switch (kpiType) {
        case 'active':
          return {
            ...prevFilters,
            statuses: ['WORKING', 'SUBMITTED', 'AWARDED'],
          };
        case 'quoted':
          return {
            ...prevFilters,
            statuses: [],
          };
        case 'awarded':
          return {
            ...prevFilters,
            statuses: ['AWARDED'],
          };
        case 'lost':
          return {
            ...prevFilters,
            statuses: ['LOST'],
          };
        case 'regretted':
          return {
            ...prevFilters,
            statuses: ['REGRETTED'],
          };
        case 'working':
          return {
            ...prevFilters,
            statuses: ['WORKING'],
          };
        case 'tostart':
          return {
            ...prevFilters,
            statuses: ['TO START'],
          };
        case 'ongoing':
          return {
            ...prevFilters,
            statuses: ['ONGOING'],
          };
        case 'submission':
          return {
            ...prevFilters,
            showAtRisk: true,
          };
        default:
          return prevFilters;
      }
    });
  };

  const handleFunnelClick = (stage: string) => {
    console.log('🔗 Funnel clicked:', stage);
    setFilters((prevFilters) => ({
      ...prevFilters,
      statuses: [stage],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading opportunities from MongoDB...</p>
        </div>
      </div>
    );
  }

  if (error || opportunities.length === 0) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>No Data Available</strong><br />
            {error || 'No opportunities found in MongoDB.'}
            <br /><br />
            <strong>Next Steps:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Go to Master Panel (/master)</li>
              <li>Click "Sync from Graph Excel"</li>
              <li>Wait for data to load</li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sync Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
          <div>
            Last refreshed from MongoDB: {lastSyncTime?.toLocaleTimeString()} - {opportunities.length} opportunities loaded
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-3 w-3" />
            Server auto-sync runs independently of the browser session
          </div>
        </div>
        <div className="text-xs">
          {isLiveRefreshActive ? '✅ Live refresh active' : '⏸️ Live refresh inactive'}
        </div>
      </div>
      
      {/* Filter & Export Bar */}
      <div className="sticky top-14 z-40 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 lg:gap-6 min-w-0">
          <div className="flex-1 min-w-0">
            <AdvancedFilters
              data={opportunities}
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={() => setFilters(defaultFilters)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0 w-full lg:w-auto">
            <ExportButton data={filteredData} filename="tenders" />
            <ReportButton data={filteredData} filters={filters} />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards stats={stats} onKPIClick={handleKPIClick} />

      {/* Opportunities Table */}
      <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <FunnelChart data={funnelData} onStageClick={handleFunnelClick} />
        <AtRiskWidget data={filteredData} onSelectOpportunity={setSelectedOpp} />
        <ClientLeaderboard data={clientData} onClientClick={(client) => {
          setFilters((prevFilters) => ({
            ...prevFilters,
            clients: [client],
          }));
        }} />
      </div>

      {/* Data Health & Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <ApprovalStatsWidget data={filteredData} />
        <DataHealthWidget {...dataHealth} />
      </div>

      {/* Opportunity Detail Popup Dialog */}
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
