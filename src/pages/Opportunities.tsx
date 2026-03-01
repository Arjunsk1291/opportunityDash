import { useState, useMemo } from 'react';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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

  const getRfpReceivedDisplay = (tender: Opportunity) => {
    return tender.dateTenderReceived
      || (typeof tender.rawGraphData?.rfpReceivedDisplay === 'string' ? tender.rawGraphData.rfpReceivedDisplay : '')
      || '—';
  };

  const getSubmissionDisplay = (tender: Opportunity) => {
    return tender.tenderSubmittedDate || tender.tenderPlannedSubmissionDate || '—';
  };

  const popupFields = selectedOpp ? [
    { label: 'Reference No', value: selectedOpp.opportunityRefNo || '—' },
    { label: 'Tender Name', value: selectedOpp.tenderName || '—' },
    { label: 'Tender Type', value: selectedOpp.opportunityClassification || '—' },
    { label: 'Client', value: selectedOpp.clientName || '—' },
    { label: 'Group', value: selectedOpp.groupClassification || '—' },
    { label: 'RFP Received', value: getRfpReceivedDisplay(selectedOpp) },
    { label: 'Submission Date', value: getSubmissionDisplay(selectedOpp) },
    { label: 'Lead', value: selectedOpp.internalLead || 'Unassigned' },
    { label: 'Opportunity Value', value: selectedOpp.opportunityValue > 0 ? formatCurrency(selectedOpp.opportunityValue) : '—' },
    { label: 'Avenir Status', value: selectedOpp.avenirStatus || '—' },
    { label: 'Remarks/Reason', value: selectedOpp.remarksReason || '—' },
    { label: 'Tender Result', value: selectedOpp.tenderResult || '—' },
    { label: 'Comments', value: selectedOpp.comments || '—' },
  ] : [];

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            {statusFilter ? `${statusFilter} Tenders` : 'All Tenders'}
          </h1>
          <p className="text-muted-foreground">
            {filteredData.length} tenders found
          </p>
        </div>
        <ExportButton data={filteredData} filename={statusFilter ? `${statusFilter.toLowerCase().replace(/\//g, '-')}-tenders` : 'all-tenders'} />
      </div>

      <AdvancedFilters
        data={opportunities}
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />
      </div>

      <Dialog open={!!selectedOpp} onOpenChange={() => setSelectedOpp(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedOpp && (
            <>
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-left text-lg sm:text-xl md:text-2xl">
                  {selectedOpp.opportunityRefNo || 'Opportunity Details'}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Table Details</Badge>
                  <Badge variant="outline">Only table fields</Badge>
                </div>
              </DialogHeader>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                {popupFields.map((item) => (
                  <div key={item.label} className="rounded border p-2 sm:p-3 md:p-4 space-y-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">{item.label}</p>
                    <p className="text-xs sm:text-sm md:text-base font-medium break-words">{item.value}</p>
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

export default Opportunities;
