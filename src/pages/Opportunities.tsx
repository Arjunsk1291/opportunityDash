import { useEffect, useMemo, useState } from 'react';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { OpportunityDetailDialog } from '@/components/Dashboard/OpportunityDetailDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Info } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface OpportunitiesProps {
  statusFilter?: string;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

const Opportunities = ({ statusFilter }: OpportunitiesProps) => {
  const { opportunities, refreshData } = useData();
  const { formatCurrency } = useCurrency();
  const { token, canPerformAction } = useAuth();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    statuses: statusFilter ? [statusFilter] : [],
  }));
  const [valueEditorOpen, setValueEditorOpen] = useState(false);
  const [valueEditorSearch, setValueEditorSearch] = useState('');
  const [valueEditorSelected, setValueEditorSelected] = useState<Opportunity | null>(null);
  const [manualValueInput, setManualValueInput] = useState('');
  const [valueSaving, setValueSaving] = useState(false);

  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [valueConflicts, setValueConflicts] = useState<Array<{ refKey: string; opportunityRefNo: string; tenderName: string; sheetValue: number; manualValue: number }>>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);

  const canEditValues = canPerformAction('manual_opportunity_updates_write');

  const searchableValueEditorResults = useMemo(() => {
    const q = valueEditorSearch.trim().toLowerCase();
    if (!q) return opportunities.slice(0, 50);
    return opportunities.filter((o) => {
      const rowSnapshot = o.rawGraphData?.rowSnapshot && typeof o.rawGraphData.rowSnapshot === 'object'
        ? Object.values(o.rawGraphData.rowSnapshot).map((value) => String(value ?? '')).join(' ').toLowerCase()
        : '';
      const searchableBlob = [
        o.opportunityRefNo,
        o.tenderName,
        o.clientName,
        o.groupClassification,
        o.opportunityClassification,
        o.internalLead,
        o.avenirStatus,
        o.tenderResult,
        o.remarksReason,
        o.comments,
        rowSnapshot,
      ].map((value) => String(value ?? '').toLowerCase()).join(' ');
      return searchableBlob.includes(q);
    }).slice(0, 50);
  }, [opportunities, valueEditorSearch]);

  const openValueEditor = () => {
    setValueEditorOpen(true);
    setValueEditorSelected(null);
    setValueEditorSearch('');
    setManualValueInput('');
  };

  const loadValueConflicts = async () => {
    if (!token || !canEditValues) return;
    setConflictsLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/value-conflicts', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load value conflicts');
      const conflicts = Array.isArray(data?.conflicts) ? data.conflicts : [];
      setValueConflicts(conflicts);
      setConflictsOpen(conflicts.length > 0);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load value conflicts');
    } finally {
      setConflictsLoading(false);
    }
  };

  useEffect(() => {
    loadValueConflicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canEditValues]);

  const saveManualValue = async (value: number | null) => {
    if (!token || !canEditValues) {
      toast.error('Not authorized to update values.');
      return;
    }
    if (!valueEditorSelected?.opportunityRefNo) {
      toast.error('Select an opportunity first.');
      return;
    }
    setValueSaving(true);
    try {
      const response = await fetch(API_URL + '/opportunities/manual-value', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opportunityRefNo: valueEditorSelected.opportunityRefNo,
          opportunityValue: value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to save manual value');
      toast.success('Manual value saved.');
      await refreshData({ background: true });
      await loadValueConflicts();
      setValueEditorOpen(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save manual value');
    } finally {
      setValueSaving(false);
    }
  };

  const resolveConflicts = async (action: 'use_sheet' | 'keep_manual') => {
    if (!token || !canEditValues) return;
    const refKeys = valueConflicts.map((row) => row.refKey);
    if (!refKeys.length) {
      setConflictsOpen(false);
      return;
    }
    try {
      const response = await fetch(API_URL + '/opportunities/value-conflicts/resolve', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, refKeys }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to resolve conflicts');
      toast.success(action === 'use_sheet' ? 'Using sheet values.' : 'Keeping manual values.');
      await refreshData({ background: true });
      await loadValueConflicts();
      setConflictsOpen(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to resolve conflicts');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {statusFilter ? `${statusFilter} Tenders` : 'All Tenders'}
          </h1>
          <p className="text-muted-foreground">
            {filteredData.length} tenders found
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditValues ? (
            <>
              <Button type="button" variant="outline" onClick={openValueEditor}>
                New Value
              </Button>
              <Button type="button" onClick={openValueEditor}>
                Update Value
              </Button>
              {valueConflicts.length > 0 ? (
                <Button type="button" variant="destructive" onClick={() => setConflictsOpen(true)} disabled={conflictsLoading}>
                  Resolve Value Conflicts ({valueConflicts.length})
                </Button>
              ) : null}
            </>
          ) : null}
          <ExportButton data={filteredData} filename={statusFilter ? `${statusFilter.toLowerCase().replace(/\//g, '-')}-tenders` : 'all-tenders'} />
        </div>
      </div>

      <AdvancedFilters
        data={opportunities}
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
      />

      <div className="flex-1 min-h-0">
        <OpportunitiesTable
          data={filteredData}
          onSelectOpportunity={setSelectedOpp}
          scrollContainerClassName="relative h-full overflow-y-auto overflow-x-auto scrollbar-thin"
          maxHeight="h-full"
        />
      </div>

      <OpportunityDetailDialog
        open={!!selectedOpp}
        opportunity={selectedOpp}
        onOpenChange={(open) => {
          if (!open) setSelectedOpp(null);
        }}
        formatCurrency={formatCurrency}
      />

      <Dialog open={valueEditorOpen} onOpenChange={setValueEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manual Value Update</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              <Input
                placeholder="Universal search… (ref, tender, client, any raw sheet text)"
                value={valueEditorSearch}
                onChange={(e) => setValueEditorSearch(e.target.value)}
              />
              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                {searchableValueEditorResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${valueEditorSelected?.id === row.id ? 'bg-muted' : ''}`}
                    onClick={() => {
                      setValueEditorSelected(row);
                      setManualValueInput(row.opportunityValueManual !== null && row.opportunityValueManual !== undefined ? String(row.opportunityValueManual) : '');
                    }}
                  >
                    <div className="font-semibold">{row.opportunityRefNo} — {row.tenderName || 'Untitled'}</div>
                    <div className="text-xs text-muted-foreground">{row.clientName || '—'} • {row.groupClassification || '—'}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              {valueEditorSelected ? (
                <>
                  <div className="text-sm font-semibold">{valueEditorSelected.opportunityRefNo}</div>
                  <div className="text-xs text-muted-foreground">{valueEditorSelected.tenderName || 'Untitled'} • {valueEditorSelected.clientName || '—'}</div>
                  <Separator />
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sheet value</span>
                      <span className="font-semibold">{valueEditorSelected.opportunityValueSheet != null ? formatCurrency(valueEditorSelected.opportunityValueSheet) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Manual value</span>
                      <span className="font-semibold">{valueEditorSelected.opportunityValueManual != null ? formatCurrency(valueEditorSelected.opportunityValueManual) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Effective</span>
                      <span className="font-semibold">{valueEditorSelected.opportunityValue != null ? formatCurrency(valueEditorSelected.opportunityValue) : '—'}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Set manual value</div>
                    <Input
                      inputMode="decimal"
                      placeholder="Enter value (number)"
                      value={manualValueInput}
                      onChange={(e) => setManualValueInput(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        disabled={valueSaving}
                        onClick={() => {
                          const trimmed = manualValueInput.trim();
                          if (!trimmed) return saveManualValue(null);
                          const parsed = Number(trimmed);
                          if (!Number.isFinite(parsed)) {
                            toast.error('Enter a valid number.');
                            return;
                          }
                          return saveManualValue(parsed);
                        }}
                      >
                        Save
                      </Button>
                      <Button type="button" variant="outline" disabled={valueSaving} onClick={() => saveManualValue(null)}>
                        Clear manual
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Select an opportunity from the left to edit its manual value.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Value Conflicts</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These tenders have a manual value that differs from the latest sheet value. Choose what to keep.
          </p>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            {valueConflicts.map((row) => (
              <div key={row.refKey} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{row.opportunityRefNo} — {row.tenderName || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground">Sheet: {formatCurrency(row.sheetValue)} • Manual: {formatCurrency(row.manualValue)}</div>
                </div>
                <Badge variant="destructive">Conflict</Badge>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => resolveConflicts('keep_manual')}>
              Keep Manual
            </Button>
            <Button type="button" variant="destructive" onClick={() => resolveConflicts('use_sheet')}>
              Use Sheet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Opportunities;
