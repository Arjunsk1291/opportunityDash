import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight,
  FileText, Plus, RefreshCw, Search, ShieldCheck, XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  BID_CRITERIA_DEFINITIONS,
  BID_DECISION_THRESHOLD,
  type BidCriterionDefinition,
  type BidDecisionRecord,
  calculateDecisionScore,
  fetchBidDecisionRecords,
  saveBidDecision,
} from '@/lib/bidDecision';

// ─── types ───────────────────────────────────────────────────────────────────

type WizardStep = 'source' | 'details' | 'scoring' | 'decision';

interface OpportunityDetails {
  opportunityRefNo: string;
  projectName: string;
  endUser: string;
  receivedFrom: string;
  enquiryDate: string;
  scopeOfWork: string;
}

interface CriterionEntry {
  selectedLabel: string;
  score: number;
  notes: string;
  overrideScore: boolean; // user explicitly edited the number
}

type ScoresMap = Record<string, CriterionEntry>;

const EMPTY_DETAILS: OpportunityDetails = {
  opportunityRefNo: '',
  projectName: '',
  endUser: '',
  receivedFrom: '',
  enquiryDate: '',
  scopeOfWork: '',
};

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'source', label: 'Data Source' },
  { key: 'details', label: 'Opportunity Details' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'decision', label: 'Decision' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function totalScore(scores: ScoresMap): number {
  return BID_CRITERIA_DEFINITIONS.reduce((sum, def) => {
    const entry = scores[def.key];
    const s = entry?.score ?? 0;
    return sum + (def.weight / 100) * s;
  }, 0);
}

function buildCriteriaValues(scores: ScoresMap) {
  return BID_CRITERIA_DEFINITIONS.map((def) => {
    const entry = scores[def.key];
    return {
      key: def.key,
      label: def.label,
      rating: entry?.score ?? 0,
      weight: def.weight,
      notes: entry
        ? [entry.selectedLabel, entry.notes].filter(Boolean).join(' — ')
        : '',
      included: true,
    };
  });
}

function buildScoresFromRecord(record: BidDecisionRecord): ScoresMap {
  const map: ScoresMap = {};
  for (const c of record.criteriaValues || []) {
    const def = BID_CRITERIA_DEFINITIONS.find((d) => d.key === c.key);
    if (!def) continue;
    const score = c.rating ?? 0;
    const noteParts = String(c.notes || '').split(' — ');
    const selectedLabel = noteParts[0] || (def.options[0]?.label ?? '');
    map[c.key] = {
      selectedLabel,
      score,
      notes: noteParts.slice(1).join(' — '),
      overrideScore: !def.options.some((o) => o.score === score),
    };
  }
  return map;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const current = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors
              ${done ? 'bg-primary text-primary-foreground' : active ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2' : 'bg-muted text-muted-foreground'}`}>
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`ml-1.5 text-xs font-medium hidden sm:inline ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="mx-2 h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DecisionBadge({ decision, score }: { decision: string; score: number }) {
  if (decision === 'BID')
    return <Badge className="bg-green-100 text-green-700 gap-1.5 text-sm px-3 py-1 hover:bg-green-100"><CheckCircle2 className="h-4 w-4" />BID — {score.toFixed(1)}%</Badge>;
  if (decision === 'NO BID')
    return <Badge variant="destructive" className="gap-1.5 text-sm px-3 py-1"><XCircle className="h-4 w-4" />NO BID — {score.toFixed(1)}%</Badge>;
  return <Badge variant="secondary" className="text-sm px-3 py-1">—</Badge>;
}

function CriterionCard({
  def,
  entry,
  onChange,
  index,
}: {
  def: BidCriterionDefinition;
  entry: CriterionEntry | undefined;
  onChange: (e: CriterionEntry) => void;
  index: number;
}) {
  const actualScore = entry ? (def.weight / 100) * entry.score : 0;
  const maxActual = def.weight; // actual max = weight * 100/100

  const handleOptionChange = (label: string) => {
    const opt = def.options.find((o) => o.label === label);
    onChange({
      selectedLabel: label,
      score: opt?.score ?? 0,
      notes: entry?.notes ?? '',
      overrideScore: false,
    });
  };

  const handleScoreOverride = (val: string) => {
    const n = Math.min(100, Math.max(0, Number(val) || 0));
    onChange({
      selectedLabel: entry?.selectedLabel ?? '',
      score: n,
      notes: entry?.notes ?? '',
      overrideScore: true,
    });
  };

  return (
    <Card className={`transition-colors ${entry ? 'border-primary/30 bg-card' : 'border-border bg-muted/20'}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <Badge variant="outline" className="text-xs">{index + 1}</Badge>
              <span className="font-semibold text-sm">{def.label}</span>
              {def.weight === 0 && <Badge variant="secondary" className="text-xs">Info only</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{def.description}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Weight</p>
            <p className="font-bold text-sm">{def.weight}%</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Answer</Label>
            <Select value={entry?.selectedLabel ?? ''} onValueChange={handleOptionChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select an answer…" />
              </SelectTrigger>
              <SelectContent>
                {def.options.map((opt) => (
                  <SelectItem key={opt.label} value={opt.label}>
                    {opt.label} {opt.hint ? `(${opt.hint})` : ''} → {opt.score}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Score (0–100)
              {entry?.overrideScore && <span className="ml-1 text-amber-600">overridden</span>}
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={entry?.score ?? ''}
              onChange={(e) => handleScoreOverride(e.target.value)}
              placeholder="0"
              className="h-9"
            />
          </div>
        </div>

        {entry && (
          <div className="mt-3 space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={entry.notes}
              onChange={(e) => onChange({ ...entry, notes: e.target.value })}
              placeholder="Remarks or rationale…"
              className="h-8 text-xs"
            />
          </div>
        )}

        {entry && def.weight > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Contribution</span>
              <span>{actualScore.toFixed(2)} / {maxActual}</span>
            </div>
            <Progress value={(actualScore / maxActual) * 100} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BidDecision() {
  const { opportunities } = useData();
  const { token, canPerformAction } = useAuth();
  const canSave = canPerformAction('bid_decision_manage');

  const [records, setRecords] = useState<BidDecisionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [listSearch, setListSearch] = useState('');

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('source');
  const [sourceMode, setSourceMode] = useState<'db' | 'manual'>('db');
  const [dbSearch, setDbSearch] = useState('');
  const [details, setDetails] = useState<OpportunityDetails>(EMPTY_DETAILS);
  const [scores, setScores] = useState<ScoresMap>({});
  const [saving, setSaving] = useState(false);
  const [editingRefNo, setEditingRefNo] = useState<string | null>(null); // null = new

  // ── load records ──────────────────────────────────────────────────────────

  const loadRecords = async () => {
    if (!token) return;
    setLoadingRecords(true);
    try {
      const list = await fetchBidDecisionRecords(token);
      setRecords(list);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => { void loadRecords(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── wizard helpers ────────────────────────────────────────────────────────

  const openNewWizard = () => {
    setEditingRefNo(null);
    setStep('source');
    setSourceMode('db');
    setDbSearch('');
    setDetails(EMPTY_DETAILS);
    setScores({});
    setWizardOpen(true);
  };

  const openEditWizard = (record: BidDecisionRecord) => {
    setEditingRefNo(record.opportunityRefNo);
    setStep('scoring');
    setSourceMode((record.sourceMode as 'db' | 'manual') || 'manual');
    setDetails({
      opportunityRefNo: record.opportunityRefNo,
      projectName: (record as unknown as Record<string, string>).projectName || '',
      endUser: (record as unknown as Record<string, string>).endUser || '',
      receivedFrom: (record as unknown as Record<string, string>).receivedFrom || '',
      enquiryDate: (record as unknown as Record<string, string>).enquiryDate || '',
      scopeOfWork: (record as unknown as Record<string, string>).scopeOfWork || '',
    });
    setScores(buildScoresFromRecord(record));
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
  };

  // ── DB opportunity search ─────────────────────────────────────────────────

  const filteredOpportunities = useMemo(() => {
    if (!dbSearch.trim()) return opportunities.slice(0, 50);
    const q = dbSearch.toLowerCase();
    return opportunities
      .filter((o) => {
        const ref = String(o.opportunityRefNo || o['Avenir Ref'] || '').toLowerCase();
        const name = String(o.tenderName || o['Tender Name'] || '').toLowerCase();
        const client = String(o.clientName || o['Client'] || '').toLowerCase();
        return ref.includes(q) || name.includes(q) || client.includes(q);
      })
      .slice(0, 80);
  }, [opportunities, dbSearch]);

  const selectDbOpportunity = (opp: Record<string, unknown>) => {
    const refNo = String(opp.opportunityRefNo || opp['Avenir Ref'] || '');
    setDetails({
      opportunityRefNo: refNo,
      projectName: String(opp.tenderName || opp['Tender Name'] || ''),
      endUser: String(opp.clientName || opp['Client'] || ''),
      receivedFrom: String(opp.internalLead || opp['Internal Lead'] || ''),
      enquiryDate: String(opp.dateTenderReceived || opp['Date Tender Received'] || ''),
      scopeOfWork: '',
    });
    setStep('details');
  };

  // ── scoring helpers ───────────────────────────────────────────────────────

  const allScored = BID_CRITERIA_DEFINITIONS.filter((d) => d.weight > 0).every((d) => scores[d.key]?.selectedLabel);
  const currentScore = totalScore(scores);
  const recommendation = currentScore >= BID_DECISION_THRESHOLD ? 'BID' : 'NO BID';

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!allScored) { toast.error('Score all criteria before saving.'); return; }
    if (!details.opportunityRefNo.trim()) { toast.error('Opportunity reference number is required.'); return; }
    setSaving(true);
    try {
      const record = await saveBidDecision(token!, {
        opportunityRefNo: details.opportunityRefNo.trim(),
        bidDecision: recommendation,
        decisionScore: currentScore,
        criteriaValues: buildCriteriaValues(scores),
        sourceMode: sourceMode === 'db' ? 'dashboard' : 'manual',
        projectName: details.projectName,
        endUser: details.endUser,
        receivedFrom: details.receivedFrom,
        enquiryDate: details.enquiryDate,
        scopeOfWork: details.scopeOfWork,
      });
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.opportunityRefNo === record.opportunityRefNo);
        if (idx >= 0) { const next = [...prev]; next[idx] = record; return next; }
        return [record, ...prev];
      });
      toast.success(`Saved: ${recommendation} — ${currentScore.toFixed(1)}%`);
      closeWizard();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── filtered records list ─────────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    if (!listSearch.trim()) return records;
    const q = listSearch.toLowerCase();
    return records.filter((r) =>
      r.opportunityRefNo.toLowerCase().includes(q) ||
      String((r as unknown as Record<string, string>).projectName || '').toLowerCase().includes(q)
    );
  }, [records, listSearch]);

  // ─── wizard render ────────────────────────────────────────────────────────

  if (wizardOpen) {
    return (
      <div className="space-y-6">
        {/* Wizard header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={closeWizard} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">
              {editingRefNo ? `Editing: ${editingRefNo}` : 'New Bid / No Bid Decision'}
            </h1>
          </div>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 1: Data Source ─────────────────────────────────────────── */}
        {step === 'source' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose how to populate the opportunity details.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setSourceMode('db'); setStep('details'); }}
                className={`rounded-xl border-2 p-6 text-left transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary ${sourceMode === 'db' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-semibold">From Existing Opportunity</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Search and select from tenders already in the database. Details are pre-filled automatically.
                </p>
              </button>

              <button
                type="button"
                onClick={() => { setSourceMode('manual'); setStep('details'); }}
                className={`rounded-xl border-2 p-6 text-left transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary ${sourceMode === 'manual' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-semibold">Manual Entry</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter all opportunity details manually. Useful for enquiries not yet in the system.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Details ─────────────────────────────────────────────── */}
        {step === 'details' && (
          <div className="space-y-5">
            {sourceMode === 'db' && !details.opportunityRefNo && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Search for an opportunity from the database:</p>
                <Input
                  placeholder="Search by ref no, name, or client…"
                  value={dbSearch}
                  onChange={(e) => setDbSearch(e.target.value)}
                  className="max-w-md"
                />
                <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                  {filteredOpportunities.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No opportunities found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ref No</TableHead>
                          <TableHead>Project / Tender</TableHead>
                          <TableHead>Client</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOpportunities.map((opp) => {
                          const refNo = String(opp.opportunityRefNo || opp['Avenir Ref'] || '');
                          return (
                            <TableRow
                              key={refNo}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => selectDbOpportunity(opp as unknown as Record<string, unknown>)}
                            >
                              <TableCell className="font-mono text-xs">{refNo}</TableCell>
                              <TableCell className="text-sm">{String(opp.tenderName || opp['Tender Name'] || '—')}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{String(opp.clientName || opp['Client'] || '—')}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opportunity Details</CardTitle>
                <CardDescription>
                  {sourceMode === 'db' ? 'Pre-filled from the database. Edit if needed.' : 'Enter the opportunity details manually.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Avenir Reference No <span className="text-destructive">*</span></Label>
                  <Input
                    value={details.opportunityRefNo}
                    onChange={(e) => setDetails((d) => ({ ...d, opportunityRefNo: e.target.value }))}
                    placeholder="e.g. AC-26004"
                    readOnly={sourceMode === 'db' && !!details.opportunityRefNo}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Project Name / Tender Name</Label>
                  <Input
                    value={details.projectName}
                    onChange={(e) => setDetails((d) => ({ ...d, projectName: e.target.value }))}
                    placeholder="e.g. ADNOC Pipeline Works"
                  />
                </div>
                <div className="space-y-1">
                  <Label>End User / Client</Label>
                  <Input
                    value={details.endUser}
                    onChange={(e) => setDetails((d) => ({ ...d, endUser: e.target.value }))}
                    placeholder="e.g. ADNOC"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Received From</Label>
                  <Input
                    value={details.receivedFrom}
                    onChange={(e) => setDetails((d) => ({ ...d, receivedFrom: e.target.value }))}
                    placeholder="e.g. Internal Lead / EPC Name"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Enquiry Date</Label>
                  <Input
                    type="date"
                    value={details.enquiryDate}
                    onChange={(e) => setDetails((d) => ({ ...d, enquiryDate: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Scope of Work</Label>
                  <Textarea
                    value={details.scopeOfWork}
                    onChange={(e) => setDetails((d) => ({ ...d, scopeOfWork: e.target.value }))}
                    placeholder="Brief description of the scope…"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('source')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
              <Button
                onClick={() => setStep('scoring')}
                disabled={!details.opportunityRefNo.trim()}
              >
                Next: Scoring
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Scoring ──────────────────────────────────────────────── */}
        {step === 'scoring' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Score each criterion. Weighted score updates live.
              </p>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Running total</p>
                <p className={`text-2xl font-bold ${currentScore >= BID_DECISION_THRESHOLD ? 'text-green-600' : 'text-red-500'}`}>
                  {currentScore.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Progress value={currentScore} className="flex-1 h-2.5" />
              <span className="text-xs font-medium w-10 text-right">{currentScore.toFixed(0)}%</span>
              <Badge variant={currentScore >= BID_DECISION_THRESHOLD ? 'default' : 'secondary'} className="shrink-0">
                Threshold: {BID_DECISION_THRESHOLD}%
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {BID_CRITERIA_DEFINITIONS.map((def, i) => (
                <CriterionCard
                  key={def.key}
                  def={def}
                  index={i}
                  entry={scores[def.key]}
                  onChange={(entry) => setScores((prev) => ({ ...prev, [def.key]: entry }))}
                />
              ))}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('details')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
              <Button onClick={() => setStep('decision')} disabled={!allScored}>
                Review Decision
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Decision ─────────────────────────────────────────────── */}
        {step === 'decision' && (
          <div className="space-y-6">
            {/* Score summary card */}
            <Card className={`border-2 ${recommendation === 'BID' ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`}>
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total weighted score</p>
                    <p className={`text-5xl font-black ${recommendation === 'BID' ? 'text-green-600' : 'text-red-500'}`}>
                      {currentScore.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Threshold: {BID_DECISION_THRESHOLD}% — {currentScore >= BID_DECISION_THRESHOLD ? `${(currentScore - BID_DECISION_THRESHOLD).toFixed(1)}% above` : `${(BID_DECISION_THRESHOLD - currentScore).toFixed(1)}% below`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">Recommendation</p>
                    <DecisionBadge decision={recommendation} score={currentScore} />
                  </div>
                </div>
                <Progress value={currentScore} className="mt-4 h-3" />
              </CardContent>
            </Card>

            {/* Criteria breakdown table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Criterion</TableHead>
                      <TableHead className="text-right w-20">Weight</TableHead>
                      <TableHead className="text-right w-20">Score</TableHead>
                      <TableHead className="text-right w-24">Contribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BID_CRITERIA_DEFINITIONS.map((def) => {
                      const entry = scores[def.key];
                      const contribution = entry ? (def.weight / 100) * entry.score : 0;
                      return (
                        <TableRow key={def.key}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{def.label}</p>
                              {entry?.selectedLabel && (
                                <p className="text-xs text-muted-foreground">{entry.selectedLabel}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">{def.weight}%</TableCell>
                          <TableCell className="text-right text-sm">{entry?.score ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {def.weight > 0 ? contribution.toFixed(2) : <span className="text-muted-foreground text-xs">info only</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{currentScore.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Notes: show name from details */}
            <div className="rounded-lg border bg-muted/20 p-4 text-sm space-y-1">
              <p><span className="font-medium">Ref:</span> {details.opportunityRefNo}</p>
              {details.projectName && <p><span className="font-medium">Project:</span> {details.projectName}</p>}
              {details.endUser && <p><span className="font-medium">End User:</span> {details.endUser}</p>}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('scoring')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Revise Scores
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !canSave}
                className={`gap-2 ${recommendation === 'BID' ? '' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {saving ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" />Save as {recommendation}</>
                )}
              </Button>
            </div>

            {!canSave && (
              <p className="text-xs text-muted-foreground text-center">
                You do not have permission to save bid decisions. Contact your administrator.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Records list view ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bid / No Bid Decisions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Systematic evaluation against the Avenir bid-no-bid checklist.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRecords} disabled={loadingRecords}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingRecords ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canSave && (
            <Button size="sm" onClick={openNewWizard}>
              <Plus className="mr-2 h-4 w-4" />
              New Decision
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by ref no or project name…"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          className="h-8 max-w-xs"
        />
        <Badge variant="secondary">{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref No</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingRecords && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loadingRecords && filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {records.length === 0
                      ? 'No decisions saved yet. Click "New Decision" to start.'
                      : 'No records match the search.'}
                  </TableCell>
                </TableRow>
              )}
              {filteredRecords.map((rec) => {
                const extra = rec as unknown as Record<string, string>;
                return (
                  <TableRow key={rec.opportunityRefNo}>
                    <TableCell className="font-mono text-xs">{rec.opportunityRefNo}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{extra.projectName || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <span className={rec.decisionScore >= BID_DECISION_THRESHOLD ? 'text-green-600' : 'text-red-500'}>
                        {Number(rec.decisionScore).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {rec.bidDecision === 'BID' && (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">BID</Badge>
                      )}
                      {rec.bidDecision === 'NO BID' && (
                        <Badge variant="destructive">NO BID</Badge>
                      )}
                      {rec.bidDecision === 'BLANK' && (
                        <Badge variant="secondary">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{rec.sourceMode}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => openEditWizard(rec)}
                      >
                        {canSave ? 'Edit' : 'View'}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
