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

interface DetailRowProps {
  label: string;
  value: string | React.ReactNode;
  imputed?: boolean;
  fullWidth?: boolean;
}

function DetailRow({ label, value, imputed, fullWidth }: DetailRowProps) {
  return (
    <div className={fullWidth ? 'col-span-full' : ''}>
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        {label}
        {imputed && <Badge variant="outline" className="text-xs">Imputed</Badge>}
      </p>
      <p className="font-medium text-sm mt-1 break-words">{value}</p>
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {children}
    </div>
  );
}


function displayUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedOpp && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{selectedOpp.opportunityRefNo}</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-2">{selectedOpp.tenderName}</p>
                  </div>
                </div>
              </DialogHeader>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Mapped Opportunity Overview</h3>
                <DetailGrid>
                  <DetailRow label="Ref No" value={selectedOpp.opportunityRefNo || '—'} />
                  <DetailRow label="Tender Name" value={selectedOpp.tenderName || '—'} />
                  <DetailRow label="Type" value={selectedOpp.opportunityClassification || '—'} />
                  <DetailRow label="Client" value={selectedOpp.clientName || '—'} />
                  <DetailRow label="Group" value={selectedOpp.groupClassification || '—'} />
                  <DetailRow label="Lead" value={selectedOpp.internalLead || '—'} />
                  <DetailRow label="AVENIR Status" value={selectedOpp.avenirStatus || '—'} />
                  <DetailRow label="Tender Result" value={selectedOpp.tenderResult || '—'} />
                  <DetailRow label="Qualification" value={selectedOpp.qualificationStatus || '—'} />
                  <DetailRow label="Value" value={formatCurrency(selectedOpp.opportunityValue || 0)} />
                  <DetailRow label="RFP Received" value={selectedOpp.dateTenderReceived || selectedOpp.rawGraphData?.rfpReceivedDisplay || '—'} />
                  <DetailRow label="Planned Submission" value={selectedOpp.tenderPlannedSubmissionDate || '—'} />
                  <DetailRow label="Submitted" value={selectedOpp.tenderSubmittedDate || '—'} />
                  <DetailRow label="Remarks/Reason" value={selectedOpp.remarksReason || '—'} fullWidth />
                  <DetailRow label="Comments" value={selectedOpp.comments || '—'} fullWidth />
                </DetailGrid>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">New Sheet Mapped Fields (Raw Snapshot)</h3>
                <div className="rounded border p-3 max-h-96 overflow-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {Object.entries(selectedOpp.rawGraphData?.rowSnapshot || {}).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground">{key}</p>
                        <p className="font-medium break-words">{displayUnknown(value)}</p>
                      </div>
                    ))}
                    {!selectedOpp.rawGraphData?.rowSnapshot && (
                      <p className="text-sm text-muted-foreground col-span-full">No row snapshot available for this record.</p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">All API Fields</h3>
                <div className="rounded border p-3 max-h-96 overflow-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {Object.entries(selectedOpp).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground">{key}</p>
                        <p className="font-medium break-words">{displayUnknown(value)}</p>
                      </div>
                    ))}
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
