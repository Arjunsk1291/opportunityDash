import { useState, useMemo } from 'react';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
    <div className="flex flex-col h-full gap-6">
      {/* Header Section - Fixed */}
      <div className="flex items-center justify-between flex-shrink-0">
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

      {/* Filters Section - Fixed */}
      <div className="flex-shrink-0">
        <AdvancedFilters
          data={opportunities}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
        />
      </div>

      {/* Table Section - Expandable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />
      </div>

      {/* Modal Dialog - Same as Dashboard */}
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

              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Client Name</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.clientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client Type</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.clientType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tender Name</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.tenderName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Internal Lead</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.internalLead || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.country}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity Status</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.opportunityStatus}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Stage & Classification */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Stage & Classification</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Canonical Stage</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.canonicalStage}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Qualification Status</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.qualificationStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity Classification</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.opportunityClassification || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Group Classification</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.groupClassification}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Financial Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Financial Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity Value</p>
                    <p className="font-medium text-sm mt-1">AED {selectedOpp.opportunityValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    {selectedOpp.opportunityValue_imputed && <Badge variant="outline" className="text-xs mt-1">Imputed</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Probability %</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.probability}%</p>
                    {selectedOpp.probability_imputed && <Badge variant="outline" className="text-xs mt-1">Imputed</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Value</p>
                    <p className="font-medium text-sm mt-1">{formatCurrency(selectedOpp.expectedValue)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Important Dates</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tender Received Date</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.dateTenderReceived || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Planned Submission Date</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.tenderPlannedSubmissionDate || '—'}</p>
                    {selectedOpp.tenderPlannedSubmissionDate_imputed && <Badge variant="outline" className="text-xs mt-1">Imputed</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted Date</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.tenderSubmittedDate || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Contact Date</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.lastContactDate || '—'}</p>
                    {selectedOpp.lastContactDate_imputed && <Badge variant="outline" className="text-xs mt-1">Imputed</Badge>}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Risk & Timeline */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Risk & Timeline Metrics</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Days Since Received</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.daysSinceTenderReceived} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Days to Submission</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.daysToPlannedSubmission} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Will Miss Deadline</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.willMissDeadline ? '🔴 Yes' : '✅ No'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Is At Risk</p>
                    <p className="font-medium text-sm mt-1">{selectedOpp.isAtRisk ? '⚠️ Yes' : '✅ No'}</p>
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

export default Opportunities;
