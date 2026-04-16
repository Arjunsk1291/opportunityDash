import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  downloadVendorTemplate,
  exportVendors,
  normalizeCompanyName,
  parseCommaInput,
  previewVendorImport,
  scoreVendorAgainstTerms,
  type AgreementStatus,
  type VendorData,
} from '@/lib/vendors';
import { useAuth } from '@/contexts/AuthContext';
import { useVendorStore } from '@/hooks/useVendorStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ArrowUpDown,
  Award,
  Building2,
  Cloud,
  FileSpreadsheet,
  Filter,
  FolderSymlink,
  Globe,
  Handshake,
  LayoutGrid,
  List,
  Mail,
  Network,
  Plus,
  ScanSearch,
  Search,
  Shield,
  Sparkles,
  Upload,
  UserRound,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

const QUICK_FILTERS = ['Python', 'AWS', 'Azure', 'ISO 27001', 'React', 'Power BI', 'Kubernetes', 'Microsoft'];

type SortKey = 'name' | 'size' | 'certs' | 'techBreadth';
type ViewMode = 'grid' | 'list';
type AgreementFilter = 'ALL' | AgreementStatus;

type VendorFormState = {
  companyName: string;
  primaryIndustries: string;
  confirmedServices: string;
  confirmedTechStack: string;
  nonSpecializedTechStack: string;
  sampleProjects: string;
  certifications: string;
  partners: string;
  companySize: string;
  sources: string;
  focusArea: string;
  ndaStatus: string;
  associationAgreementStatus: string;
  contactPerson: string;
  emails: string;
};

type EnrichedVendor = {
  vendor: VendorData;
  relevance: number;
  matchCount: number;
};

const emptyFormState: VendorFormState = {
  companyName: '',
  primaryIndustries: '',
  confirmedServices: '',
  confirmedTechStack: '',
  nonSpecializedTechStack: '',
  sampleProjects: '',
  certifications: '',
  partners: '',
  companySize: '',
  sources: '',
  focusArea: '',
  ndaStatus: '',
  associationAgreementStatus: '',
  contactPerson: '',
  emails: '',
};

const agreementTone: Record<AgreementStatus, string> = {
  NDA: 'bg-info/15 text-info border-info/20',
  'Association Agreement': 'bg-success/15 text-success border-success/20',
  Pending: 'bg-warning/15 text-warning border-warning/20',
};

const YES_STATUS_TOKENS = ['yes', 'y', 'signed', 'active', 'done', 'completed'];

const hasPositiveStatus = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return YES_STATUS_TOKENS.some((token) => normalized.includes(token));
};

const partnerStatusSummary = (vendor: VendorData): AgreementStatus => {
  if (hasPositiveStatus(vendor.ndaStatus)) return 'NDA';
  if (hasPositiveStatus(vendor.associationAgreementStatus)) return 'Association Agreement';
  return vendor.agreementStatus || 'Pending';
};

const partnerStatusDetail = (vendor: VendorData) => {
  const nda = String(vendor.ndaStatus || '').trim();
  const association = String(vendor.associationAgreementStatus || '').trim();
  if (nda && association) return `NDA: ${nda} | Association: ${association}`;
  if (nda) return `NDA: ${nda}`;
  if (association) return `Association: ${association}`;
  return partnerStatusSummary(vendor);
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text: string, terms: string[]) => {
  const activeTerms = terms.filter(Boolean);
  if (!activeTerms.length) return text;
  const pattern = activeTerms.map(escapeRegex).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  return String(text || '').split(regex).map((part, index) => {
    const match = activeTerms.some((term) => part.toLowerCase() === term.toLowerCase());
    return match ? (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-200/70 px-1 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
};

const sizeOrder = (size: string) => {
  const value = String(size || '').trim();
  if (!value) return 0;
  const first = Number((value.match(/\d+/) || ['0'])[0]);
  return Number.isFinite(first) ? first : 0;
};

const focusMeta = (focusArea: string) => {
  const normalized = focusArea.toLowerCase();
  if (normalized.includes('cloud')) return { icon: Cloud, tone: 'text-info bg-info/10' };
  if (normalized.includes('cyber') || normalized.includes('security')) return { icon: Shield, tone: 'text-destructive bg-destructive/10' };
  if (normalized.includes('automation') || normalized.includes('iot')) return { icon: Wrench, tone: 'text-warning bg-warning/10' };
  if (normalized.includes('analytics') || normalized.includes('data')) return { icon: ScanSearch, tone: 'text-primary bg-primary/10' };
  return { icon: Network, tone: 'text-success bg-success/10' };
};

const toFormState = (vendor?: VendorData | null): VendorFormState => {
  if (!vendor) return emptyFormState;
  return {
    companyName: vendor.companyName,
    primaryIndustries: vendor.primaryIndustries.join(', '),
    confirmedServices: vendor.confirmedServices.join(', '),
    confirmedTechStack: vendor.confirmedTechStack.join(', '),
    nonSpecializedTechStack: vendor.nonSpecializedTechStack.join(', '),
    sampleProjects: vendor.sampleProjects.join(', '),
    certifications: vendor.certifications.join(', '),
    partners: vendor.partners.join(', '),
    companySize: vendor.companySize,
    sources: vendor.sources.join(', '),
    focusArea: vendor.focusArea,
    ndaStatus: vendor.ndaStatus || '',
    associationAgreementStatus: vendor.associationAgreementStatus || '',
    contactPerson: vendor.contactPerson,
    emails: vendor.emails.join(', '),
  };
};

const toVendorPayload = (form: VendorFormState) => ({
  companyName: normalizeCompanyName(form.companyName),
  primaryIndustries: parseCommaInput(form.primaryIndustries),
  confirmedServices: parseCommaInput(form.confirmedServices),
  confirmedTechStack: parseCommaInput(form.confirmedTechStack),
  nonSpecializedTechStack: parseCommaInput(form.nonSpecializedTechStack),
  sampleProjects: parseCommaInput(form.sampleProjects),
  certifications: parseCommaInput(form.certifications),
  partners: parseCommaInput(form.partners),
  companySize: form.companySize.trim(),
  sources: parseCommaInput(form.sources),
  focusArea: form.focusArea.trim(),
  ndaStatus: form.ndaStatus.trim(),
  associationAgreementStatus: form.associationAgreementStatus.trim(),
  contactPerson: form.contactPerson.trim(),
  emails: parseCommaInput(form.emails),
});

function VendorFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialVendor,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: VendorFormState) => Promise<void> | void;
  initialVendor?: VendorData | null;
  title: string;
  description: string;
}) {
  const [form, setForm] = useState<VendorFormState>(toFormState(initialVendor));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(initialVendor));
  }, [initialVendor, open]);

  const setField = (key: keyof VendorFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await onSubmit(form);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
        <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-2 scrollbar-thin md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Company Name</Label>
            <Input value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} placeholder="Company Name" />
          </div>
          <div className="space-y-2">
            <Label>Focus Area</Label>
            <Input value={form.focusArea} onChange={(e) => setField('focusArea', e.target.value)} placeholder="Analytics, Cloud Platforms..." />
          </div>
          <div className="space-y-2">
            <Label>Company Size</Label>
            <Input value={form.companySize} onChange={(e) => setField('companySize', e.target.value)} placeholder="11-50, 51-200..." />
          </div>
          <div className="space-y-2">
            <Label>NDA Status</Label>
            <Input
              value={form.ndaStatus}
              onChange={(e) => setField('ndaStatus', e.target.value)}
              placeholder="Yes / No / Initiation / reason"
            />
          </div>
          <div className="space-y-2">
            <Label>Contact Person</Label>
            <Input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} placeholder="Primary contact" />
          </div>
          <div className="space-y-2">
            <Label>Association Agreement Status</Label>
            <Input
              value={form.associationAgreementStatus}
              onChange={(e) => setField('associationAgreementStatus', e.target.value)}
              placeholder="Yes / No / Initiation / reason"
            />
          </div>
          <FieldTextarea label="Emails" value={form.emails} onChange={(value) => setField('emails', value)} placeholder="Comma separated" />
          <FieldTextarea label="Sources" value={form.sources} onChange={(value) => setField('sources', value)} placeholder="Comma separated URLs or references" />
          <FieldTextarea label="Primary Industries" value={form.primaryIndustries} onChange={(value) => setField('primaryIndustries', value)} placeholder="Comma separated" />
          <FieldTextarea label="Confirmed Services" value={form.confirmedServices} onChange={(value) => setField('confirmedServices', value)} placeholder="Comma separated" />
          <FieldTextarea label="Confirmed Tech Stack" value={form.confirmedTechStack} onChange={(value) => setField('confirmedTechStack', value)} placeholder="Comma separated" />
          <FieldTextarea label="Non-Specialized Tech Stack" value={form.nonSpecializedTechStack} onChange={(value) => setField('nonSpecializedTechStack', value)} placeholder="Comma separated" />
          <FieldTextarea label="Sample Projects" value={form.sampleProjects} onChange={(value) => setField('sampleProjects', value)} placeholder="Comma separated" />
          <FieldTextarea label="Certifications" value={form.certifications} onChange={(value) => setField('certifications', value)} placeholder="Comma separated" />
          <FieldTextarea label="Partners" value={form.partners} onChange={(value) => setField('partners', value)} placeholder="Comma separated" />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button
            type="submit"
            disabled={!form.companyName.trim()}
          >
            {isSaving ? 'Saving...' : 'Save Partner'}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SectionTagGrid({ title, items, className }: { title: string; items: string[]; className: string }) {
  return (
    <section className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length ? items.map((item) => <Badge key={item} className={className}>{item}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}
      </div>
    </section>
  );
}

function CompareDialog({ open, onOpenChange, vendors }: { open: boolean; onOpenChange: (open: boolean) => void; vendors: VendorData[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Partner Comparison</DialogTitle>
          <DialogDescription>Side-by-side comparison of selected partners.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="grid min-w-[720px] gap-4" style={{ gridTemplateColumns: `repeat(${vendors.length}, minmax(260px, 1fr))` }}>
            {vendors.map((vendor) => (
              <Card key={vendor.id} className="bg-card/80">
                <CardContent className="space-y-4 p-4">
                  <div>
                    <h3 className="text-lg font-semibold">{vendor.companyName}</h3>
                    <p className="text-sm text-muted-foreground">{vendor.focusArea || 'No focus area'}</p>
                  </div>
                  <CompareBlock label="NDA Status" value={vendor.ndaStatus || '—'} />
                  <CompareBlock label="Association Status" value={vendor.associationAgreementStatus || '—'} />
                  <CompareBlock label="Size" value={vendor.companySize || '—'} />
                  <CompareBlock label="Tech Stack" value={vendor.confirmedTechStack.join(', ') || '—'} />
                  <CompareBlock label="Certifications" value={vendor.certifications.join(', ') || '—'} />
                  <CompareBlock label="Services" value={vendor.confirmedServices.join(', ') || '—'} />
                  <CompareBlock label="Partners" value={vendor.partners.join(', ') || '—'} />
                  <CompareBlock label="Contact" value={vendor.contactPerson || '—'} />
                  <CompareBlock label="Emails" value={vendor.emails.join(', ') || '—'} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="text-sm leading-6">{value}</div>
    </div>
  );
}

export default function VendorDirectory() {
  const { isMaster, canPerformAction } = useAuth();
  const { vendors, isLoading, error, addVendor, updateVendor, importVendors } = useVendorStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [quickFilters, setQuickFilters] = useState<string[]>([]);
  const [agreementFilter, setAgreementFilter] = useState<AgreementFilter>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [selectedVendor, setSelectedVendor] = useState<VendorData | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ newVendors: VendorData[]; skippedDuplicates: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAddVendor = canPerformAction('vendors_write');
  const canImportVendors = canPerformAction('vendors_import');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editVendorId = params.get('editVendorId') || '';
    if (!editVendorId) return;
    if (vendors.length === 0) return;

    const match = vendors.find((vendor) => String(vendor.id || '').trim() === editVendorId.trim()) || null;
    if (!match) return;

    setSelectedVendor(match);
    setEditOpen(true);

    params.delete('editVendorId');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate, vendors]);

  const searchTerms = useMemo(() => {
    const queryTerms = search.split(/\s+/).map((term) => term.trim()).filter(Boolean);
    return Array.from(new Set([...queryTerms, ...quickFilters]));
  }, [search, quickFilters]);

  const enrichedVendors = useMemo<EnrichedVendor[]>(() => {
    return vendors
      .map((vendor) => {
        const score = scoreVendorAgainstTerms(vendor, searchTerms);
        return {
          vendor,
          relevance: score.relevance,
          matchCount: score.matchCount,
        };
      })
      .filter(({ vendor, relevance }) => {
        const matchesAgreement = agreementFilter === 'ALL' || partnerStatusSummary(vendor) === agreementFilter;
        const matchesSearch = searchTerms.length === 0 || relevance > 0;
        return matchesAgreement && matchesSearch;
      })
      .sort((a, b) => {
        if (searchTerms.length > 0 && b.relevance !== a.relevance) return b.relevance - a.relevance;
        switch (sortBy) {
          case 'size':
            return sizeOrder(b.vendor.companySize) - sizeOrder(a.vendor.companySize) || a.vendor.companyName.localeCompare(b.vendor.companyName);
          case 'certs':
            return b.vendor.certifications.length - a.vendor.certifications.length || a.vendor.companyName.localeCompare(b.vendor.companyName);
          case 'techBreadth':
            return (b.vendor.confirmedTechStack.length + b.vendor.nonSpecializedTechStack.length) - (a.vendor.confirmedTechStack.length + a.vendor.nonSpecializedTechStack.length) || a.vendor.companyName.localeCompare(b.vendor.companyName);
          case 'name':
          default:
            return a.vendor.companyName.localeCompare(b.vendor.companyName);
        }
      });
  }, [agreementFilter, searchTerms, sortBy, vendors]);

  const totals = useMemo(() => ({
    total: vendors.length,
    nda: vendors.filter((vendor) => partnerStatusSummary(vendor) === 'NDA').length,
    association: vendors.filter((vendor) => partnerStatusSummary(vendor) === 'Association Agreement').length,
    pending: vendors.filter((vendor) => partnerStatusSummary(vendor) === 'Pending').length,
  }), [vendors]);

  const compareVendors = useMemo(() => vendors.filter((vendor) => compareIds.includes(vendor.id)), [compareIds, vendors]);

  const toggleCompare = (id: string, checked: boolean) => {
    setCompareIds((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((item) => item !== id);
    });
  };

  const handleAddVendor = async (form: VendorFormState) => {
    if (!form.companyName.trim()) {
      toast.error('Company Name is required.');
      return;
    }
    try {
      await addVendor(toVendorPayload(form));
      setAddOpen(false);
      toast.success('Partner added.');
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to add partner.');
    }
  };

  const handleEditVendor = async (form: VendorFormState) => {
    if (!selectedVendor) return;
    try {
      const saved = await updateVendor(selectedVendor.id, toVendorPayload(form));
      setSelectedVendor(saved);
      setEditOpen(false);
      toast.success('Partner updated.');
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to update partner.');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      setIsImporting(true);
      const preview = await previewVendorImport(file, vendors);
      setImportPreview(preview);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to read Excel file.');
    } finally {
      setIsImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    try {
      await importVendors(importPreview.newVendors.map(({ id: _id, ...vendor }) => vendor));
      toast.success(`Imported ${importPreview.newVendors.length} vendors.`);
      setImportOpen(false);
      setImportPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      toast.error((error as Error).message || 'Import failed.');
    }
  };

  const kpiCards = [
    { key: 'ALL' as const, label: 'Total Partners', value: totals.total, tone: 'from-primary/15 to-primary/5' },
    { key: 'NDA' as const, label: 'NDA', value: totals.nda, tone: 'from-info/20 to-info/5' },
    { key: 'Association Agreement' as const, label: 'Association', value: totals.association, tone: 'from-success/20 to-success/5' },
    { key: 'Pending' as const, label: 'Pending', value: totals.pending, tone: 'from-warning/20 to-warning/5' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="bg-card/80 p-4 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Partners</h1>
            <p className="text-sm text-muted-foreground">Searchable partnership, tech, and agreement intelligence for delivery teams.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)} disabled={!canImportVendors}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button className="gap-2" onClick={() => setAddOpen(true)} disabled={!canAddVendor}>
              <Plus className="h-4 w-4" />
              Add Partner
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportVendors(vendors)}>
              <FileSpreadsheet className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setAgreementFilter(card.key)}
            className={cn(
              'rounded-2xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-lg',
              agreementFilter === card.key ? 'border-primary shadow-lg shadow-primary/10' : 'border-border',
            )}
          >
            <Card className={cn('h-full border-0 bg-gradient-to-br p-5', card.tone)}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</div>
              <div className="mt-3 text-3xl font-semibold">{card.value}</div>
            </Card>
          </button>
        ))}
      </div>

      <Card className="bg-card/80 p-4 backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                placeholder="Search across tech, certs, services, partners, contact, sources..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_FILTERS.map((chip) => {
                const active = quickFilters.includes(chip);
                return (
                  <Button
                    key={chip}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="rounded-full"
                    onClick={() => setQuickFilters((prev) => prev.includes(chip) ? prev.filter((item) => item !== chip) : [...prev, chip])}
                  >
                    {chip}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center rounded-lg border border-border p-1">
              <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')}>
                <List className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-[180px]">
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
                <SelectTrigger>
                  <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="size">Sort: Size</SelectItem>
                  <SelectItem value="certs">Sort: Certs</SelectItem>
                  <SelectItem value="techBreadth">Sort: Tech Breadth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {enrichedVendors.map(({ vendor, relevance, matchCount }) => {
            const focus = focusMeta(vendor.focusArea);
            const FocusIcon = focus.icon;
            return (
              <div key={vendor.id} className="[perspective:1000px]">
                <Card
                  className="group h-full overflow-hidden border-border/70 bg-card/85 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:scale-[1.01] hover:shadow-2xl"
                  onClick={() => setSelectedVendor(vendor)}
                >
                  <div className="h-1.5 w-full bg-gradient-to-r from-primary via-info to-success" />
                  <CardContent className="space-y-4 p-5 [transform-style:preserve-3d]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className={cn('mt-0.5 rounded-lg p-2', focus.tone)}>
                            <FocusIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold">{highlightText(vendor.companyName, searchTerms)}</h3>
                            <p className="text-sm text-muted-foreground">{highlightText(vendor.focusArea || 'General capability', searchTerms)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn('border', agreementTone[partnerStatusSummary(vendor)])}>{partnerStatusSummary(vendor)}</Badge>
                          <Badge variant="outline">{vendor.companySize || 'Size n/a'}</Badge>
                          {searchTerms.length > 0 && relevance > 0 && (
                            <Badge variant="secondary">{relevance} matches</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2 py-1 text-xs">
                          <Checkbox
                            checked={compareIds.includes(vendor.id)}
                            onCheckedChange={(checked) => toggleCompare(vendor.id, Boolean(checked))}
                            onClick={(e) => e.stopPropagation()}
                          />
                          Compare
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <TagCluster title="Tech Stack" items={vendor.confirmedTechStack} max={6} tone="bg-primary/10 text-primary" />
                      <TagCluster title="Industries" items={vendor.primaryIndustries} max={3} tone="bg-success/10 text-success" />
                    </div>

                    <div className="grid gap-2 border-t border-border/70 pt-4 text-sm sm:grid-cols-2">
                      <FooterMetric icon={Award} label="Certs" value={vendor.certifications.length ? vendor.certifications.join(', ') : 'None'} />
                      <FooterMetric icon={Handshake} label="Partners" value={vendor.partners.length ? vendor.partners.join(', ') : 'None'} />
                      <FooterMetric icon={UserRound} label="Contact" value={vendor.contactPerson || 'Unknown'} />
                      <FooterMetric icon={Mail} label="Email" value={vendor.emails[0] || 'No email'} />
                    </div>
                    {matchCount > 0 && <div className="text-xs text-muted-foreground">Matched {matchCount} search terms.</div>}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card/80 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Cmp</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Focus</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Tech</TableHead>
                  <TableHead>Certs</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedVendors.map(({ vendor, relevance }) => (
                  <TableRow key={vendor.id} className="cursor-pointer" onClick={() => setSelectedVendor(vendor)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={compareIds.includes(vendor.id)} onCheckedChange={(checked) => toggleCompare(vendor.id, Boolean(checked))} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{highlightText(vendor.companyName, searchTerms)}</div>
                        {searchTerms.length > 0 && relevance > 0 && <Badge variant="secondary">{relevance} matches</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{vendor.focusArea || '—'}</TableCell>
                    <TableCell><Badge className={cn('border', agreementTone[partnerStatusSummary(vendor)])}>{partnerStatusSummary(vendor)}</Badge></TableCell>
                    <TableCell>{vendor.companySize || '—'}</TableCell>
                    <TableCell>{vendor.confirmedTechStack.length}</TableCell>
                    <TableCell>{vendor.certifications.length}</TableCell>
                    <TableCell>{vendor.contactPerson || vendor.emails[0] || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {enrichedVendors.length === 0 && (
        <Card className="bg-card/80 p-10 text-center text-muted-foreground backdrop-blur-sm">
          No partners match the current filters.
        </Card>
      )}

      {isLoading && (
        <Card className="bg-card/80 p-10 text-center text-muted-foreground backdrop-blur-sm">
          Loading partners from MongoDB...
        </Card>
      )}

      {error && !isLoading && (
        <Card className="bg-card/80 p-10 text-center text-destructive backdrop-blur-sm">
          {error}
        </Card>
      )}

      {compareIds.length >= 2 && (
        <div className="fixed bottom-20 right-5 z-50 sm:bottom-24">
          <Button className="gap-2 rounded-full px-5 shadow-2xl" onClick={() => setCompareOpen(true)}>
            <FolderSymlink className="h-4 w-4" />
            Compare ({compareIds.length})
          </Button>
        </div>
      )}

      <Dialog open={Boolean(selectedVendor)} onOpenChange={(open) => !open && setSelectedVendor(null)}>
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          {selectedVendor && (
            <>
              <div className="bg-gradient-to-br from-primary via-info to-success px-6 py-6 text-primary-foreground">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <DialogTitle className="text-2xl">{selectedVendor.companyName}</DialogTitle>
                    <DialogDescription className="text-primary-foreground/80">{selectedVendor.focusArea || 'Partner capability profile'}</DialogDescription>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-white/15 text-white">{selectedVendor.companySize || 'Size n/a'}</Badge>
                      <Badge className="bg-white/15 text-white">{partnerStatusSummary(selectedVendor)}</Badge>
                    </div>
                  </div>
                  {isMaster && (
                    <Button variant="secondary" className="gap-2" onClick={() => setEditOpen(true)}>
                      <Sparkles className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5 scrollbar-thin">
                <div className="grid gap-6 lg:grid-cols-2">
                  <SectionTagGrid title="Tech Stack" items={selectedVendor.confirmedTechStack} className="bg-primary/10 text-primary" />
                  <SectionTagGrid title="Services" items={selectedVendor.confirmedServices} className="bg-info/10 text-info" />
                  <SectionTagGrid title="Industries" items={selectedVendor.primaryIndustries} className="bg-success/10 text-success" />
                  <SectionTagGrid title="Certifications" items={selectedVendor.certifications} className="bg-warning/10 text-warning" />
                  <SectionTagGrid title="Partners" items={selectedVendor.partners} className="bg-pending/10 text-pending" />
                  <SectionTagGrid title="Sample Projects" items={selectedVendor.sampleProjects} className="bg-primary/10 text-primary" />
                  <SectionTagGrid title="Non-Specialized" items={selectedVendor.nonSpecializedTechStack} className="bg-muted text-muted-foreground" />
                </div>
                <Separator />
                <div className="grid gap-4 lg:grid-cols-3">
                  <InfoPanel title="Contact">
                    <div className="space-y-2 text-sm">
                      <div>{selectedVendor.contactPerson || 'No contact person recorded'}</div>
                      {selectedVendor.emails.map((email) => (
                        <a key={email} href={`mailto:${email}`} className="block text-primary underline-offset-4 hover:underline">{email}</a>
                      ))}
                    </div>
                  </InfoPanel>
                  <InfoPanel title="Agreement Info">
                    <div className="space-y-2 text-sm">
                      <div>NDA Status: {selectedVendor.ndaStatus || 'Not provided'}</div>
                      <div>Association Agreement Status: {selectedVendor.associationAgreementStatus || 'Not provided'}</div>
                      <div>Summary: {partnerStatusDetail(selectedVendor)}</div>
                    </div>
                  </InfoPanel>
                  <InfoPanel title="Sources">
                    <div className="space-y-2 text-sm">
                      {selectedVendor.sources.length ? selectedVendor.sources.map((source) => (
                        <a key={source} href={source} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary underline-offset-4 hover:underline">
                          <Globe className="h-3.5 w-3.5" />
                          <span className="truncate">{source}</span>
                        </a>
                      )) : <span className="text-muted-foreground">No sources recorded.</span>}
                    </div>
                  </InfoPanel>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} vendors={compareVendors} />

      <VendorFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAddVendor}
        title="Add Partner"
        description="Create a new partner profile with agreement, capability, and contact details."
      />

      <VendorFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEditVendor}
        initialVendor={selectedVendor}
        title="Edit Partner"
        description="Update partner information and save changes back to the directory."
      />

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setImportPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Partners from Excel</DialogTitle>
            <DialogDescription>Upload a workbook using the provided template. Comma-separated fields are split automatically and duplicate company names are skipped.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-muted/20 p-4">
              <div>
                <div className="font-medium">Template</div>
                <div className="text-sm text-muted-foreground">Download the import template with the expected headers.</div>
              </div>
              <Button variant="outline" className="gap-2" onClick={downloadVendorTemplate}>
                <FileSpreadsheet className="h-4 w-4" />
                Download Template
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Excel File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
              />
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <Filter className="h-4 w-4" />
                Import Preview
              </div>
              {isImporting && <div className="text-sm text-muted-foreground">Reading workbook...</div>}
              {!isImporting && !importPreview && <div className="text-sm text-muted-foreground">Choose a file to preview the import.</div>}
              {importPreview && (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-success/20 bg-success/10 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">New Partners</div>
                      <div className="mt-2 text-2xl font-semibold text-success">{importPreview.newVendors.length}</div>
                    </div>
                    <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Skipped Duplicates</div>
                      <div className="mt-2 text-2xl font-semibold text-warning">{importPreview.skippedDuplicates.length}</div>
                    </div>
                  </div>
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                    {importPreview.newVendors.slice(0, 12).map((vendor) => (
                      <div key={vendor.id} className="rounded-md border border-border px-3 py-2">
                        <div className="font-medium">{vendor.companyName}</div>
                        <div className="text-xs text-muted-foreground">{vendor.focusArea || 'No focus area'} • {partnerStatusDetail(vendor)}</div>
                      </div>
                    ))}
                    {importPreview.skippedDuplicates.length > 0 && (
                      <div className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-warning">
                        Skipped: {importPreview.skippedDuplicates.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={confirmImport} disabled={!importPreview || importPreview.newVendors.length === 0}>Confirm Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FooterMetric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="truncate text-sm">{value}</div>
    </div>
  );
}

function TagCluster({ title, items, max, tone }: { title: string; items: string[]; max: number; tone: string }) {
  const visible = items.slice(0, max);
  const remaining = items.length - visible.length;
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <Badge key={item} className={tone}>{item}</Badge>
        ))}
        {remaining > 0 && <Badge variant="outline">+{remaining}</Badge>}
      </div>
    </div>
  );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
