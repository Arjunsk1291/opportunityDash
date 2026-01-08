import { useState, useMemo } from 'react';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Info } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';

interface OpportunitiesProps {
  statusFilter?: string;
}

const Opportunities = ({ statusFilter }: OpportunitiesProps) => {
  const { opportunities } = useData();
  const { formatCurrency } = useCurrency();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    statuses: statusFilter ? [statusFilter] : [],
  }));

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {statusFilter ? `${statusFilter} Opportunities` : 'All Opportunities'}
          </h1>
          <p className="text-muted-foreground">
            {filteredData.length} opportunities found
          </p>
        </div>
        <ExportButton data={filteredData} filename={statusFilter ? `${statusFilter.toLowerCase().replace(/\//g, '-')}-opportunities` : 'all-opportunities'} />
      </div>

      <AdvancedFilters
        data={opportunities}
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
      />

      <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />

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
                
                <div className="flex gap-2 flex-wrap">
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

export default Opportunities;
