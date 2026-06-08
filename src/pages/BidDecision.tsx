import { useEffect, useMemo, useState } from 'react';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight,
  Download, FileText, Loader2, Plus, RefreshCw, Search, ShieldCheck, XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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

// ─── Excel export ─────────────────────────────────────────────────────────────

async function exportBidDecisionExcel(params: {
  opportunityRefNo: string; projectName: string; endUser: string;
  receivedFrom: string; enquiryDate: string; scopeOfWork: string;
  scores: ScoresMap; totalScore: number; decision: string;
  svpReviewedBy?: string; svpFinalDecision?: string; gmApprovedBy?: string;
}) {
  const { opportunityRefNo, projectName, endUser, receivedFrom, enquiryDate, scopeOfWork, scores, totalScore, decision,
    svpReviewedBy = '', svpFinalDecision = '', gmApprovedBy = '' } = params;
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Avenir Opportunity Dashboard';
  wb.created = new Date();
  const ws = wb.addWorksheet('BID OR NO BID FORM');

  ws.columns = [
    { width: 3 }, { width: 3 },   // A, B
    { width: 52 },                  // C – criteria
    { width: 24 },                  // D – answer
    { width: 12 },                  // E – weightage
    { width: 12 },                  // F – score
    { width: 16 },                  // G – weightage factor
    { width: 14 },                  // H – actual score
    { width: 44 },                  // I – remarks
  ];

  const bd = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const isGood = decision === 'BID';

  // ── R4: Title ──
  ws.mergeCells('C4:I4');
  ws.getRow(4).height = 32;
  ws.getRow(4).getCell(3).value = 'BID/ NO BID CHECKLIST';
  ws.getRow(4).getCell(3).style = { font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: bd };

  // ── R5-R10: Header fields ──
  const fields: [number, string, string][] = [
    [5, 'END USER :', endUser], [6, 'RECEIVED FROM :', receivedFrom],
    [7, 'ENQUIRY DATED:', enquiryDate], [8, 'PROJECT NAME:', projectName],
    [9, 'AVENIR REFERENCE NO:', opportunityRefNo], [10, 'SCOPE OF WORK:', scopeOfWork],
  ];
  for (const [rn, lbl, val] of fields) {
    ws.getRow(rn).height = 18;
    ws.getRow(rn).getCell(3).value = lbl;
    ws.getRow(rn).getCell(3).style = { font: { bold: true, size: 11 }, border: bd, alignment: { vertical: 'middle' } };
    ws.mergeCells(`D${rn}:I${rn}`);
    ws.getRow(rn).getCell(4).value = val;
    ws.getRow(rn).getCell(4).style = { font: { size: 11 }, border: bd, alignment: { vertical: 'middle', wrapText: true } };
  }

  // ── R11: EVALUATION CRITERIA ──
  ws.mergeCells('C11:I11');
  ws.getRow(11).height = 26;
  ws.getRow(11).getCell(3).value = 'EVALUATION CRITERIA';
  ws.getRow(11).getCell(3).style = { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: bd };

  // ── R12: Column headers ──
  const colHdrs = ['Criteria', 'BID norms / Answer', 'Weightage', 'Score', 'Weightage factor', 'Actual score', 'Remarks'];
  ws.getRow(12).height = 30;
  [3, 4, 5, 6, 7, 8, 9].forEach((c, i) => {
    ws.getRow(12).getCell(c).value = colHdrs[i];
    ws.getRow(12).getCell(c).style = { font: { bold: true, size: 11, color: { argb: 'FF1F3864' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: bd };
  });

  // ── R13-R25: Criterion rows (exact template layout) ──
  type RowSpec = { rn: number; key?: string; section?: string };
  const rowSpecs: RowSpec[] = [
    { rn: 13, key: 'technical_feasibility' },
    { rn: 14, section: 'Strategic Fit' },
    { rn: 15, key: 'strategic_fit' },
    { rn: 16, section: 'Resource Availability' },
    { rn: 17, key: 'resource_availability' },
    { rn: 18, key: 'subcontract_portion' },
    { rn: 19, section: 'Client Reputation' },
    { rn: 20, key: 'client_reputation' },
    { rn: 21, key: 'location' },
    { rn: 22, key: 'win_ratio' },
    { rn: 23, key: 'bid_bond' },
    { rn: 24, key: 'end_user_epc' },
    { rn: 25, key: 'single_source' },
  ];

  for (const spec of rowSpecs) {
    const row = ws.getRow(spec.rn);
    row.height = 22;

    if (spec.section) {
      row.getCell(3).value = spec.section;
      row.getCell(3).style = { font: { bold: true, size: 11, italic: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }, alignment: { vertical: 'middle' }, border: bd };
      for (let c = 4; c <= 8; c++) row.getCell(c).style = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }, border: bd };
      row.getCell(9).value = 'Remarks';
      row.getCell(9).style = { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: bd };
      continue;
    }

    const def = BID_CRITERIA_DEFINITIONS.find((d) => d.key === spec.key)!;
    const entry = scores[def.key];
    const sv = entry?.score ?? 0;
    const wf = def.weight > 0 ? def.weight / 100 : 0;
    const as_ = wf * sv;
    const bg = def.weight === 0 ? 'FFFFFF99' : 'FFFFFFFF';

    row.getCell(3).value = def.description;
    row.getCell(3).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { wrapText: true, vertical: 'middle' } };
    row.getCell(4).value = entry?.selectedLabel ?? '';
    row.getCell(4).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } };
    row.getCell(5).value = def.weight || null;
    row.getCell(5).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0' };
    row.getCell(6).value = def.weight > 0 ? (sv || null) : null;
    row.getCell(6).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0' };
    row.getCell(7).value = def.weight > 0 ? wf : null;
    row.getCell(7).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0.00' };
    row.getCell(8).value = def.weight > 0 ? as_ : null;
    row.getCell(8).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0.00' };
    row.getCell(9).value = entry?.notes ?? '';
    row.getCell(9).style = { font: { size: 10 }, border: bd, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, alignment: { wrapText: true, vertical: 'middle' } };
  }

  // ── R26: Total Score ──
  ws.getRow(26).height = 26;
  ws.mergeCells('C26:D26');
  const decisionFg = isGood ? 'FFC6EFCE' : 'FFFFC7CE';
  const decisionFont = isGood ? 'FF375623' : 'FF9C0006';
  ws.getRow(26).getCell(3).value = 'Total Score (in %)';
  ws.getRow(26).getCell(3).style = { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }, border: bd, alignment: { horizontal: 'center', vertical: 'middle' } };
  ws.getRow(26).getCell(5).value = 100;
  ws.getRow(26).getCell(5).style = { font: { bold: true }, border: bd, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0' };
  ws.getRow(26).getCell(6).style = { border: bd };
  ws.getRow(26).getCell(7).value = 1;
  ws.getRow(26).getCell(7).style = { font: { bold: true }, border: bd, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0.00' };
  ws.getRow(26).getCell(8).value = totalScore;
  ws.getRow(26).getCell(8).style = { font: { bold: true, size: 13, color: { argb: decisionFont } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: decisionFg } }, border: bd, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0.00' };
  ws.getRow(26).getCell(9).value = decision;
  ws.getRow(26).getCell(9).style = { font: { bold: true, size: 13, color: { argb: decisionFont } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: decisionFg } }, border: bd, alignment: { horizontal: 'center', vertical: 'middle' } };

  // ── R27: Notes ──
  ws.mergeCells('C27:I27');
  ws.getRow(27).height = 90;
  ws.getRow(27).getCell(3).value = 'NOTES:\n\nTotal score above 65% will be considered approval to proceed with the bid.\nTotal score below 65% will be considered not to proceed with the bid.\n\nTender Manager:\n\nFinal decision will be subject to Management approval.';
  ws.getRow(27).getCell(3).style = { font: { size: 11 }, border: bd, alignment: { wrapText: true, vertical: 'top' } };

  // ── R28:R34: Final Evaluation ──
  ws.mergeCells('C28:I34');
  ws.getRow(28).height = 140;
  const finalDecision = svpFinalDecision || decision;
  const bidCheck = finalDecision === 'BID' ? '☑' : '☐';
  const noBidCheck = finalDecision === 'NO BID' ? '☑' : '☐';
  ws.getRow(28).getCell(3).value = [
    'Final Evaluation :',
    '',
    `Reviewed by : SVP${svpReviewedBy ? '   ' + svpReviewedBy : ''}`,
    '',
    `BID :  ${bidCheck}`,
    '',
    `Approved by: GM${gmApprovedBy ? '   ' + gmApprovedBy : ''}`,
    '',
    `NO BID :  ${noBidCheck}`,
  ].join('\n');
  ws.getRow(28).getCell(3).style = { font: { size: 11 }, border: bd, alignment: { wrapText: true, vertical: 'top' } };

  // ── Download ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BID-NO-BID-${opportunityRefNo || 'export'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function CriterionRow({
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
  const listId = `bid-opts-${def.key}`;
  const score = entry?.score ?? 0;
  const actualScore = def.weight > 0 ? (def.weight / 100) * score : 0;

  const handleAnswer = (rawValue: string) => {
    const matched = def.options.find((o) => o.label.toLowerCase() === rawValue.toLowerCase());
    onChange({
      selectedLabel: rawValue,
      score: matched !== undefined ? matched.score : (entry?.overrideScore ? score : 0),
      notes: entry?.notes ?? '',
      overrideScore: matched === undefined && Boolean(entry?.overrideScore),
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
    <TableRow className={entry?.selectedLabel ? '' : 'opacity-60 bg-muted/10'}>
      <TableCell className="text-center text-xs text-muted-foreground font-mono py-2 w-8">{index + 1}</TableCell>
      <TableCell className="py-2 w-44">
        <p className="text-xs font-semibold leading-snug">{def.label}</p>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{def.description}</p>
        {def.weight === 0 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 mt-1">Info only</Badge>
        )}
      </TableCell>
      <TableCell className="py-2">
        <datalist id={listId}>
          {def.options.map((opt) => (
            <option key={opt.label} value={opt.label} />
          ))}
        </datalist>
        <input
          type="text"
          list={listId}
          value={entry?.selectedLabel ?? ''}
          onChange={(e) => handleAnswer(e.target.value)}
          placeholder="Type or select answer…"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors"
        />
        {entry?.selectedLabel && (
          <input
            type="text"
            value={entry.notes}
            onChange={(e) => onChange({ ...entry, notes: e.target.value })}
            placeholder="Notes / remarks (optional)"
            className="mt-1 h-6 w-full rounded border border-input/40 bg-transparent px-2 text-[10px] text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
        )}
      </TableCell>
      <TableCell className="text-center text-xs font-medium tabular-nums py-2 w-14">
        {def.weight > 0 ? `${def.weight}%` : <span className="text-muted-foreground text-[10px]">—</span>}
      </TableCell>
      <TableCell className="py-2 w-20 text-center">
        <input
          type="number"
          min={0}
          max={100}
          value={entry?.score ?? ''}
          onChange={(e) => handleScoreOverride(e.target.value)}
          placeholder="0"
          className={`h-7 w-14 rounded border text-center text-xs font-mono transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
            entry?.overrideScore
              ? 'border-amber-400 bg-amber-50/60 text-amber-700'
              : 'border-input bg-background'
          }`}
        />
        {entry?.overrideScore && (
          <div className="text-[9px] text-amber-500 mt-0.5">override</div>
        )}
      </TableCell>
      <TableCell className="py-2 w-16 text-right">
        {def.weight > 0 ? (
          <div>
            <span className={`text-xs font-bold tabular-nums ${
              actualScore >= def.weight * 0.7 ? 'text-green-600' : actualScore > 0 ? 'text-amber-600' : 'text-muted-foreground'
            }`}>
              {actualScore.toFixed(1)}
            </span>
            <div className="mt-0.5 h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  actualScore >= def.weight * 0.7 ? 'bg-green-500' : actualScore > 0 ? 'bg-amber-400' : ''
                }`}
                style={{ width: `${def.weight > 0 ? Math.min(100, (actualScore / def.weight) * 100) : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BidDecision() {
  const { opportunities } = useData();
  const { token, canPerformAction } = useAuth();
  const canSave = canPerformAction('bid_decision_manage');
  const { status: trackedStatus, run: runTracked } = useTrackedAction();

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
  const [downloading, setDownloading] = useState(false);
  const [svpReviewedBy, setSvpReviewedBy] = useState('');
  const [svpFinalDecision, setSvpFinalDecision] = useState('');
  const [gmApprovedBy, setGmApprovedBy] = useState('');
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
    setSvpReviewedBy('');
    setSvpFinalDecision('');
    setGmApprovedBy('');
    setWizardOpen(true);
  };

  const openEditWizard = (record: BidDecisionRecord) => {
    setEditingRefNo(record.opportunityRefNo);
    setStep('scoring');
    setSourceMode(record.sourceMode === 'dashboard' ? 'db' : 'manual');
    setDetails({
      opportunityRefNo: record.opportunityRefNo,
      projectName: record.projectName || '',
      endUser: record.endUser || '',
      receivedFrom: record.receivedFrom || '',
      enquiryDate: record.enquiryDate || '',
      scopeOfWork: record.scopeOfWork || '',
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
      await runTracked('Save Bid Decision', async (setProgress) => {
        setProgress(30, 'Saving…');
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
        setProgress(90, 'Updating…');
        setRecords((prev) => {
          const idx = prev.findIndex((r) => r.opportunityRefNo === record.opportunityRefNo);
          if (idx >= 0) { const next = [...prev]; next[idx] = record; return next; }
          return [record, ...prev];
        });
        toast.success(`Saved: ${recommendation} — ${currentScore.toFixed(1)}%`);
        closeWizard();
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── download ──────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await exportBidDecisionExcel({
        opportunityRefNo: details.opportunityRefNo,
        projectName: details.projectName,
        endUser: details.endUser,
        receivedFrom: details.receivedFrom,
        enquiryDate: details.enquiryDate,
        scopeOfWork: details.scopeOfWork,
        scores,
        totalScore: currentScore,
        decision: recommendation,
        svpReviewedBy,
        svpFinalDecision,
        gmApprovedBy,
      });
    } catch (err) {
      toast.error('Export failed: ' + (err as Error).message);
    } finally {
      setDownloading(false);
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
            {/* Live score header */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Running Total — Threshold: {BID_DECISION_THRESHOLD}%</p>
                <p className={`text-3xl font-black tabular-nums ${currentScore >= BID_DECISION_THRESHOLD ? 'text-green-600' : 'text-red-500'}`}>
                  {currentScore.toFixed(1)}%
                </p>
              </div>
              <div className="text-right space-y-1.5">
                <Progress value={currentScore} className="w-32 h-3" />
                <Badge
                  className={`text-sm px-3 py-1 ${currentScore >= BID_DECISION_THRESHOLD ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100'}`}
                  variant="outline"
                >
                  {currentScore >= BID_DECISION_THRESHOLD ? '✓ BID' : '✗ NO BID'}
                </Badge>
              </div>
            </div>

            {/* Excel-like scoring table */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead className="w-44">Criteria</TableHead>
                    <TableHead>Answer / Assessment</TableHead>
                    <TableHead className="w-14 text-center">Weight</TableHead>
                    <TableHead className="w-20 text-center">Score</TableHead>
                    <TableHead className="w-16 text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BID_CRITERIA_DEFINITIONS.map((def, i) => (
                    <CriterionRow
                      key={def.key}
                      def={def}
                      index={i}
                      entry={scores[def.key]}
                      onChange={(entry) => setScores((prev) => ({ ...prev, [def.key]: entry }))}
                    />
                  ))}
                  <TableRow className="bg-muted/50 border-t-2 border-border hover:bg-muted/50">
                    <TableCell colSpan={5} className="text-right text-sm font-semibold pr-4 py-3">
                      Total Weighted Score
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <span className={`text-base font-black tabular-nums ${currentScore >= BID_DECISION_THRESHOLD ? 'text-green-600' : 'text-red-500'}`}>
                        {currentScore.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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

            {/* Final Evaluation sign-off block */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Final Evaluation (for Excel export)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reviewed by (SVP)</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="SVP name / signature"
                      value={svpReviewedBy}
                      onChange={(e) => setSvpReviewedBy(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approved by (GM)</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="GM name / signature"
                      value={gmApprovedBy}
                      onChange={(e) => setGmApprovedBy(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SVP Final Decision</label>
                  <div className="flex gap-3">
                    {(['BID', 'NO BID'] as const).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="svpFinalDecision"
                          value={opt}
                          checked={svpFinalDecision === opt}
                          onChange={() => setSvpFinalDecision(opt)}
                          className="accent-primary"
                        />
                        <span className={`text-sm font-semibold ${opt === 'BID' ? 'text-green-600' : 'text-red-600'}`}>{opt}</span>
                      </label>
                    ))}
                    {svpFinalDecision && (
                      <button
                        className="text-xs text-muted-foreground underline ml-2"
                        onClick={() => setSvpFinalDecision('')}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Defaults to system recommendation ({recommendation}) if left blank.</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('scoring')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Revise Scores
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="gap-2"
                >
                  {downloading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Exporting…</>
                  ) : (
                    <><Download className="h-4 w-4" />Download Excel</>
                  )}
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
    <>
    <ActionProgressBar status={trackedStatus} />
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
                return (
                  <TableRow key={rec.opportunityRefNo}>
                    <TableCell className="font-mono text-xs">{rec.opportunityRefNo}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{rec.projectName || '—'}</TableCell>
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Download Excel"
                          onClick={() => {
                            const scores = buildScoresFromRecord(rec);
                            void exportBidDecisionExcel({
                              opportunityRefNo: rec.opportunityRefNo,
                              projectName: rec.projectName || '',
                              endUser: rec.endUser || '',
                              receivedFrom: rec.receivedFrom || '',
                              enquiryDate: rec.enquiryDate || '',
                              scopeOfWork: rec.scopeOfWork || '',
                              scores,
                              totalScore: Number(rec.decisionScore),
                              decision: rec.bidDecision,
                            });
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => openEditWizard(rec)}
                        >
                          {canSave ? 'Edit' : 'View'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
