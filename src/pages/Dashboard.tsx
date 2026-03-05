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
import { Separator } from '@/components/ui/separator';
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

function displayUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function DetailItem({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900 break-words">{value || '—'}</p>
    </div>
  );
}

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
    <div className="space-y-6">
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
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-slate-50/95 backdrop-blur-md">
          {selectedOpp && (
            <div className="flex flex-col h-full">
              <DialogHeader className="sr-only">
                <DialogTitle>{selectedOpp.tenderName}</DialogTitle>
              </DialogHeader>

              <div className={`p-6 text-white ${
                selectedOpp.canonicalStage === 'AWARDED' ? 'bg-emerald-600' : selectedOpp.isAtRisk ? 'bg-red-700' : 'bg-slate-800'
              }`}>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <Badge className="mb-2 bg-white/20 hover:bg-white/30 text-white border-none">
                      {selectedOpp.opportunityRefNo || 'N/A'}
                    </Badge>
                    <DialogTitle className="text-3xl font-bold tracking-tight text-white">
                      {selectedOpp.tenderName || 'Untitled Tender'}
                    </DialogTitle>
                    <p className="text-sm text-white/80 mt-2">{selectedOpp.clientName || 'No client mapped'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 text-xs uppercase font-bold tracking-widest">Win Probability</p>
                    <p className="text-4xl font-black">{selectedOpp.probability || 0}%</p>
                  </div>
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto">
                <div className="md:col-span-2 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-slate-500 text-xs font-semibold uppercase">Total Value</p>
                      <p className="text-2xl font-bold text-slate-900">{formatCurrency(selectedOpp.opportunityValue || 0)}</p>
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-slate-500 text-xs font-semibold uppercase">Weighted Value</p>
                      <p className="text-2xl font-bold text-emerald-600">{formatCurrency(selectedOpp.expectedValue || 0)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="relative flex items-center justify-center">
                      <svg className="w-20 h-20 transform -rotate-90">
                        <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-200" />
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={226}
                          strokeDashoffset={226 - (226 * Math.max(0, Math.min(100, selectedOpp.probability || 0))) / 100}
                          className={`${(selectedOpp.probability || 0) > 70 ? 'text-emerald-500' : 'text-amber-500'} transition-all duration-1000`}
                        />
                      </svg>
                      <span className="absolute text-lg font-bold">{selectedOpp.probability || 0}%</span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Win Confidence</h4>
                      <p className="text-xs text-slate-500 max-w-[220px]">
                        Stage: <span className="font-medium text-slate-700">{selectedOpp.canonicalStage || 'N/A'}</span> · Result: <span className="font-medium text-slate-700">{selectedOpp.tenderResult || 'N/A'}</span>
                      </p>
                      <div className="mt-2 flex gap-1">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <div
                            key={step}
                            className={`h-1.5 w-6 rounded-full ${step <= ((selectedOpp.probability || 0) / 20) ? 'bg-emerald-400' : 'bg-slate-200'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-400 uppercase">Analysis & Remarks</h4>
                    <div className="p-4 bg-slate-100 rounded-lg italic text-slate-700 border-l-4 border-slate-300">
                      "{selectedOpp.remarksReason || 'No remarks/reason provided from sheet.'}"
                    </div>
                    <div className="p-4 bg-white rounded-lg text-slate-700 border border-slate-200">
                      <p className="text-xs uppercase text-slate-500 font-semibold mb-2">Comments</p>
                      <p className="text-sm">{selectedOpp.comments || 'No internal comments provided.'}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-400 uppercase">Mapped Sheet Snapshot (All Columns)</h4>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 max-h-80 overflow-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {Object.entries(selectedOpp.rawGraphData?.rowSnapshot || {}).map(([key, value]) => (
                          <div key={key}>
                            <p className="text-xs text-slate-500">{key}</p>
                            <p className="font-medium break-words text-slate-900">{displayUnknown(value)}</p>
                          </div>
                        ))}
                        {!selectedOpp.rawGraphData?.rowSnapshot && (
                          <p className="text-sm text-slate-500 col-span-full">No mapped row snapshot available for this record.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Tender Metadata</h4>
                    <div className="space-y-4">
                      <DetailItem label="Client" value={selectedOpp.clientName || 'N/A'} />
                      <DetailItem label="Lead" value={selectedOpp.internalLead || 'N/A'} />
                      <DetailItem label="Group" value={selectedOpp.groupClassification || 'N/A'} />
                      <DetailItem label="Country/Region" value={selectedOpp.country || 'N/A'} />
                      <DetailItem label="Avenir Status" value={selectedOpp.avenirStatus || 'N/A'} />
                      <DetailItem label="RFP Received" value={selectedOpp.dateTenderReceived || selectedOpp.rawGraphData?.rfpReceivedDisplay || 'N/A'} />
                      <DetailItem label="Submission Deadline" value={selectedOpp.tenderPlannedSubmissionDate || 'N/A'} />
                    </div>
                  </div>

                  <Separator />

                  <div className={`p-3 rounded-lg text-center font-bold text-xs ${
                    selectedOpp.isAtRisk ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {selectedOpp.isAtRisk ? '⚠️ SUBMISSION URGENT' : 'Schedule Stable'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
