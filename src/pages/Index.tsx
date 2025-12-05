import { useState, useMemo } from 'react';
import { KPICards } from '@/components/Dashboard/KPICards';
import { FunnelChart } from '@/components/Dashboard/FunnelChart';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AtRiskWidget } from '@/components/Dashboard/AtRiskWidget';
import { LeaderboardWidget } from '@/components/Dashboard/LeaderboardWidget';
import { DataHealthWidget } from '@/components/Dashboard/DataHealthWidget';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart3, Info } from 'lucide-react';
import { 
  opportunities, 
  calculateSummaryStats, 
  calculateFunnelData, 
  getLeaderboardData, 
  calculateDataHealth,
  Opportunity 
} from '@/data/opportunityData';

const Index = () => {
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const stats = useMemo(() => calculateSummaryStats(opportunities), []);
  const funnelData = useMemo(() => calculateFunnelData(opportunities), []);
  const leaderboardData = useMemo(() => getLeaderboardData(opportunities), []);
  const dataHealth = useMemo(() => calculateDataHealth(opportunities), []);

  const formatCurrency = (value: number) => `$${value.toLocaleString()}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Opportunity Management Dashboard</h1>
                <p className="text-sm text-muted-foreground">Pipeline & Tender Tracking System</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{opportunities.length} opportunities</span>
              <span>•</span>
              <span>Last updated: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <KPICards stats={stats} />

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funnel */}
          <FunnelChart data={funnelData} />
          
          {/* At Risk Widget */}
          <AtRiskWidget data={opportunities} />
          
          {/* Leaderboard */}
          <LeaderboardWidget data={leaderboardData} />
        </div>

        {/* Opportunities Table */}
        <OpportunitiesTable data={opportunities} onSelectOpportunity={setSelectedOpp} />

        {/* Data Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DataHealthWidget {...dataHealth} />
        </div>
      </main>

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

export default Index;
