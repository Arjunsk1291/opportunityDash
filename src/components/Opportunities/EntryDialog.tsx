import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Check, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Opportunity } from '@/data/opportunityData';
import { OPPORTUNITY_COLUMNS, OPPORTUNITY_COLUMNS_BY_GROUP } from '@/lib/opportunities/columns';
import { useCurrency } from '@/contexts/CurrencyContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type FormState = {
  rawSheetYear: string;
  opportunityRefNo: string;
  tenderName: string;
  opportunityClassification: string;
  clientName: string;
  groupClassification: string;
  dateTenderReceived: string;
  tenderPlannedSubmissionDate: string;
  tenderSubmittedDate: string;
  tenderResult: string;
  tenderStatusRemark: string;
  internalLead: string;
  opportunityValue: string;
  avenirStatus: string;
  adnocRftNo: string;
  remarksReason: string;
};

const DIRECT_FORM_KEYS = new Set<keyof FormState>([
  'rawSheetYear', 'opportunityRefNo', 'tenderName', 'opportunityClassification',
  'clientName', 'groupClassification', 'dateTenderReceived', 'tenderPlannedSubmissionDate',
  'tenderSubmittedDate', 'tenderResult', 'tenderStatusRemark', 'internalLead',
  'opportunityValue', 'avenirStatus', 'adnocRftNo', 'remarksReason',
]);

const EMPTY_FORM: FormState = {
  rawSheetYear: '', opportunityRefNo: '', tenderName: '', opportunityClassification: '',
  clientName: '', groupClassification: '', dateTenderReceived: '', tenderPlannedSubmissionDate: '',
  tenderSubmittedDate: '', tenderResult: '', tenderStatusRemark: '', internalLead: '',
  opportunityValue: '', avenirStatus: '', adnocRftNo: '', remarksReason: '',
};

const COMBO_SELECT_OPTIONS: Record<string, string[]> = {
  groupClassification: ['GDS', 'GES'],
  opportunityClassification: ['Concept', 'FEED', 'DE', 'Other'],
  tenderStatusRemark: ['WON', 'LOST', 'PENDING', 'AWARDED', 'DROPPED'],
  avenirStatus: ['WORKING', 'SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'TO START', 'ONGOING', 'HOLD / CLOSED'],
  'Stage of project, Concept, FEED, DE': ['Concept', 'FEED', 'DE', 'Other'],
  'BID / NO BID DECISION': ['BID', 'NO BID'],
  'Currency, USD/AED': ['USD', 'AED'],
};

const GROUP_ORDER = ['Identification', 'Client & Scope', 'Timeline', 'Status', 'Commercials', 'Award'] as const;

type PreviewDiff = { fieldKey: string; fieldLabel: string; previousValue: unknown; nextValue: unknown };

function parseDateValue(value: string) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getDateLabel(value: string, label: string) {
  const parsed = parseDateValue(value);
  if (parsed) return format(parsed, 'PPP');
  return String(value || '').trim() || `Pick ${label}`;
}

function SearchableSelect({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const filtered = options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()));
  const exactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>
          <span className="truncate text-left">{value || label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${label}…`} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {trimmed && !exactMatch && (
              <CommandItem value={`__custom__${trimmed}`} onSelect={() => { onChange(trimmed); setOpen(false); setQuery(''); }}>
                Use "{trimmed}"
              </CommandItem>
            )}
            {filtered.map((opt) => (
              <CommandItem key={opt} value={opt} onSelect={() => { onChange(opt); setOpen(false); setQuery(''); }}>
                <Check className={cn('mr-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                {opt}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface EntryDialogProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  canEdit: boolean;
  opportunities: Opportunity[];
  onUpsertOpportunity: (rows: Opportunity[]) => void;
  prefill?: Partial<Opportunity>;
}

export function EntryDialog({ open, onClose, token, canEdit, opportunities, onUpsertOpportunity, prefill }: EntryDialogProps) {
  const { exchangeRate } = useCurrency();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [snapshotEdits, setSnapshotEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewDiffs, setPreviewDiffs] = useState<PreviewDiff[]>([]);

  const formOptions = {
    clientName: Array.from(new Set(opportunities.map((o) => String(o.clientName || '')).filter(Boolean))).sort(),
    internalLead: Array.from(new Set(opportunities.map((o) => String(o.internalLead || '')).filter(Boolean))).sort(),
  };

  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setForm({
        rawSheetYear: String(prefill.rawSheetYear || ''),
        opportunityRefNo: String(prefill.opportunityRefNo || ''),
        tenderName: String(prefill.tenderName || ''),
        opportunityClassification: String(prefill.opportunityClassification || ''),
        clientName: String(prefill.clientName || ''),
        groupClassification: String(prefill.groupClassification || ''),
        dateTenderReceived: String(prefill.dateTenderReceived || ''),
        tenderPlannedSubmissionDate: String(prefill.tenderPlannedSubmissionDate || ''),
        tenderSubmittedDate: String(prefill.tenderSubmittedDate || ''),
        tenderResult: String(prefill.tenderResult || ''),
        tenderStatusRemark: String(prefill.tenderStatusRemark || ''),
        internalLead: String(prefill.internalLead || ''),
        opportunityValue: prefill.opportunityValue !== null && prefill.opportunityValue !== undefined ? String(prefill.opportunityValue) : '',
        avenirStatus: String(prefill.avenirStatus || ''),
        adnocRftNo: String(prefill.adnocRftNo || ''),
        remarksReason: String(prefill.remarksReason || ''),
      });
      const snap = (prefill as any)?.rawGraphData?.rowSnapshot;
      if (snap && typeof snap === 'object') {
        const next: Record<string, string> = {};
        Object.entries(snap as Record<string, unknown>).forEach(([k, v]) => { next[k] = v === null || v === undefined ? '' : String(v); });
        setSnapshotEdits(next);
      }
    } else {
      setForm(EMPTY_FORM);
      setSnapshotEdits({});
    }
    setPreviewDiffs([]);
    setConfirmOpen(false);
  }, [open, prefill]);

  const fieldValue = (key: string) => {
    if (DIRECT_FORM_KEYS.has(key as keyof FormState)) return form[key as keyof FormState];
    return snapshotEdits[key] ?? '';
  };

  const setFieldValue = (key: string, value: string) => {
    if (DIRECT_FORM_KEYS.has(key as keyof FormState)) {
      setForm((prev) => ({ ...prev, [key]: value }));
    } else {
      setSnapshotEdits((prev) => ({ ...prev, [key]: value }));
    }
  };

  const computedValue = (key: string) => {
    const val = Number(String(form.opportunityValue || '').replace(/,/g, '')) || 0;
    const gm = Number(String(snapshotEdits['GM%'] || fieldValue('GM%')).replace(/%/g, '')) || 0;
    const go = Number(String(snapshotEdits['Go%'] || fieldValue('Go%')).replace(/%/g, '')) || 0;
    const get_ = Number(String(snapshotEdits['Get %'] || fieldValue('Get %')).replace(/%/g, '')) || 0;
    const currency = String(snapshotEdits['Currency, USD/AED'] || fieldValue('Currency, USD/AED')).toUpperCase();
    switch (key) {
      case 'Sr.no': return prefill ? String((opportunities.findIndex((o) => o.id === (prefill as Opportunity).id) ?? -1) + 1 || 'Auto') : 'Auto';
      case 'GM Value': return val * (gm / 100);
      case 'GO/Get %': return (go * get_) / 10000;
      case 'go/get value': return val * ((go * get_) / 10000);
      case 'USD to AED': return currency === 'USD' ? val * exchangeRate : val;
      default: return '';
    }
  };

  const renderField = (col: typeof OPPORTUNITY_COLUMNS[number]) => {
    const value = fieldValue(col.key);
    const disabled = saving || previewing;
    const selectOpts = COMBO_SELECT_OPTIONS[col.key]
      || (col.key === 'clientName' ? formOptions.clientName : col.key === 'internalLead' ? formOptions.internalLead : []);

    if (col.computed) {
      const cv = computedValue(col.key);
      const display = col.key === 'GO/Get %'
        ? `${(Number(cv) * 100).toFixed(2)}%`
        : col.key === 'Sr.no' ? String(cv) : typeof cv === 'number' ? cv.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
      return (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">{display}</div>
        </div>
      );
    }

    if (col.type === 'text' || col.key === 'remarksReason') {
      return <Textarea value={value} onChange={(e) => setFieldValue(col.key, e.target.value)} placeholder={col.header} disabled={disabled} rows={2} />;
    }

    if (col.type === 'date') {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>
              <span className="truncate text-left">{getDateLabel(value, col.header)}</span>
              <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent mode="single" selected={parseDateValue(value)} onSelect={(d) => setFieldValue(col.key, d ? format(d, 'yyyy-MM-dd') : '')} initialFocus />
            <div className="border-t p-2">
              <Button type="button" variant="ghost" className="w-full text-xs" onClick={() => setFieldValue(col.key, '')}>Clear date</Button>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    if (selectOpts.length) {
      return <SearchableSelect label={col.header} value={value} options={selectOpts} onChange={(v) => setFieldValue(col.key, v)} disabled={disabled} />;
    }

    return (
      <Input
        type={col.type === 'number' || col.type === 'percent' ? 'number' : 'text'}
        step={col.type === 'percent' ? '0.01' : undefined}
        value={value}
        onChange={(e) => setFieldValue(col.key, e.target.value)}
        placeholder={col.header}
        disabled={disabled}
      />
    );
  };

  const handleSave = async (confirmed: boolean) => {
    if (!token || !canEdit) { toast.error('No permission to save.'); return; }
    if (!String(form.opportunityRefNo || '').trim()) { toast.error('Ref No is required.'); return; }

    // Check if ref exists to determine mode
    const refNo = String(form.opportunityRefNo).trim().toLowerCase();
    const existing = opportunities.find((o) => String(o.opportunityRefNo || '').trim().toLowerCase() === refNo);
    const mode = existing ? 'update' : 'new';

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mode, confirmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');

      // Save snapshot fields
      const refForSnap = String(form.opportunityRefNo).trim();
      const snapEntries = Object.entries(snapshotEdits).filter(([h, v]) => h && v.trim());
      for (const [header, value] of snapEntries) {
        const snapRes = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'update', confirmed: true, opportunityRefNo: refForSnap, patch: { snapshot: { header, value } } }),
        });
        if (!snapRes.ok) {
          const snapData = await snapRes.json().catch(() => ({}));
          throw new Error(snapData?.error || `Failed to save snapshot: ${header}`);
        }
      }

      toast.success(mode === 'new' ? 'Opportunity created.' : 'Opportunity updated.');
      setConfirmOpen(false);
      onClose();
      const updated = data.row || data?.rows?.[0];
      if (updated) onUpsertOpportunity([updated]);
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!token || !canEdit) { toast.error('No permission.'); return; }
    if (!String(form.opportunityRefNo || '').trim()) { toast.error('Ref No is required.'); return; }

    const refNo = String(form.opportunityRefNo).trim().toLowerCase();
    const existing = opportunities.find((o) => String(o.opportunityRefNo || '').trim().toLowerCase() === refNo);
    const mode = existing ? 'update' : 'new';

    if (mode === 'new') {
      await handleSave(true);
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch(`${API_URL}/opportunities/manual-entry/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Preview failed');

      const overwrites = Array.isArray(data?.overwrites) ? data.overwrites : [];
      if (overwrites.length > 0) {
        setPreviewDiffs(overwrites);
        setConfirmOpen(true);
      } else {
        await handleSave(true);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <>
      <Dialog open={open && !confirmOpen} onOpenChange={(o) => { if (!saving && !previewing) { if (!o) onClose(); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add / Update Opportunity</DialogTitle>
            <DialogDescription>
              Only <strong>Ref No</strong> is required. If the Ref No already exists, this will update that record.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {GROUP_ORDER.map((group) => {
              const cols = OPPORTUNITY_COLUMNS_BY_GROUP[group];
              if (!cols.length) return null;
              return (
                <div key={group} className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-semibold text-foreground">{group}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {cols.map((col) => (
                      <div key={col.key} className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {col.header}
                          {col.key === 'opportunityRefNo' ? <span className="text-destructive"> *</span> : null}
                        </div>
                        {renderField(col)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || previewing}>Cancel</Button>
            <Button type="button" onClick={handlePreview} disabled={saving || previewing}>
              {saving || previewing ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite</DialogTitle>
            <DialogDescription>Review the following field changes before saving.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {previewDiffs.map((row) => (
              <div key={row.fieldKey} className="grid grid-cols-[160px_1fr_1fr] gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="font-semibold">{row.fieldLabel}</div>
                <div className="rounded border px-2 py-1 text-muted-foreground">{String(row.previousValue ?? '—')}</div>
                <div className="rounded border border-primary/40 bg-primary/5 px-2 py-1">{String(row.nextValue ?? '—')}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setConfirmOpen(false); }} disabled={saving}>Back to Edit</Button>
            <Button type="button" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Confirm Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
