import { useEffect, useRef, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, AlertTriangle } from 'lucide-react';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Opportunity } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { JspreadsheetGrid, JspreadsheetGridHandle } from '@/components/Opportunities/JspreadsheetGrid';
import { UploadSheetDialog } from '@/components/Opportunities/UploadSheetDialog';
import { EntryDialog } from '@/components/Opportunities/EntryDialog';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type ConflictGroup = {
  refKey: string;
  opportunityRefNo: string;
  tenderName: string;
  fields: Array<{ id: string; fieldKey: string; fieldLabel: string; sheetValue: unknown; existingValue: unknown }>;
};

interface OpportunitiesProps {
  statusFilter?: string;
}

const Opportunities = ({ statusFilter }: OpportunitiesProps) => {
  const { opportunities, refreshData, upsertOpportunities } = useData();
  const { exchangeRate } = useCurrency();
  const { token, canPerformAction } = useAuth();
  const { status: trackedStatus } = useTrackedAction();
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState(statusFilter || '');
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPrefill, setEntryPrefill] = useState<Partial<Opportunity> | undefined>(undefined);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);

  const gridRef = useRef<JspreadsheetGridHandle>(null);

  const canEdit = canPerformAction('manual_opportunity_updates_write');
  const canUpload = canPerformAction('opportunities_sheet_upload');

  // KPI counts
  const kpi = useMemo(() => {
    const total = opportunities.length;
    const submitted = opportunities.filter((o) => String(o.avenirStatus || '').toUpperCase() === 'SUBMITTED').length;
    const awarded = opportunities.filter((o) => String(o.avenirStatus || '').toUpperCase() === 'AWARDED').length;
    const lost = opportunities.filter((o) => {
      const s = String(o.avenirStatus || '').toUpperCase();
      return s === 'LOST' || s === 'REGRETTED';
    }).length;
    return { total, submitted, awarded, lost };
  }, [opportunities]);

  // Push search term to grid
  useEffect(() => {
    gridRef.current?.search(search);
  }, [search]);

  // Handle ?editOpportunityValueRef=XXX URL param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('editOpportunityValueRef') || '';
    if (!ref || !opportunities.length) return;
    const match = opportunities.find((o) => String(o.opportunityRefNo || '').trim() === ref.trim()) || null;
    if (!match) return;
    setEntryPrefill(match);
    setEntryOpen(true);
    params.delete('editOpportunityValueRef');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [location.search, opportunities, navigate, location.pathname]);

  const loadConflicts = async () => {
    if (!token || !canEdit) return;
    setConflictsLoading(true);
    try {
      const res = await fetch(`${API_URL}/opportunities/value-conflicts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load conflicts');
      const rows = Array.isArray(data?.conflicts) ? data.conflicts : [];
      setConflicts(rows);
    } catch (e) {
      console.error('[opportunities.conflicts.load]', e);
    } finally {
      setConflictsLoading(false);
    }
  };

  useEffect(() => { void loadConflicts(); }, [token, canEdit]);

  const resolveConflict = async (conflictId: string, action: 'use_sheet' | 'keep_existing') => {
    if (!token || !canEdit) return;
    setResolvingConflictId(conflictId);
    try {
      const res = await fetch(`${API_URL}/opportunities/value-conflicts/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: [{ conflictId, action }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Resolve failed');
      toast.success(action === 'use_sheet' ? 'Sheet value applied.' : 'Existing value kept.');
      await refreshData({ background: true });
      await loadConflicts();
    } catch (e) {
      toast.error((e as Error).message || 'Resolve failed');
    } finally {
      setResolvingConflictId(null);
    }
  };

  return (
    <>
      <ActionProgressBar status={trackedStatus} />
      <div className="flex flex-col gap-4 p-4 h-[calc(100vh-4rem)]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {statusFilter ? `${statusFilter} Tenders` : 'All Tenders'}
              <Badge variant="secondary">{kpi.total}</Badge>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Search grid…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44"
            />
            {canUpload && (
              <UploadSheetDialog
                token={token}
                opportunities={opportunities}
                onUpsertOpportunities={upsertOpportunities}
                onRefreshData={() => void refreshData({ background: true })}
              />
            )}
            {canEdit && (
              <Button type="button" onClick={() => { setEntryPrefill(undefined); setEntryOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Entry
              </Button>
            )}
            <ExportButton data={opportunities} />
            {conflicts.length > 0 && (
              <Button type="button" variant="destructive" size="sm" onClick={() => setConflictsOpen(true)} disabled={conflictsLoading}>
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: kpi.total, color: 'bg-slate-500' },
            { label: 'Submitted', value: kpi.submitted, color: 'bg-blue-500' },
            { label: 'Awarded', value: kpi.awarded, color: 'bg-amber-500' },
            { label: 'Lost / Regretted', value: kpi.lost, color: 'bg-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <div className={`h-8 w-1 rounded-full ${color}`} />
              <div>
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 min-h-0 rounded-md border">
          <JspreadsheetGrid
            ref={gridRef}
            opportunities={opportunities}
            exchangeRate={exchangeRate}
            token={token}
            canEdit={canEdit}
            onUpsertOpportunity={(rows) => upsertOpportunities(rows)}
          />
        </div>
      </div>

      {/* Entry dialog */}
      <EntryDialog
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        token={token}
        canEdit={canEdit}
        opportunities={opportunities}
        onUpsertOpportunity={(rows) => upsertOpportunities(rows)}
        prefill={entryPrefill}
      />

      {/* Conflicts dialog */}
      <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Sheet Sync Conflicts</DialogTitle>
            <DialogDescription>Resolve pending sync conflicts between manual edits and sheet uploads.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            {conflicts.map((group) => (
              <div key={group.refKey} className="border-b px-3 py-2 last:border-b-0">
                <div className="mb-2 flex items-center gap-2">
                  <div className="font-semibold">{group.opportunityRefNo} — {group.tenderName || 'Untitled'}</div>
                  <Badge variant="destructive">{group.fields.length} conflict{group.fields.length > 1 ? 's' : ''}</Badge>
                </div>
                <div className="space-y-2">
                  {group.fields.map((field) => (
                    <div key={field.id} className="grid grid-cols-[180px_1fr_1fr_auto] gap-2 text-sm">
                      <div className="font-medium">{field.fieldLabel}</div>
                      <div className="rounded border px-2 py-1 text-muted-foreground">Existing: {String(field.existingValue ?? '—')}</div>
                      <div className="rounded border px-2 py-1">Sheet: {String(field.sheetValue ?? '—')}</div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => void resolveConflict(field.id, 'keep_existing')}
                          disabled={Boolean(resolvingConflictId && resolvingConflictId !== field.id)}>
                          Keep
                        </Button>
                        <Button type="button" size="sm" variant="destructive"
                          onClick={() => void resolveConflict(field.id, 'use_sheet')}
                          disabled={Boolean(resolvingConflictId && resolvingConflictId !== field.id)}>
                          Use Sheet
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {conflicts.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">No pending conflicts.</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Opportunities;
