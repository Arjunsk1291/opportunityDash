import { useState, useMemo } from 'react';
import { KPICards } from '@/components/Dashboard/KPICards';
import { FunnelChart } from '@/components/Dashboard/FunnelChart';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AtRiskWidget } from '@/components/Dashboard/AtRiskWidget';
import { ClientLeaderboard } from '@/components/Dashboard/ClientLeaderboard';
import { DataHealthWidget } from '@/components/Dashboard/DataHealthWidget';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { RefreshButton } from '@/components/RefreshButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
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
  const { opportunities, isGoogleSheetsConnected } = useData();
  const { formatCurrency } = useCurrency();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Auto-refresh every 2 hours (120 minutes)
  useAutoRefresh(120);

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const stats = useMemo(() => calculateSummaryStats(filteredData), [filteredData]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const handleKPIClick = (kpiType: 'active' | 'pipeline' | 'won' | 'closed' | 'upcoming') => {
    switch (kpiType) {
      case 'active':
        setFilters({
          ...defaultFilters,
          statuses: ['Pre-bid', 'In Progress', 'Submitted'],
        });
        break;
      case 'pipeline':
        setFilters(defaultFilters);
        break;
      case 'won':
        setFilters({
          ...defaultFilters,
          statuses: ['Awarded'],
        });
        break;
      case 'closed':
        setFilters({
          ...defaultFilters,
          statuses: ['Lost/Regretted'],
        });
        break;
      case 'upcoming':
        setFilters({
          ...defaultFilters,
          showAtRisk: true,
        });
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Google Sheets Connection Alert */}
      {!isGoogleSheetsConnected && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Connect to Google Sheets in <a href="/admin" className="underline font-medium">Admin Settings</a> to sync live data automatically.
          </AlertDescription>
        </Alert>
      )}

      {/* Advanced Filters with Export and Refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <AdvancedFilters
            data={opportunities}
            filters={filters}
            onFiltersChange={setFilters}
            onClearFilters={() => setFilters(defaultFilters)}
          />
        </div>
        <div className="flex gap-2">
          <RefreshButton variant="outline" showLabel={false} size="icon" />
          <ExportButton data={filteredData} filename="opportunities" />
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards stats={stats} onKPIClick={handleKPIClick} />

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel */}
        <FunnelChart data={funnelData} />
        
        {/* At Risk Widget */}
        <AtRiskWidget data={filteredData} onSelectOpportunity={setSelectedOpp} />
        
        {/* Client Leaderboard */}
        <ClientLeaderboard data={clientData} onClientClick={(client) => {
          setFilters({
            ...defaultFilters,
            clients: [client],
          });
        }} />
      </div>

      {/* Opportunities Table */}
      <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />

      {/* Data Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DataHealthWidget {...dataHealth} />
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedOpp} onOpenChange={() => setSelectedOpp(null)}>
        <SheetContent className="w-[450px] sm:max-w-[450px] overflow-auto">
          {selectedOpp && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selectedOpp.opportunityRefNo}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedOpp.tenderName}</h3>
                  <p className="text-sm text-muted-foreground">{selectedOpp.clientName}</p>
                </div>
                
                <div className="flex gap-2">
                  <Badge>{selectedOpp.canonicalStage}</Badge>
                  <Badge variant="outline">{selectedOpp.groupClassification}</Badge>
                  {selectedOpp.isAtRisk && <Badge variant="destructive">At Risk</Badge>}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Value</p>
                    <p className="font-semibold flex items-center gap-1">
                      {formatCurrency(selectedOpp.opportunityValue)}
                      {selectedOpp.opportunityValue_imputed && <Info className="h-3 w-3 text-warning" />}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Probability</p>
                    <p className="font-semibold">{selectedOpp.probability}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expected Value</p>
                    <p className="font-semibold text-success">{formatCurrency(selectedOpp.expectedValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Internal Lead</p>
                    <p className="font-semibold">{selectedOpp.internalLead || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Days Aging</p>
                    <p className="font-semibold">{selectedOpp.agedDays} days</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Qualification</p>
                    <p className="font-semibold">{selectedOpp.qualificationStatus}</p>
                  </div>
                </div>

                {(selectedOpp.opportunityValue_imputed || selectedOpp.probability_imputed) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Info className="h-4 w-4 text-warning" />
                        Imputation Notes
                      </p>
                      {selectedOpp.opportunityValue_imputed && (
                        <p className="text-xs text-muted-foreground bg-warning/10 p-2 rounded">
                          <strong>Value:</strong> {selectedOpp.opportunityValue_imputation_reason}
                        </p>
                      )}
                      {selectedOpp.probability_imputed && (
                        <p className="text-xs text-muted-foreground bg-warning/10 p-2 rounded">
                          <strong>Probability:</strong> {selectedOpp.probability_imputation_reason}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Dashboard;
