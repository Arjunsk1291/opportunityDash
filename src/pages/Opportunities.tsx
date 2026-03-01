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
                {popupFields.map((item) => (
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

export default Opportunities;
