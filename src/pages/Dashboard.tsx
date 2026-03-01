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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
  const stats = useMemo(() => calculateSummaryStats(filteredData), [filteredData]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const handleKPIClick = (kpiType: 'active' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => {
    switch (kpiType) {
      case 'active':
        setFilters({
          ...defaultFilters,
          statuses: ['WORKING', 'SUBMITTED', 'AWARDED'],
        });
        break;
      case 'awarded':
        setFilters({
          ...defaultFilters,
          statuses: ['AWARDED'],
        });
        break;
      case 'lost':
        setFilters({
          ...defaultFilters,
          statuses: ['LOST'],
        });
        break;
      case 'regretted':
        setFilters({
          ...defaultFilters,
          statuses: ['REGRETTED'],
        });
        break;
      case 'working':
        setFilters({
          ...defaultFilters,
          statuses: ['WORKING'],
        });
        break;
      case 'tostart':
        setFilters({
          ...defaultFilters,
          statuses: ['TO START'],
        });
        break;
      case 'ongoing':
        setFilters({
          ...defaultFilters,
          statuses: ['ONGOING'],
        });
        break;
      case 'submission':
        setFilters({
          ...defaultFilters,
          showAtRisk: true,
        });
        break;
    }
  };

  const handleFunnelClick = (stage: string) => {
    console.log('🔗 Funnel clicked:', stage);
    setFilters({
      ...defaultFilters,
      statuses: [stage],
    });
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
    <div className="space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div>
            Last synced: {lastSyncTime?.toLocaleTimeString()} - {opportunities.length} opportunities loaded
          </div>
          {lastAutoRefreshTime && (
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-3 w-3 ${autoRefreshStatus === 'syncing' ? 'animate-spin' : ''}`} />
              Auto-synced: {lastAutoRefreshTime.toLocaleTimeString()}
              <span className={`text-xs font-semibold ${
                autoRefreshStatus === 'complete' ? 'text-green-600' :
                autoRefreshStatus === 'error' ? 'text-red-600' :
                autoRefreshStatus === 'syncing' ? 'text-blue-600' :
                'text-muted-foreground'
              }`}>
                ({autoRefreshStatus})
              </span>
            </div>
          )}
        </div>
        <div className="text-xs">
          {isAutoRefreshActive ? '✅ Auto-refresh active' : '⏸️ Auto-refresh inactive'}
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <AdvancedFilters
            data={opportunities}
            filters={filters}
            onFiltersChange={setFilters}
            onClearFilters={() => setFilters(defaultFilters)}
          />
        </div>
        <ExportButton data={filteredData} filename="tenders" />
      </div>

      <KPICards stats={stats} onKPIClick={handleKPIClick} />

      <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FunnelChart data={funnelData} onStageClick={handleFunnelClick} />
        <AtRiskWidget data={filteredData} onSelectOpportunity={setSelectedOpp} />
        <ClientLeaderboard data={clientData} onClientClick={(client) => {
          setFilters({
            ...defaultFilters,
            clients: [client],
          });
        }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ApprovalStatsWidget data={filteredData} />
        <DataHealthWidget {...dataHealth} />
      </div>

      <Dialog open={!!selectedOpp} onOpenChange={() => setSelectedOpp(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-background/95 backdrop-blur">
          {selectedOpp && (
            <>
              <DialogHeader className="space-y-0">
                <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 px-4 sm:px-6 py-4 sm:py-5 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <DialogTitle className="text-left text-lg sm:text-xl md:text-2xl font-semibold truncate">
                        {selectedOpp.opportunityRefNo || 'Opportunity Details'}
                      </DialogTitle>
                      <p className="text-xs sm:text-sm text-white/90 truncate mt-1" title={selectedOpp.tenderName || ''}>{selectedOpp.tenderName || '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-white/20 text-white border-white/30">Table Fields</Badge>
                      <Badge className="bg-black/20 text-white border-white/30">Simplified View</Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-3 sm:p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 bg-slate-50 dark:bg-slate-950/40">
                {[
                  { label: 'Reference No', value: selectedOpp.opportunityRefNo || '—' },
                  { label: 'Tender Name', value: selectedOpp.tenderName || '—' },
                  { label: 'Tender Type', value: selectedOpp.opportunityClassification || '—' },
                  { label: 'Client', value: selectedOpp.clientName || '—' },
                  { label: 'Group', value: selectedOpp.groupClassification || '—' },
                  { label: 'RFP Received', value: selectedOpp.dateTenderReceived || (typeof selectedOpp.rawGraphData?.rfpReceivedDisplay === 'string' ? selectedOpp.rawGraphData.rfpReceivedDisplay : '') || '—' },
                  { label: 'Submission Date', value: selectedOpp.tenderSubmittedDate || selectedOpp.tenderPlannedSubmissionDate || '—' },
                  { label: 'Lead', value: selectedOpp.internalLead || 'Unassigned' },
                  { label: 'Opportunity Value', value: selectedOpp.opportunityValue > 0 ? formatCurrency(selectedOpp.opportunityValue) : '—' },
                  { label: 'Avenir Status', value: selectedOpp.avenirStatus || '—' },
                  { label: 'Remarks/Reason', value: selectedOpp.remarksReason || '—' },
                  { label: 'Tender Result', value: selectedOpp.tenderResult || '—' },
                  { label: 'Comments', value: selectedOpp.comments || '—' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 p-2 sm:p-3 md:p-4 space-y-1 shadow-sm">
                    <p className="text-[11px] sm:text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="text-xs sm:text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100 break-words">{item.value}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
